import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AppError, ERROR_STATUS, parseJsonBody, withErrorHandler } from '../lib/server/errors';

test('AppError maps every category to its HTTP status', () => {
  assert.equal(new AppError('validation', 'x').status, 400);
  assert.equal(new AppError('auth', 'x').status, 401);
  assert.equal(new AppError('forbidden', 'x').status, 403);
  assert.equal(new AppError('not_found', 'x').status, 404);
  assert.equal(new AppError('conflict', 'x').status, 409);
  assert.equal(new AppError('rate_limit', 'x').status, 429);
  assert.equal(new AppError('internal', 'x').status, 500);
  assert.equal(Object.keys(ERROR_STATUS).length, 7);
});

test('thrown AppError becomes {code, message, requestId} with correct status', async () => {
  const handler = withErrorHandler('/api/test', async () => {
    throw new AppError('rate_limit', 'Too many requests.');
  });
  const response = await handler(new Request('http://localhost/api/test', { method: 'POST' }));
  assert.equal(response.status, 429);
  const body = await response.json();
  assert.equal(body.code, 'rate_limit');
  assert.equal(body.message, 'Too many requests.');
  assert.ok(typeof body.requestId === 'string' && body.requestId.length > 0);
  assert.equal(response.headers.get('x-request-id'), body.requestId);
});

test('unknown errors return a generic internal response and never leak details', async () => {
  const secret = 'connection to db://user:SECRETPASS failed at /Users/x/lib/db.ts:42';
  const handler = withErrorHandler('/api/test', async () => {
    throw new Error(secret);
  });
  // Silence the intentional error log for this test while capturing it.
  const originalError = console.error;
  let logged = '';
  console.error = (line: string) => {
    logged += line;
  };
  try {
    const response = await handler(new Request('http://localhost/api/test', { method: 'POST' }));
    assert.equal(response.status, 500);
    const text = await response.text();
    const body = JSON.parse(text);
    assert.equal(body.code, 'internal');
    // Client body must not contain the internal message, stack frames, or paths.
    assert.ok(!text.includes('SECRETPASS'));
    assert.ok(!text.includes('db://'));
    assert.ok(!text.includes('.ts:'));
    assert.equal(body.details, undefined);
    // Server-side log must contain requestId, path, code, and the stack.
    const entry = JSON.parse(logged);
    assert.equal(entry.path, '/api/test');
    assert.equal(entry.code, 'internal');
    assert.equal(entry.requestId, body.requestId);
    assert.ok(String(entry.stack).includes('Error'));
  } finally {
    console.error = originalError;
  }
});

test('validation details are included for validation errors only', async () => {
  const details = [{ field: 'image', message: 'required' }];
  const validation = withErrorHandler('/api/test', async () => {
    throw new AppError('validation', 'Invalid request.', details);
  });
  const validationBody = await (await validation(new Request('http://localhost/api/test'))).json();
  assert.deepEqual(validationBody.details, details);

  const internal = withErrorHandler('/api/test', async () => {
    throw new AppError('internal', 'Nope.', details);
  });
  const originalError = console.error;
  console.error = () => {};
  try {
    const internalBody = await (await internal(new Request('http://localhost/api/test'))).json();
    assert.equal(internalBody.details, undefined);
  } finally {
    console.error = originalError;
  }
});

test('successful responses carry the x-request-id header', async () => {
  const handler = withErrorHandler('/api/test', async () => Response.json({ ok: true }));
  const response = await handler(new Request('http://localhost/api/test'));
  assert.equal(response.status, 200);
  assert.ok(response.headers.get('x-request-id'));
});

test('parseJsonBody rejects malformed and non-object bodies as validation errors', async () => {
  for (const raw of ['not json', '[1,2]', '"str"']) {
    await assert.rejects(
      parseJsonBody(new Request('http://localhost/x', { method: 'POST', body: raw })),
      (error: unknown) => error instanceof AppError && error.code === 'validation',
    );
  }
  const ok = await parseJsonBody(
    new Request('http://localhost/x', { method: 'POST', body: JSON.stringify({ a: 1 }) }),
  );
  assert.deepEqual(ok, { a: 1 });
});

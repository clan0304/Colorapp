import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enforceRateLimit, requireUserId, RATE_LIMITS } from '../lib/server/auth';
import { AppError } from '../lib/server/errors';

function post(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/test', { method: 'POST', headers });
}

test('a request with no Authorization header is an auth error naming the action', async () => {
  const error = await requireUserId(post(), 'analyse a photo').catch((thrown) => thrown);
  assert.ok(error instanceof AppError);
  assert.equal(error.code, 'auth');
  assert.equal(error.status, 401);
  // The action is folded in so a 401 says which thing needs an account.
  assert.match(error.message, /analyse a photo/);
});

test('a non-Bearer Authorization header is rejected the same way', async () => {
  const error = await requireUserId(post({ authorization: 'Basic abc' }), 'save').catch(
    (thrown) => thrown,
  );
  assert.ok(error instanceof AppError);
  assert.equal(error.code, 'auth');
});

test('a missing signing key is internal, not auth, and never says why', async () => {
  const saved = process.env.CLERK_SECRET_KEY;
  delete process.env.CLERK_SECRET_KEY;
  try {
    const error = await requireUserId(post({ authorization: 'Bearer x.y.z' }), 'save').catch(
      (thrown) => thrown,
    );
    assert.ok(error instanceof AppError);
    // Misconfiguration on our side is never reported as the caller's fault.
    assert.equal(error.code, 'internal');
    assert.equal(error.status, 500);
    // Production responses must not expose infrastructure detail.
    assert.doesNotMatch(error.message, /CLERK|SECRET|env/i);
  } finally {
    if (saved === undefined) delete process.env.CLERK_SECRET_KEY;
    else process.env.CLERK_SECRET_KEY = saved;
  }
});

test('the rate limiter allows exactly `limit` calls, then throws 429', () => {
  const key = `test-limit-${Math.random()}`;
  const window = { limit: 3, windowMs: 60_000 };
  for (let call = 0; call < 3; call += 1) {
    assert.doesNotThrow(() => enforceRateLimit(key, window), `call ${call + 1} should pass`);
  }
  const error = (() => {
    try {
      enforceRateLimit(key, window);
      return null;
    } catch (thrown) {
      return thrown;
    }
  })();
  assert.ok(error instanceof AppError);
  assert.equal(error.code, 'rate_limit');
  assert.equal(error.status, 429);
  // The ceiling is ours to know; the message must not hand out the numbers.
  assert.doesNotMatch(error.message, /\d/);
});

test('separate keys hold separate budgets', () => {
  const window = { limit: 1, windowMs: 60_000 };
  const mine = `test-a-${Math.random()}`;
  const yours = `test-b-${Math.random()}`;
  enforceRateLimit(mine, window);
  // Exhausting one user's budget must not spend another's.
  assert.doesNotThrow(() => enforceRateLimit(yours, window));
  assert.throws(() => enforceRateLimit(mine, window));
});

test('the window slides — calls older than it stop counting', async () => {
  const key = `test-window-${Math.random()}`;
  const window = { limit: 1, windowMs: 5 };
  enforceRateLimit(key, window);
  assert.throws(() => enforceRateLimit(key, window), 'still inside the window');
  await new Promise((resolve) => setTimeout(resolve, 12));
  assert.doesNotThrow(() => enforceRateLimit(key, window), 'window should have slid past');
});

test('every metered route has a limit and a window', () => {
  // A route added to RATE_LIMITS with a zero or missing bound would silently
  // disable the limiter for it.
  for (const [route, window] of Object.entries(RATE_LIMITS)) {
    assert.ok(window.limit > 0, `${route}: limit must be positive`);
    assert.ok(window.windowMs > 0, `${route}: window must be positive`);
  }
});

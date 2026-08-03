import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makePhotoKey, R2_KEY_PATTERN } from '../lib/server/r2';

test('makePhotoKey output always matches the accepted key pattern', () => {
  for (let i = 0; i < 20; i++) {
    const key = makePhotoKey();
    assert.match(key, R2_KEY_PATTERN, key);
  }
});

test('key pattern rejects traversal and arbitrary object keys', () => {
  const rejected = [
    '../secrets/env',
    'uploads/../../other-bucket/x.jpg',
    'uploads/2026/07/24/not-a-uuid.jpg',
    'uploads/2026/07/24/3f8a1c2e-0000-0000-0000-000000000000.png', // wrong extension
    'other/2026/07/24/3f8a1c2e-0000-0000-0000-000000000000.jpg', // wrong prefix
    'uploads/2026/07/24/3f8a1c2e-0000-0000-0000-000000000000.jpg/extra',
    '',
  ];
  for (const key of rejected) {
    assert.equal(R2_KEY_PATTERN.test(key), false, `should reject: ${key}`);
  }
  assert.equal(
    R2_KEY_PATTERN.test('uploads/2026/07/24/3f8a1c2e-1a2b-4c3d-8e4f-000000000000.jpg'),
    true,
  );
});

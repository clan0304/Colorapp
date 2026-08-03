import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ENVELOPE_VERSION, signEnvelope, stableStringify, verifyEnvelope } from '../lib/server/envelope';
import { AnalysisSchema } from '../lib/diagnosis/types';

// The secret is read lazily at sign/verify time, so setting it here (after
// imports) is safe.
process.env.DIAGNOSIS_SIGNING_SECRET = 'test-secret-0123456789abcdef0123456789abcdef';

const analysis = AnalysisSchema.parse({
  image_quality: { face_visible: true, lighting_ok: true, notes: '' },
  undertone: 'warm',
  depth: 'medium',
  chroma: 'clear',
  initial_season: 'spring_warm',
  runner_up_season: 'autumn_warm',
  subtype: 'bright',
  confidence: 0.8,
  is_borderline: false,
  observed_colors: { skin_hex: '#E8C39E', hair_hex: '#5C4033', eye_hex: '#5C4033' },
  reasoning: 'test',
});

test('stableStringify is key-order independent', () => {
  assert.equal(stableStringify({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } }),
    stableStringify({ a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 }));
});

test('sign → verify round-trips', () => {
  const envelope = signEnvelope('3f8a1c2e-1a2b-4c3d-8e4f-000000000000', analysis);
  assert.equal(envelope.version, ENVELOPE_VERSION);
  assert.deepEqual(verifyEnvelope(envelope, analysis), { valid: true });
});

test('tampered analysis is rejected', () => {
  const envelope = signEnvelope('3f8a1c2e-1a2b-4c3d-8e4f-000000000000', analysis);
  const tampered = { ...analysis, initial_season: 'winter_cool' as const };
  const result = verifyEnvelope(envelope, tampered);
  assert.deepEqual(result, { valid: false, reason: 'bad_signature' });
});

test('tampered diagnosis id is rejected', () => {
  const envelope = signEnvelope('3f8a1c2e-1a2b-4c3d-8e4f-000000000000', analysis);
  const result = verifyEnvelope(
    { ...envelope, diagnosis_id: '3f8a1c2e-1a2b-4c3d-8e4f-111111111111' },
    analysis,
  );
  assert.deepEqual(result, { valid: false, reason: 'bad_signature' });
});

test('expired envelope is rejected', () => {
  const envelope = signEnvelope('3f8a1c2e-1a2b-4c3d-8e4f-000000000000', analysis);
  const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  // Re-signing with an old timestamp requires the secret; simulate by signing
  // fresh and only checking the TTL branch with a forged timestamp — the
  // signature check would also fail, but TTL must fail FIRST (cheaper).
  const result = verifyEnvelope({ ...envelope, issued_at: old }, analysis);
  assert.equal(result.valid, false);
  assert.equal((result as { reason: string }).reason, 'expired');
});

test('wrong version is rejected before signature work', () => {
  const envelope = signEnvelope('3f8a1c2e-1a2b-4c3d-8e4f-000000000000', analysis);
  const result = verifyEnvelope({ ...envelope, version: 99 }, analysis);
  assert.deepEqual(result, { valid: false, reason: 'version_mismatch' });
});

test('garbage signature is rejected without throwing', () => {
  const envelope = signEnvelope('3f8a1c2e-1a2b-4c3d-8e4f-000000000000', analysis);
  const result = verifyEnvelope({ ...envelope, signature: 'zz-not-hex' }, analysis);
  assert.equal(result.valid, false);
});

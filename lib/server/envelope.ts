import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Analysis } from '@/lib/diagnosis/types';

// The analyze→save envelope: /api/analyze generates the diagnosis UUID and
// signs {diagnosis_id, issued_at, version, analysis}. The client returns the
// envelope untouched at save time, so /api/save can trust the analysis and
// reuse the UUID as the idempotency key. Clients can read it, never forge it.

export const ENVELOPE_VERSION = 1;
export const ENVELOPE_TTL_MS = 24 * 60 * 60 * 1000; // saves must happen within a day

export type DiagnosisEnvelope = {
  diagnosis_id: string;
  issued_at: string; // ISO 8601
  version: number;
  signature: string; // hex HMAC-SHA256
};

function getSigningSecret(): string {
  const secret = process.env.DIAGNOSIS_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('DIAGNOSIS_SIGNING_SECRET is not configured (see .env.example).');
  }
  return secret;
}

/** Deterministic JSON: objects serialized with sorted keys, recursively. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function computeSignature(
  diagnosisId: string,
  issuedAt: string,
  version: number,
  analysis: Analysis,
): string {
  const payload = stableStringify({ diagnosis_id: diagnosisId, issued_at: issuedAt, version, analysis });
  return createHmac('sha256', getSigningSecret()).update(payload).digest('hex');
}

export function signEnvelope(diagnosisId: string, analysis: Analysis): DiagnosisEnvelope {
  const issuedAt = new Date().toISOString();
  return {
    diagnosis_id: diagnosisId,
    issued_at: issuedAt,
    version: ENVELOPE_VERSION,
    signature: computeSignature(diagnosisId, issuedAt, ENVELOPE_VERSION, analysis),
  };
}

export type EnvelopeVerification = { valid: true } | { valid: false; reason: string };

export function verifyEnvelope(
  envelope: DiagnosisEnvelope,
  analysis: Analysis,
): EnvelopeVerification {
  if (envelope.version !== ENVELOPE_VERSION) {
    return { valid: false, reason: 'version_mismatch' };
  }
  const issued = Date.parse(envelope.issued_at);
  if (Number.isNaN(issued)) return { valid: false, reason: 'bad_timestamp' };
  const age = Date.now() - issued;
  if (age > ENVELOPE_TTL_MS) return { valid: false, reason: 'expired' };
  if (age < -5 * 60 * 1000) return { valid: false, reason: 'issued_in_future' };

  const expected = computeSignature(
    envelope.diagnosis_id,
    envelope.issued_at,
    envelope.version,
    analysis,
  );
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(envelope.signature ?? '', 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: 'bad_signature' };
  }
  return { valid: true };
}

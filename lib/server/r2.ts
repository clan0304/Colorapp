import { AwsClient } from 'aws4fetch';

// Cloudflare R2 photo storage (S3-compatible API via aws4fetch).
// Privacy rule (CLAUDE.md): photos are temporary — deleted immediately after
// analysis, with a bucket lifecycle rule as the safety net.

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

/** Client-supplied keys must match exactly what makePhotoKey() produces. */
export const R2_KEY_PATTERN = /^uploads\/\d{4}\/\d{2}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;

export function getR2Config(): R2Config | null {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return null;
  return {
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET,
  };
}

function client(config: R2Config): AwsClient {
  return new AwsClient({
    service: 's3',
    region: 'auto',
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });
}

function objectUrl(config: R2Config, key: string): string {
  return `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}/${key}`;
}

export function makePhotoKey(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `uploads/${y}/${m}/${d}/${globalThis.crypto.randomUUID()}.jpg`;
}

/** Presigned PUT URL so the app uploads straight to R2 (Content-Type locked to JPEG). */
export async function presignPhotoUpload(
  config: R2Config,
  key: string,
  expiresSeconds = 600,
): Promise<string> {
  const url = new URL(objectUrl(config, key));
  url.searchParams.set('X-Amz-Expires', String(expiresSeconds));
  const signed = await client(config).sign(
    new Request(url, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' } }),
    { aws: { signQuery: true } },
  );
  return signed.url.toString();
}

/** Fetch an uploaded photo as base64, or null if it doesn't exist. */
export async function getPhotoBase64(config: R2Config, key: string): Promise<string | null> {
  const response = await client(config).fetch(objectUrl(config, key));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`R2 GET failed (${response.status}): ${await response.text()}`);
  return Buffer.from(await response.arrayBuffer()).toString('base64');
}

/** Delete a photo. Returns false (and lets the lifecycle rule catch it) on failure. */
export async function deletePhoto(config: R2Config, key: string): Promise<boolean> {
  const response = await client(config).fetch(objectUrl(config, key), { method: 'DELETE' });
  return response.ok || response.status === 404;
}

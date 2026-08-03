import { loadEnv } from './diagnosis/env';
import {
  deletePhoto,
  getPhotoBase64,
  getR2Config,
  makePhotoKey,
  presignPhotoUpload,
} from '../lib/server/r2';

// End-to-end R2 connectivity check: presign → PUT → GET → DELETE → verify gone.
// Usage: npm run r2:check
async function main() {
  loadEnv();
  const config = getR2Config();
  if (!config) {
    console.error(
      'R2 is not configured. Add R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET to .env',
    );
    process.exit(1);
  }
  console.log(`Bucket: ${config.bucket} (account ${config.accountId.slice(0, 6)}…)`);

  const key = makePhotoKey();
  console.log(`1. Presigning upload for ${key}`);
  const uploadUrl = await presignPhotoUpload(config, key, 120);

  console.log('2. Uploading test object via presigned URL');
  const payload = Buffer.from(`r2-check ${key}`);
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: payload,
  });
  if (!put.ok) throw new Error(`PUT failed (${put.status}): ${await put.text()}`);
  console.log('   ✓ uploaded');

  console.log('3. Reading it back server-side');
  const base64 = await getPhotoBase64(config, key);
  if (base64 === null) throw new Error('object not found after upload');
  if (Buffer.from(base64, 'base64').toString() !== payload.toString()) {
    throw new Error('downloaded content does not match');
  }
  console.log('   ✓ content matches');

  console.log('4. Deleting it (as /api/analyze does after analysis)');
  if (!(await deletePhoto(config, key))) throw new Error('delete failed');
  const gone = await getPhotoBase64(config, key);
  if (gone !== null) throw new Error('object still exists after delete');
  console.log('   ✓ deleted and verified gone');

  console.log('\nR2 is fully wired up. ✅');
  console.log('Reminder: add a bucket lifecycle rule (delete objects after 1 day) as the safety net.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

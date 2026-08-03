import { getR2Config, makePhotoKey, presignPhotoUpload } from '@/lib/server/r2';
import { AppError, withErrorHandler } from '@/lib/server/errors';

const UPLOAD_EXPIRES_SECONDS = 600;

export const POST = withErrorHandler('/api/upload', async () => {
  const config = getR2Config();
  if (!config) {
    // The app treats any error here as "use the base64 fallback" — but log it
    // as a real misconfiguration in environments where R2 should exist.
    throw new AppError('internal', 'Photo upload is not configured.');
  }
  const key = makePhotoKey();
  const uploadUrl = await presignPhotoUpload(config, key, UPLOAD_EXPIRES_SECONDS);
  return Response.json({ key, uploadUrl, expiresIn: UPLOAD_EXPIRES_SECONDS });
});

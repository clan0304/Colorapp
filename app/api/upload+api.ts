import { enforceRateLimit, RATE_LIMITS, requireUserId } from '@/lib/server/auth';
import { getR2Config, makePhotoKey, presignPhotoUpload } from '@/lib/server/r2';
import { AppError, withErrorHandler, type RequestContext } from '@/lib/server/errors';
import { getServiceClient } from '@/lib/server/supabase';

const UPLOAD_EXPIRES_SECONDS = 600;

export const POST = withErrorHandler('/api/upload', async (request, ctx: RequestContext) => {
  // Hands out a presigned write URL to our own bucket, so it is never anonymous:
  // an open one lets anybody fill R2 at our expense.
  const userId = await requireUserId(request, 'upload a photo');
  ctx.userId = userId;
  enforceRateLimit(`upload:${userId}`, RATE_LIMITS.upload);

  const config = getR2Config();
  if (!config) {
    // The app treats any error here as "use the base64 fallback" — but log it
    // as a real misconfiguration in environments where R2 should exist.
    throw new AppError('internal', 'Photo upload is not configured.');
  }
  const key = makePhotoKey();

  // Record who this key belongs to BEFORE handing out the presigned URL.
  // /api/analyze reads the object and then deletes it, and until this existed
  // it had nothing to check ownership against — a leaked key let one account
  // analyse and destroy another's photo. The row is the binding.
  const supabase = getServiceClient();
  const claim = await supabase.rpc('claim_photo_key', {
    p_user_id: userId,
    p_r2_key: key,
    p_expires_at: new Date(Date.now() + UPLOAD_EXPIRES_SECONDS * 1000).toISOString(),
  });
  if (claim.error) {
    throw new Error(`claim_photo_key RPC failed: ${claim.error.message}`); // → safe internal error
  }

  const uploadUrl = await presignPhotoUpload(config, key, UPLOAD_EXPIRES_SECONDS);
  return Response.json({ key, uploadUrl, expiresIn: UPLOAD_EXPIRES_SECONDS });
});

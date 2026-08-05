import { requireUserId } from '@/lib/server/auth';
import { AppError, withErrorHandler, type RequestContext } from '@/lib/server/errors';
import { getServiceClient } from '@/lib/server/supabase';
import { createClerkClient } from '@clerk/backend';

// Account deletion. Required by App Store Review Guideline 5.1.1(v): an app
// that supports account creation must offer deletion from inside the app.
// Signing out is not deletion.
//
// Order is load-bearing. Our rows are tombstoned FIRST, the Clerk user is
// deleted SECOND. Reversing it strands a user who half-succeeds: once the Clerk
// account is gone they have no token, so they could never retry the call that
// clears their data. This way a failure at the second step leaves an account
// that still signs in and can simply be deleted again — and the RPC is
// idempotent, so the retry is harmless.

export const DELETE = withErrorHandler('/api/account', async (request, ctx: RequestContext) => {
  const userId = await requireUserId(request, 'delete your account');
  ctx.userId = userId;

  const supabase = getServiceClient();
  const rpc = await supabase.rpc('delete_account', { p_user_id: userId });
  if (rpc.error) {
    throw new Error(`delete_account RPC failed: ${rpc.error.message}`); // → safe internal error
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new AppError('internal', 'Authentication is not configured.');
  }
  try {
    await createClerkClient({ secretKey }).users.deleteUser(userId);
  } catch (error) {
    // Logged here rather than left to the global handler, because that handler
    // only ever sees what is thrown — replacing the Clerk error with an AppError
    // would drop the reason the deletion actually failed.
    console.error(
      JSON.stringify({
        level: 'error',
        requestId: ctx.requestId,
        user: userId,
        path: '/api/account',
        message: 'clerk deleteUser failed after data was tombstoned',
        detail: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }),
    );
    // The rows are already tombstoned, so the user's records are gone from their
    // point of view. A conflict rather than a 500 says this is worth retrying —
    // and the RPC above is idempotent, so retrying is safe.
    throw new AppError(
      'conflict',
      'Your data was removed but the account could not be closed. Please try again.',
    );
  }

  return Response.json({ deleted: true });
});

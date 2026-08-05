import { verifyToken } from '@clerk/backend';
import { AppError } from './errors';

// Shared request auth for the API routes. Extracted from /api/save once three
// other routes needed the same check — see CLAUDE.md "Access tiers by login
// state": everything except the free clip run requires a signed-in account.

/**
 * Resolve the Clerk user id from the Authorization header, or throw.
 *
 * `action` is folded into the client-facing message so a 401 says which thing
 * needs an account ("Sign in to analyse a photo") rather than a bare refusal.
 * It must stay free of internals — this string reaches the client.
 */
export async function requireUserId(request: Request, action: string): Promise<string> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    throw new AppError('auth', `Sign in to ${action}.`);
  }
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    // Misconfiguration, not the caller's fault: never a 401, and never says why.
    throw new AppError('internal', 'Authentication is not configured.');
  }
  try {
    // authorizedParties pins the token's `azp` claim to origins we actually
    // serve. Without it a valid Clerk token minted for a DIFFERENT application
    // on the same instance is accepted here. Comma-separated env var so the
    // deployed origin can be added without a code change; when unset the check
    // is skipped, which is the correct behaviour for native-only development
    // where there is no browser origin to assert.
    const authorizedParties = process.env.CLERK_AUTHORIZED_PARTIES?.split(',')
      .map((party) => party.trim())
      .filter(Boolean);
    const payload = await verifyToken(token, {
      secretKey,
      ...(authorizedParties?.length ? { authorizedParties } : {}),
    });
    if (!payload.sub) throw new Error('token has no sub');
    return payload.sub;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('auth', 'Your session has expired. Please sign in again.');
  }
}

/**
 * Per-user sliding window, held in module memory.
 *
 * HONEST LIMITS: this is per instance. Any serverless deployment that runs more
 * than one of them gives each its own Map, so the effective ceiling is the limit
 * times the instance count, and a cold start resets it. It is a speed bump
 * against a runaway client or one abusive account — NOT a spend cap.
 *
 * The real protection is the auth check above: these routes cost money per call
 * (Claude for analyse, Creatomate for card), and requiring an account is what
 * stops an anonymous script from spending it. A durable per-account cap needs to
 * live in Postgres, and that is exactly the deferred credit ledger — when that
 * lands it replaces this, rather than sitting alongside it.
 */
const hits = new Map<string, number[]>();

export function enforceRateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): void {
  const now = Date.now();
  const cutoff = now - windowMs;

  // Prune every key, not just this one: without it the Map grows by one entry
  // per user forever, which is a leak in a long-lived instance.
  for (const [entryKey, times] of hits) {
    const live = times.filter((time) => time > cutoff);
    if (live.length === 0) hits.delete(entryKey);
    else hits.set(entryKey, live);
  }

  const recent = hits.get(key) ?? [];
  if (recent.length >= limit) {
    throw new AppError('rate_limit', 'You have done that a lot in a short time. Try again later.');
  }
  hits.set(key, [...recent, now]);
}

/** Windows are per user. Analyse is the expensive one, so it is the tightest. */
export const RATE_LIMITS = {
  analyze: { limit: 12, windowMs: 60 * 60 * 1000 },
  upload: { limit: 24, windowMs: 60 * 60 * 1000 },
  card: { limit: 20, windowMs: 60 * 60 * 1000 },
} as const;

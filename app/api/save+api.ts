import { requireUserId } from '@/lib/server/auth';
import { combine } from '@/lib/diagnosis/combine';
import { getDrapeRounds, PALETTE_VERSION } from '@/lib/diagnosis/palette';
import { AnalysisSchema, type DrapePick } from '@/lib/diagnosis/types';
import { verifyEnvelope, type DiagnosisEnvelope } from '@/lib/server/envelope';
import { AppError, parseJsonBody, withErrorHandler, type RequestContext } from '@/lib/server/errors';
import { getServiceClient } from '@/lib/server/supabase';

// Save a completed diagnosis. The client is never trusted with the outcome:
// we verify the signed envelope from /api/analyze, regenerate the draping
// rounds deterministically, recompute combine() from the raw a/b picks, and
// persist atomically + idempotently via the service-role RPC.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CARD_URL_PREFIX = 'https://cdn.creatomate.com/';

type RawPick = { round: number; choice: 'a' | 'b' | 'skip' };
const CHOICES = ['a', 'b', 'skip'] as const;

function validateEnvelope(raw: unknown): DiagnosisEnvelope {
  const env = raw as DiagnosisEnvelope | null;
  if (
    !env ||
    typeof env !== 'object' ||
    typeof env.diagnosis_id !== 'string' ||
    !UUID_PATTERN.test(env.diagnosis_id) ||
    typeof env.issued_at !== 'string' ||
    typeof env.version !== 'number' ||
    typeof env.signature !== 'string'
  ) {
    throw new AppError('validation', 'Invalid request.', [
      { field: 'envelope', message: 'malformed envelope' },
    ]);
  }
  return env;
}

function validatePicks(raw: unknown): RawPick[] {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 3) {
    throw new AppError('validation', 'Invalid request.', [
      { field: 'picks', message: 'expected 2-3 draping picks' },
    ]);
  }
  return raw.map((entry, index) => {
    const pick = entry as RawPick | null;
    if (!pick || typeof pick !== 'object' || pick.round !== index + 1 || !CHOICES.includes(pick.choice)) {
      throw new AppError('validation', 'Invalid request.', [
        { field: `picks[${index}]`, message: 'picks must be {round: 1..N in order, choice: a|b|skip}' },
      ]);
    }
    return { round: pick.round, choice: pick.choice };
  });
}

export const POST = withErrorHandler('/api/save', async (request, ctx: RequestContext) => {
  const body = await parseJsonBody(request);

  // 1. Authenticated users only (guest rows come from future async flows).
  const userId = await requireUserId(request, 'save your result');
  ctx.userId = userId;

  // 2. Validate + verify the analysis against the signed envelope.
  const parsedAnalysis = AnalysisSchema.safeParse(body.analysis);
  if (!parsedAnalysis.success) {
    throw new AppError('validation', 'Invalid request.', [
      { field: 'analysis', message: 'malformed analysis payload' },
    ]);
  }
  const analysis = parsedAnalysis.data;
  const envelope = validateEnvelope(body.envelope);
  const verification = verifyEnvelope(envelope, analysis);
  if (!verification.valid) {
    if (verification.reason === 'expired') {
      throw new AppError('validation', 'This result has expired. Please run the analysis again.');
    }
    throw new AppError('validation', 'This result could not be verified. Please run the analysis again.');
  }

  // 3. Recompute the outcome server-side from the raw picks.
  const picks = validatePicks(body.picks);
  const rounds = getDrapeRounds(analysis.initial_season, analysis.runner_up_season, picks.length);
  const drapePicks: DrapePick[] = picks.map((pick) => {
    const round = rounds[pick.round - 1];
    return {
      round: pick.round,
      choice: pick.choice,
      picked_season:
        pick.choice === 'skip' ? null : pick.choice === 'a' ? round.a.season : round.b.season,
    };
  });
  const result = combine(analysis, drapePicks);

  // 4. Card URL is cosmetic; accept only our render CDN, otherwise drop it.
  const cardImageUrl =
    typeof body.cardImageUrl === 'string' && body.cardImageUrl.startsWith(CARD_URL_PREFIX)
      ? body.cardImageUrl
      : null;

  // 5. Persist atomically + idempotently (envelope UUID = idempotency key).
  const supabase = getServiceClient();
  const rpc = await supabase.rpc('persist_completed_diagnosis', {
    p_diagnosis_id: envelope.diagnosis_id,
    p_user_id: userId,
    p_llm_initial: analysis.initial_season,
    p_llm_runner_up: analysis.runner_up_season,
    p_llm_confidence: analysis.confidence,
    p_is_borderline: analysis.is_borderline,
    p_final_season: result.final_season,
    p_subtype: result.final_subtype,
    p_final_confidence: result.final_confidence,
    p_combination_method: result.method,
    p_color_metadata: {
      undertone: analysis.undertone,
      depth: analysis.depth,
      chroma: analysis.chroma,
      observed_colors: analysis.observed_colors,
      reasoning: analysis.reasoning,
      image_quality: analysis.image_quality,
      palette_version: PALETTE_VERSION,
    },
    p_card_image_url: cardImageUrl,
    p_rounds: rounds.map((round, index) => ({
      round_number: round.round,
      axis: round.axis,
      color_option_a: round.a.hex,
      color_option_b: round.b.hex,
      option_a_season_type: round.a.season,
      option_b_season_type: round.b.season,
      user_choice: picks[index].choice,
    })),
  });
  if (rpc.error) {
    throw new Error(`persist RPC failed: ${rpc.error.message}`); // → safe internal error
  }

  return Response.json({
    diagnosisId: envelope.diagnosis_id,
    finalSeason: result.final_season,
    finalSubtype: result.final_subtype,
    finalConfidence: result.final_confidence,
    method: result.method,
  });
});

import { getCreatomateApiKey, renderToUrl } from '@/lib/card/render';
import { buildCardSource, type CardFormat, type CardInput } from '@/lib/card/templates';
import { BAND_LABELS, CONFIDENCE_BANDS, type ConfidenceBand } from '@/lib/diagnosis/combine';
import { SEASON_TYPES, type SeasonType } from '@/lib/diagnosis/types';
import { enforceRateLimit, RATE_LIMITS, requireUserId } from '@/lib/server/auth';
import { AppError, parseJsonBody, withErrorHandler, type RequestContext } from '@/lib/server/errors';

const FORMATS: CardFormat[] = ['story', 'square'];

export const POST = withErrorHandler('/api/card', async (request, ctx: RequestContext) => {
  // Creatomate bills per render, so this is a metered route like analyse.
  const userId = await requireUserId(request, 'create a share card');
  ctx.userId = userId;
  enforceRateLimit(`card:${userId}`, RATE_LIMITS.card);

  const body = await parseJsonBody(request);

  const season = body.season as SeasonType;
  if (!SEASON_TYPES.includes(season)) {
    throw new AppError('validation', 'Invalid request.', [
      { field: 'season', message: `must be one of: ${SEASON_TYPES.join(', ')}` },
    ]);
  }
  const format = (body.format ?? 'story') as CardFormat;
  if (!FORMATS.includes(format)) {
    throw new AppError('validation', 'Invalid request.', [
      { field: 'format', message: `must be one of: ${FORMATS.join(', ')}` },
    ]);
  }
  // The client sends the band key, not the copy — display strings stay
  // server-side so a caller cannot stamp arbitrary text onto a shareable card.
  const band = body.band as ConfidenceBand;
  if (!CONFIDENCE_BANDS.includes(band)) {
    throw new AppError('validation', 'Invalid request.', [
      { field: 'band', message: `must be one of: ${CONFIDENCE_BANDS.join(', ')}` },
    ]);
  }
  const asString = (field: string, fallback: string): string =>
    typeof body[field] === 'string' && (body[field] as string).length > 0 && (body[field] as string).length < 40
      ? (body[field] as string)
      : fallback;

  const input: CardInput = {
    season,
    subtype: asString('subtype', 'bright'),
    band: BAND_LABELS[band],
    undertone: asString('undertone', 'warm'),
    depth: asString('depth', 'medium'),
    chroma: asString('chroma', 'clear'),
  };

  let apiKey: string;
  try {
    apiKey = getCreatomateApiKey();
  } catch (error) {
    throw error instanceof Error && error.message.includes('CREATOMATE_API_KEY')
      ? new AppError('internal', 'Card rendering is not configured.')
      : error;
  }

  const url = await renderToUrl(buildCardSource(input, format), apiKey);
  return Response.json({ url, format });
});

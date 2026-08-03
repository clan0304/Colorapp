import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { SYSTEM_PROMPT, USER_PROMPT } from '@/lib/diagnosis/prompt';
import { AnalysisSchema, type Analysis } from '@/lib/diagnosis/types';
import { signEnvelope } from '@/lib/server/envelope';
import { AppError, parseJsonBody, withErrorHandler, type RequestContext } from '@/lib/server/errors';
import { deletePhoto, getPhotoBase64, getR2Config, R2_KEY_PATTERN } from '@/lib/server/r2';

/** Analysis + signed envelope; the envelope is returned untouched at save time. */
function analysisResponse(analysis: Analysis): Response {
  const diagnosisId = globalThis.crypto.randomUUID();
  return Response.json({ analysis, envelope: signEnvelope(diagnosisId, analysis) });
}

const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type MediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

const ALLOWED_MODELS = ['claude-sonnet-5', 'claude-haiku-4-5'] as const;
const DEFAULT_MODEL = 'claude-sonnet-5';

// ~12MB of base64 ≈ 9MB image — well above the resized photos the app sends.
const MAX_IMAGE_BASE64_LENGTH = 12_000_000;

async function runAnalysis(image: string, mediaType: MediaType, model: string): Promise<Analysis> {
  const client = new Anthropic();
  let response;
  try {
    response = await client.messages.parse({
      model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: USER_PROMPT },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(AnalysisSchema) },
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new AppError('rate_limit', 'The analysis service is busy. Please try again shortly.');
    }
    if (error instanceof Anthropic.BadRequestError) {
      throw new AppError('validation', 'The photo could not be processed. Try a different photo.');
    }
    throw error; // → global handler logs detail, client gets a safe internal error
  }

  if (response.stop_reason === 'refusal' || !response.parsed_output) {
    throw new AppError('validation', 'This photo could not be analyzed. Please try another one.');
  }
  return response.parsed_output;
}

export const POST = withErrorHandler('/api/analyze', async (request, ctx: RequestContext) => {
  const body = await parseJsonBody(request);

  const model = (body.model ?? DEFAULT_MODEL) as (typeof ALLOWED_MODELS)[number];
  if (!ALLOWED_MODELS.includes(model)) {
    throw new AppError('validation', 'Unsupported model.', [
      { field: 'model', message: `must be one of: ${ALLOWED_MODELS.join(', ')}` },
    ]);
  }

  // Preferred path: the app uploaded the photo straight to R2 and sends the key.
  if (typeof body.r2Key === 'string') {
    if (!R2_KEY_PATTERN.test(body.r2Key)) {
      throw new AppError('validation', 'Invalid request.', [
        { field: 'r2Key', message: 'malformed upload key' },
      ]);
    }
    const config = getR2Config();
    if (!config) throw new AppError('internal', 'Photo storage is not configured.');

    const image = await getPhotoBase64(config, body.r2Key);
    if (image === null) {
      throw new AppError('not_found', 'Uploaded photo not found. Please upload it again.');
    }
    try {
      const analysis = await runAnalysis(image, 'image/jpeg', model);
      return analysisResponse(analysis);
    } finally {
      // Privacy rule: the original photo is deleted the moment analysis is done
      // (success or failure). The bucket lifecycle rule is the safety net.
      const deleted = await deletePhoto(config, body.r2Key);
      if (!deleted) {
        console.warn(
          JSON.stringify({
            level: 'warn',
            requestId: ctx.requestId,
            path: '/api/analyze',
            message: 'failed to delete photo after analysis; lifecycle rule will remove it',
          }),
        );
      }
    }
  }

  // Fallback path: base64 in the request body (used until R2 is configured).
  const image = body.image;
  if (typeof image !== 'string' || image.length === 0) {
    throw new AppError('validation', 'Invalid request.', [
      { field: 'image', message: 'provide r2Key or a non-empty base64 image' },
    ]);
  }
  if (image.length > MAX_IMAGE_BASE64_LENGTH) {
    throw new AppError('validation', 'Image is too large.', [
      { field: 'image', message: 'resize the photo before uploading' },
    ]);
  }
  const mediaType = (body.mediaType ?? 'image/jpeg') as MediaType;
  if (!ALLOWED_MEDIA_TYPES.includes(mediaType)) {
    throw new AppError('validation', 'Unsupported image type.', [
      { field: 'mediaType', message: `must be one of: ${ALLOWED_MEDIA_TYPES.join(', ')}` },
    ]);
  }

  const analysis = await runAnalysis(image, mediaType, model);
  return analysisResponse(analysis);
});

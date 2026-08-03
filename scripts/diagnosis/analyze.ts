import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { SYSTEM_PROMPT, USER_PROMPT } from '../../lib/diagnosis/prompt';
import { AnalysisSchema, type Analysis } from '../../lib/diagnosis/types';

export const DEFAULT_MODEL = 'claude-sonnet-5';

const MEDIA_TYPES: Record<string, 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export function isSupportedImage(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() in MEDIA_TYPES;
}

export async function analyzeImage(
  client: Anthropic,
  imagePath: string,
  model: string = DEFAULT_MODEL,
): Promise<Analysis> {
  const mediaType = MEDIA_TYPES[path.extname(imagePath).toLowerCase()];
  if (!mediaType) {
    throw new Error(`Unsupported image type: ${imagePath} (use jpg/png/webp/gif)`);
  }
  const data = fs.readFileSync(imagePath).toString('base64');

  const response = await client.messages.parse({
    model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
          { type: 'text', text: USER_PROMPT },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(AnalysisSchema) },
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('The model declined to analyze this image.');
  }
  if (!response.parsed_output) {
    throw new Error(`No structured output returned (stop_reason: ${response.stop_reason})`);
  }
  const analysis = response.parsed_output;
  if (analysis.runner_up_season === analysis.initial_season) {
    throw new Error('Model returned identical initial and runner-up seasons.');
  }
  return analysis;
}

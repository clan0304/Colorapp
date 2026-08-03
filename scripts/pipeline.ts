import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { renderCards } from './card/run';
import { analyzeImage, DEFAULT_MODEL } from './diagnosis/analyze';
import { BAND_LABELS, combine, confidenceBand } from '../lib/diagnosis/combine';
import { runInteractiveDraping, simulatePicks } from './diagnosis/draping';
import { loadEnv } from './diagnosis/env';
import { getDrapeRounds } from '../lib/diagnosis/palette';
import { SEASON_LABELS, SEASON_TYPES, type SeasonType } from '../lib/diagnosis/types';
import type { CardFormat } from '../lib/card/templates';

function usage(): never {
  console.log(
    'Usage: npx tsx scripts/pipeline.ts <image> [--model <id>] [--rounds <2|3>] [--auto <season>]\n' +
      '                                  [--format story|square|both] [--out cards]\n' +
      '  Full Phase 1 + Phase 2 pipeline: photo → LLM read → draping → final result → Creatomate card.\n' +
      `  --auto simulates the draping picks for a user whose true season is <season> (${SEASON_TYPES.join(' | ')}).`,
  );
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const args = {
    image: '',
    model: DEFAULT_MODEL,
    rounds: 3,
    auto: null as SeasonType | null,
    format: 'both' as CardFormat | 'both',
    out: 'cards',
  };
  const rest = [...argv];
  while (rest.length) {
    const arg = rest.shift()!;
    const value = () => rest.shift() ?? usage();
    if (arg === '--model') args.model = value();
    else if (arg === '--rounds') args.rounds = Number(value());
    else if (arg === '--auto') {
      const v = value() as SeasonType;
      if (!SEASON_TYPES.includes(v)) usage();
      args.auto = v;
    } else if (arg === '--format') {
      const v = value();
      if (!['story', 'square', 'both'].includes(v)) usage();
      args.format = v as CardFormat | 'both';
    } else if (arg === '--out') args.out = value();
    else if (!args.image) args.image = arg;
    else usage();
  }
  if (!args.image || ![2, 3].includes(args.rounds)) usage();
  return args;
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const client = new Anthropic();

  console.log(`[1/4] Analyzing ${args.image} with ${args.model}...`);
  const analysis = await analyzeImage(client, args.image, args.model);
  console.log(
    `      ${SEASON_LABELS[analysis.initial_season]} (${analysis.confidence.toFixed(2)}), ` +
      `runner-up ${SEASON_LABELS[analysis.runner_up_season]}${analysis.is_borderline ? ' — borderline' : ''}`,
  );
  if (!analysis.image_quality.face_visible) {
    console.error(`No visible face: ${analysis.image_quality.notes}`);
    process.exit(2);
  }

  console.log('[2/4] Digital draping...');
  const rounds = getDrapeRounds(analysis.initial_season, analysis.runner_up_season, args.rounds);
  const picks = args.auto ? simulatePicks(rounds, args.auto) : await runInteractiveDraping(rounds);

  console.log('[3/4] Combining signals...');
  const result = combine(analysis, picks);
  console.log(
    `      Final: ${SEASON_LABELS[result.final_season]} / ${result.final_subtype} ` +
      `(${result.final_confidence.toFixed(2)}, ${result.method})`,
  );

  fs.mkdirSync(args.out, { recursive: true });
  const base = path.basename(args.image, path.extname(args.image));
  const resultPath = path.join(args.out, `${base}-result.json`);
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
  console.log(`      Saved ${resultPath}`);

  console.log('[4/4] Rendering result card(s) via Creatomate...');
  const files = await renderCards(
    {
      season: result.final_season,
      subtype: result.final_subtype,
      band: BAND_LABELS[confidenceBand(result)],
      undertone: result.llm.undertone,
      depth: result.llm.depth,
      chroma: result.llm.chroma,
    },
    args.format,
    args.out,
  );

  console.log('\nDone. Outputs:');
  for (const file of [resultPath, ...files]) console.log(`  ${file}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

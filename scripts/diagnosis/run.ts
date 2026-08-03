import Anthropic from '@anthropic-ai/sdk';
import { analyzeImage, DEFAULT_MODEL } from './analyze';
import { combine } from '../../lib/diagnosis/combine';
import { runInteractiveDraping, simulatePicks } from './draping';
import { loadEnv } from './env';
import { getDrapeRounds } from '../../lib/diagnosis/palette';
import { SEASON_LABELS, SEASON_TYPES, type SeasonType } from '../../lib/diagnosis/types';

function usage(): never {
  console.log(
    'Usage: npx tsx scripts/diagnosis/run.ts <image> [--model <id>] [--rounds <2|3>] [--auto <season>]\n' +
      '  --model   Claude model id (default: claude-sonnet-5; try claude-haiku-4-5 for cost comparison)\n' +
      '  --rounds  Number of draping rounds, 2 or 3 (default: 3)\n' +
      `  --auto    Skip interactive draping; simulate a user whose true season is <season> (${SEASON_TYPES.join(' | ')})`,
  );
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const args = { image: '', model: DEFAULT_MODEL, rounds: 3, auto: null as SeasonType | null };
  const rest = [...argv];
  while (rest.length) {
    const arg = rest.shift()!;
    if (arg === '--model') args.model = rest.shift() ?? usage();
    else if (arg === '--rounds') args.rounds = Number(rest.shift() ?? usage());
    else if (arg === '--auto') {
      const value = rest.shift() as SeasonType | undefined;
      if (!value || !SEASON_TYPES.includes(value)) usage();
      args.auto = value;
    } else if (!args.image) args.image = arg;
    else usage();
  }
  if (!args.image || ![2, 3].includes(args.rounds)) usage();
  return args;
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const client = new Anthropic();

  console.log(`Analyzing ${args.image} with ${args.model}...`);
  const analysis = await analyzeImage(client, args.image, args.model);

  console.log('\n=== LLM initial read ===');
  console.log(`Season:     ${SEASON_LABELS[analysis.initial_season]} / ${analysis.subtype}`);
  console.log(`Runner-up:  ${SEASON_LABELS[analysis.runner_up_season]}${analysis.is_borderline ? ' (borderline)' : ''}`);
  console.log(`Confidence: ${analysis.confidence.toFixed(2)}`);
  console.log(`Axes:       undertone=${analysis.undertone}, depth=${analysis.depth}, chroma=${analysis.chroma}`);
  console.log(`Reasoning:  ${analysis.reasoning}`);
  if (!analysis.image_quality.face_visible || !analysis.image_quality.lighting_ok) {
    console.log(`⚠ Image quality: ${analysis.image_quality.notes}`);
  }
  if (!analysis.image_quality.face_visible) {
    console.log('No visible face — skipping draping.');
    process.exit(2);
  }

  const rounds = getDrapeRounds(analysis.initial_season, analysis.runner_up_season, args.rounds);
  console.log('\n=== Digital draping ===');
  const picks = args.auto ? simulatePicks(rounds, args.auto) : await runInteractiveDraping(rounds);
  if (args.auto) {
    console.log(`(simulated picks for a true ${args.auto}: ${picks.map((p) => p.choice).join(', ')})`);
  }

  const result = combine(analysis, picks);
  console.log('\n=== Final result ===');
  console.log(`Season:     ${SEASON_LABELS[result.final_season]} / ${result.final_subtype}`);
  console.log(`Confidence: ${result.final_confidence.toFixed(2)}`);
  console.log(`Method:     ${result.method} (votes: primary=${result.votes.primary}, secondary=${result.votes.secondary})`);
  console.log('\nFull JSON:');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

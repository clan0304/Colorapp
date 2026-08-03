import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { analyzeImage, DEFAULT_MODEL, isSupportedImage } from './analyze';
import { combine } from '../../lib/diagnosis/combine';
import { simulatePicks } from './draping';
import { loadEnv } from './env';
import { getDrapeRounds } from '../../lib/diagnosis/palette';
import { SEASON_TYPES, type Analysis, type CombinedResult, type SeasonType } from '../../lib/diagnosis/types';

function usage(): never {
  console.log(
    'Usage: npx tsx scripts/diagnosis/consistency.ts <photo-dir> [--model <id>] [--truth <season>] [--concurrency <n>]\n' +
      '  Runs the full hybrid pipeline (LLM read + simulated draping) over 5-10 photos\n' +
      '  of the SAME person under different lighting/angles and reports stability.\n' +
      `  --truth   The person's known season (${SEASON_TYPES.join(' | ')}). Defaults to the majority LLM read.`,
  );
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const args = { dir: '', model: DEFAULT_MODEL, truth: null as SeasonType | null, concurrency: 3 };
  const rest = [...argv];
  while (rest.length) {
    const arg = rest.shift()!;
    if (arg === '--model') args.model = rest.shift() ?? usage();
    else if (arg === '--concurrency') args.concurrency = Number(rest.shift() ?? usage());
    else if (arg === '--truth') {
      const value = rest.shift() as SeasonType | undefined;
      if (!value || !SEASON_TYPES.includes(value)) usage();
      args.truth = value;
    } else if (!args.dir) args.dir = arg;
    else usage();
  }
  if (!args.dir || !Number.isInteger(args.concurrency) || args.concurrency < 1) usage();
  return args;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function majority(seasons: SeasonType[]): SeasonType {
  const counts = new Map<SeasonType, number>();
  for (const s of seasons) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function stability(seasons: SeasonType[]): number {
  const counts = new Map<SeasonType, number>();
  for (const s of seasons) counts.set(s, (counts.get(s) ?? 0) + 1);
  return Math.max(...counts.values()) / seasons.length;
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const files = fs
    .readdirSync(args.dir)
    .filter((f) => isSupportedImage(f))
    .map((f) => path.join(args.dir, f))
    .sort();
  if (files.length === 0) {
    console.error(`No images found in ${args.dir}`);
    process.exit(1);
  }
  console.log(`Analyzing ${files.length} photos with ${args.model} (concurrency ${args.concurrency})...`);

  const client = new Anthropic();
  const analyses = await mapPool(files, args.concurrency, async (file) => {
    try {
      const analysis = await analyzeImage(client, file, args.model);
      console.log(`  ✓ ${path.basename(file)} → ${analysis.initial_season} (${analysis.confidence.toFixed(2)})`);
      return { file, analysis, error: null as string | null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`  ✗ ${path.basename(file)} → ${message}`);
      return { file, analysis: null as Analysis | null, error: message };
    }
  });

  const ok = analyses.filter((r): r is { file: string; analysis: Analysis; error: null } => r.analysis !== null);
  if (ok.length === 0) {
    console.error('All analyses failed.');
    process.exit(1);
  }

  const truth = args.truth ?? majority(ok.map((r) => r.analysis.initial_season));
  console.log(`\nSimulating draping picks for a true ${truth}${args.truth ? '' : ' (majority LLM read)'}.\n`);

  const combined: { file: string; analysis: Analysis; result: CombinedResult }[] = ok.map((r) => {
    const rounds = getDrapeRounds(r.analysis.initial_season, r.analysis.runner_up_season);
    return { ...r, result: combine(r.analysis, simulatePicks(rounds, truth)) };
  });

  console.log('file'.padEnd(28) + 'initial'.padEnd(22) + 'runner-up'.padEnd(16) + 'final'.padEnd(22) + 'method');
  console.log('-'.repeat(100));
  for (const row of combined) {
    console.log(
      path.basename(row.file).padEnd(28) +
        `${row.analysis.initial_season} (${row.analysis.confidence.toFixed(2)})`.padEnd(22) +
        `${row.analysis.runner_up_season}${row.analysis.is_borderline ? '*' : ''}`.padEnd(16) +
        `${row.result.final_season} (${row.result.final_confidence.toFixed(2)})`.padEnd(22) +
        row.result.method,
    );
  }

  const initialStability = stability(combined.map((r) => r.analysis.initial_season));
  const finalStability = stability(combined.map((r) => r.result.final_season));
  console.log('\n=== Stability (share of photos agreeing with the modal season) ===');
  console.log(`LLM-only initial read: ${(initialStability * 100).toFixed(0)}%`);
  console.log(`Hybrid final result:   ${(finalStability * 100).toFixed(0)}%`);
  if (finalStability < 0.8) {
    console.log(
      '\n⚠ Final result is unstable across photos. Per CLAUDE.md Phase 1, consider the two-stage approach:\n' +
        '  extract pixel colors from facial regions and add a rule-based classifier in Lab color space.',
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

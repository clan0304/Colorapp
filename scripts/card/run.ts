import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from '../diagnosis/env';
import {
  BAND_LABELS,
  CONFIDENCE_BANDS,
  type ConfidenceBand,
} from '../../lib/diagnosis/combine';
import { SEASON_TYPES, type SeasonType } from '../../lib/diagnosis/types';
import { getCreatomateApiKey, renderImage } from '../../lib/card/render';
import { buildCardSource, type CardFormat, type CardInput } from '../../lib/card/templates';

function usage(): never {
  console.log(
    'Usage: npx tsx scripts/card/run.ts --season <season> [--subtype bright|light|mute|deep]\n' +
      '                                  [--band strong|good|close]\n' +
      '                                  [--undertone warm] [--depth medium] [--chroma clear]\n' +
      '                                  [--format story|square|both] [--out cards]\n' +
      `  season: ${SEASON_TYPES.join(' | ')}\n` +
      '  Renders a result card via Creatomate without running a diagnosis (template preview).',
  );
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const args = {
    season: null as SeasonType | null,
    subtype: 'bright',
    band: 'strong' as ConfidenceBand,
    undertone: 'warm',
    depth: 'medium',
    chroma: 'clear',
    format: 'both' as CardFormat | 'both',
    out: 'cards',
  };
  const rest = [...argv];
  while (rest.length) {
    const arg = rest.shift()!;
    const value = () => rest.shift() ?? usage();
    if (arg === '--season') {
      const v = value() as SeasonType;
      if (!SEASON_TYPES.includes(v)) usage();
      args.season = v;
    } else if (arg === '--subtype') args.subtype = value();
    else if (arg === '--band') {
      const v = value() as ConfidenceBand;
      if (!CONFIDENCE_BANDS.includes(v)) usage();
      args.band = v;
    }
    else if (arg === '--undertone') args.undertone = value();
    else if (arg === '--depth') args.depth = value();
    else if (arg === '--chroma') args.chroma = value();
    else if (arg === '--format') {
      const v = value();
      if (!['story', 'square', 'both'].includes(v)) usage();
      args.format = v as CardFormat | 'both';
    } else if (arg === '--out') args.out = value();
    else usage();
  }
  if (!args.season) usage();
  return args;
}

export async function renderCards(input: CardInput, format: CardFormat | 'both', outDir: string): Promise<string[]> {
  const apiKey = getCreatomateApiKey();
  const formats: CardFormat[] = format === 'both' ? ['story', 'square'] : [format];
  fs.mkdirSync(outDir, { recursive: true });
  const saved: string[] = [];
  for (const f of formats) {
    const source = buildCardSource(input, f);
    console.log(`Rendering ${input.season}/${input.subtype} ${f} card...`);
    const { buffer } = await renderImage(source, apiKey);
    const filePath = path.join(outDir, `${input.season}-${input.subtype}-${f}.png`);
    fs.writeFileSync(filePath, buffer);
    console.log(`  ✓ saved ${filePath}`);
    saved.push(filePath);
  }
  return saved;
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  await renderCards(
    {
      season: args.season!,
      subtype: args.subtype,
      band: BAND_LABELS[args.band],
      undertone: args.undertone,
      depth: args.depth,
      chroma: args.chroma,
    },
    args.format,
    args.out,
  );
}

// Only run as a CLI when executed directly (this module is also imported by pipeline.ts).
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

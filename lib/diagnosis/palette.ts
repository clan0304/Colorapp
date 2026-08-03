import { SEASON_TYPES, type DrapeAxis, type DrapeRound, type SeasonType, type Swatch } from './types';

/** Bump when swatch pairs change — stored with saved diagnoses for reproducibility. */
export const PALETTE_VERSION = 1;

type PairRound = { axis: DrapeAxis; swatches: [Swatch, Swatch] };

const sw = (season: SeasonType, hex: string, name: string): Swatch => ({ season, hex, name });

// Swatch pairs per season-pair, chosen to isolate the axis that differentiates
// the two candidates while keeping the other axes as matched as possible.
// Key is the canonical pair key (SEASON_TYPES order).
const PAIR_DRAPES: Record<string, PairRound[]> = {
  'spring_warm|summer_cool': [
    {
      axis: 'temperature',
      swatches: [sw('spring_warm', '#FF7F6A', 'warm coral'), sw('summer_cool', '#E8A2B8', 'cool rose')],
    },
    {
      axis: 'temperature',
      swatches: [sw('spring_warm', '#FFD34E', 'golden yellow'), sw('summer_cool', '#A7C7E7', 'powder blue')],
    },
    {
      axis: 'temperature',
      swatches: [sw('spring_warm', '#F5E6C8', 'warm ivory'), sw('summer_cool', '#EDEFF4', 'cool off-white')],
    },
  ],
  'spring_warm|autumn_warm': [
    {
      axis: 'chroma',
      swatches: [sw('spring_warm', '#FF6F61', 'clear coral'), sw('autumn_warm', '#C96F4A', 'terracotta')],
    },
    {
      axis: 'chroma',
      swatches: [sw('spring_warm', '#FFD34E', 'bright golden yellow'), sw('autumn_warm', '#C9A227', 'mustard')],
    },
    {
      axis: 'depth',
      swatches: [sw('spring_warm', '#9CCB3B', 'fresh apple green'), sw('autumn_warm', '#7A7A2F', 'olive')],
    },
  ],
  'spring_warm|winter_cool': [
    {
      axis: 'temperature',
      swatches: [sw('spring_warm', '#FF4F3F', 'warm tomato red'), sw('winter_cool', '#D0003C', 'blue-based red')],
    },
    {
      axis: 'temperature',
      swatches: [sw('spring_warm', '#40C8B0', 'warm turquoise'), sw('winter_cool', '#2E4BC6', 'royal blue')],
    },
    {
      axis: 'temperature',
      swatches: [sw('spring_warm', '#FFD34E', 'golden yellow'), sw('winter_cool', '#F7F4A8', 'icy lemon')],
    },
  ],
  'summer_cool|autumn_warm': [
    {
      axis: 'temperature',
      swatches: [sw('summer_cool', '#C48793', 'dusty rose'), sw('autumn_warm', '#C96F4A', 'terracotta')],
    },
    {
      axis: 'temperature',
      swatches: [sw('summer_cool', '#A7C7E7', 'powder blue'), sw('autumn_warm', '#B69B67', 'camel')],
    },
    {
      axis: 'temperature',
      swatches: [sw('summer_cool', '#B784A7', 'mauve'), sw('autumn_warm', '#A9502C', 'rust')],
    },
  ],
  'summer_cool|winter_cool': [
    {
      axis: 'chroma',
      swatches: [sw('summer_cool', '#C48793', 'dusty rose'), sw('winter_cool', '#D6248F', 'fuchsia')],
    },
    {
      axis: 'depth',
      swatches: [sw('summer_cool', '#A7C7E7', 'powder blue'), sw('winter_cool', '#2E4BC6', 'royal blue')],
    },
    {
      axis: 'depth',
      swatches: [sw('summer_cool', '#C3B1E1', 'soft lavender'), sw('winter_cool', '#5B2A86', 'deep purple')],
    },
  ],
  'autumn_warm|winter_cool': [
    {
      axis: 'temperature',
      swatches: [sw('autumn_warm', '#A9502C', 'rust'), sw('winter_cool', '#6E1F3A', 'burgundy')],
    },
    {
      axis: 'temperature',
      swatches: [sw('autumn_warm', '#7A7A2F', 'olive'), sw('winter_cool', '#0F7B5F', 'emerald')],
    },
    {
      axis: 'temperature',
      swatches: [sw('autumn_warm', '#B69B67', 'camel'), sw('winter_cool', '#232B4A', 'charcoal navy')],
    },
  ],
};

function pairKey(x: SeasonType, y: SeasonType): string {
  const [a, b] = [x, y].sort((p, q) => SEASON_TYPES.indexOf(p) - SEASON_TYPES.indexOf(q));
  return `${a}|${b}`;
}

/**
 * Build the draping rounds for a candidate pair. Which candidate appears as
 * option "a" alternates per round to reduce position bias.
 */
export function getDrapeRounds(primary: SeasonType, secondary: SeasonType, rounds = 3): DrapeRound[] {
  if (primary === secondary) {
    throw new Error(`Draping needs two distinct candidate seasons, got "${primary}" twice`);
  }
  const drapes = PAIR_DRAPES[pairKey(primary, secondary)];
  if (!drapes) throw new Error(`No drape palette defined for pair ${primary} / ${secondary}`);
  return drapes.slice(0, rounds).map((entry, i) => {
    const [first, second] = entry.swatches;
    const flip = i % 2 === 1;
    return {
      round: i + 1,
      axis: entry.axis,
      a: flip ? second : first,
      b: flip ? first : second,
    };
  });
}

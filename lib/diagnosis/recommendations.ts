import type { Analysis, ColorRec, SeasonType } from './types';

// Curated per-season recommendations shown on the result screen. Static by
// design: consistent quality, zero extra API cost, and easy to tune with a
// stylist later. Bump PALETTE_VERSION if these change materially.
//
// Order matters in `avoid`: the first entry is the season's sharpest contrast
// and is what the drape comparison drapes against. The rest are unordered.

export type { ColorRec };

type SeasonRecs = {
  avoid: ColorRec[];
  hair: ColorRec[];
};

export const SEASON_RECOMMENDATIONS: Record<SeasonType, SeasonRecs> = {
  spring_warm: {
    avoid: [
      { name: 'black', hex: '#1A1A1A' },
      { name: 'charcoal grey', hex: '#4A4E57' },
      { name: 'burgundy', hex: '#6E1F3A' },
      { name: 'mauve', hex: '#B784A7' },
      { name: 'icy blue', hex: '#A7C7E7' },
    ],
    hair: [
      { name: 'golden brown', hex: '#8B5A2B' },
      { name: 'honey blonde', hex: '#D9A760' },
      { name: 'warm caramel', hex: '#A9713B' },
      { name: 'light copper', hex: '#B0562F' },
    ],
  },
  summer_cool: {
    avoid: [
      { name: 'orange', hex: '#E2711D' },
      { name: 'mustard', hex: '#C9A227' },
      { name: 'camel', hex: '#B69B67' },
      { name: 'tomato red', hex: '#E63E2E' },
      { name: 'golden yellow', hex: '#FFD34E' },
    ],
    hair: [
      { name: 'ash brown', hex: '#6E5F55' },
      { name: 'cool beige blonde', hex: '#C9BCA6' },
      { name: 'rose brown', hex: '#8A5D5D' },
      { name: 'mushroom brown', hex: '#8D7F73' },
    ],
  },
  autumn_warm: {
    avoid: [
      { name: 'icy pink', hex: '#F3C9DD' },
      { name: 'fuchsia', hex: '#D6248F' },
      { name: 'pure white', hex: '#FFFFFF' },
      { name: 'royal blue', hex: '#2E4BC6' },
      { name: 'silver grey', hex: '#B8BFC7' },
    ],
    hair: [
      { name: 'chocolate brown', hex: '#5C4033' },
      { name: 'chestnut', hex: '#7B4A2D' },
      { name: 'copper red', hex: '#A9502C' },
      { name: 'dark golden brown', hex: '#6B4A2B' },
    ],
  },
  winter_cool: {
    avoid: [
      { name: 'mustard', hex: '#C9A227' },
      { name: 'orange', hex: '#E2711D' },
      { name: 'olive', hex: '#7A7A2F' },
      { name: 'camel beige', hex: '#C9B79C' },
      { name: 'salmon', hex: '#F0937B' },
    ],
    hair: [
      { name: 'blue black', hex: '#1B1B24' },
      { name: 'espresso', hex: '#3B2C26' },
      { name: 'dark ash brown', hex: '#4E4247' },
      { name: 'deep burgundy', hex: '#3E1F2A' },
    ],
  },
};

export type Temperature = 'warm' | 'cool';

export const SEASON_TEMPERATURE: Record<SeasonType, Temperature> = {
  spring_warm: 'warm',
  autumn_warm: 'warm',
  summer_cool: 'cool',
  winter_cool: 'cool',
};

/**
 * The two drape families for the shareable colour run.
 *
 * Temperature rather than season on purpose. Undertone is the primary axis the
 * diagnosis turns on, and it is the only one a stranger scrolling past the clip
 * can read: "warm vs cool" lands, "terracotta vs icy pink" does not. The cost
 * is that depth and chroma drop out, so the clip communicates "cool" rather
 * than "summer" — the season name is stamped on the frame to carry that.
 *
 * Names and hexes are reused from the palettes elsewhere in this folder so the
 * colour vocabulary stays consistent across the app.
 */
export const TEMPERATURE_DRAPES: Record<Temperature, ColorRec[]> = {
  warm: [
    { name: 'coral', hex: '#FF7F6A' },
    { name: 'golden yellow', hex: '#FFD34E' },
    { name: 'terracotta', hex: '#C96F4A' },
    { name: 'camel', hex: '#B69B67' },
  ],
  cool: [
    { name: 'cool rose', hex: '#E8A2B8' },
    { name: 'powder blue', hex: '#A7C7E7' },
    { name: 'mauve', hex: '#B784A7' },
    { name: 'true red', hex: '#D0003C' },
  ],
};

export type RunSwatch = ColorRec & { temperature: Temperature; suits: boolean };

/**
 * A swatch in the undiagnosed run. Same shape as RunSwatch minus `suits`: with
 * no diagnosis there is nothing to judge against, and the absence of the field
 * — rather than a `false` — is what stops the clip screen from rendering a
 * verdict it has not earned.
 */
export type NeutralSwatch = ColorRec & { temperature: Temperature };

/**
 * The colour run for a season: the opposite temperature first, then the user's
 * own.
 *
 * Ending on their own side is deliberate. The clip's payload is the result, so
 * it should close on the confirmation rather than the contrast — and a shot
 * where you look good is the one that actually gets posted.
 */
export function temperatureRun(season: SeasonType): RunSwatch[] {
  const mine = SEASON_TEMPERATURE[season];
  const other: Temperature = mine === 'warm' ? 'cool' : 'warm';
  return [other, mine].flatMap((temperature) =>
    TEMPERATURE_DRAPES[temperature].map((color) => ({
      ...color,
      temperature,
      suits: temperature === mine,
    })),
  );
}

/**
 * The colour run for someone who has not been diagnosed yet — the free entry
 * point from the home screen.
 *
 * It shows the same two blocks as temperatureRun() but names no winner, and
 * that is the point of it rather than a limitation. Seeing the contrast without
 * being able to name it is exactly the question the analysis answers, so a free
 * run that gave away the answer would remove the reason to go on to it. The
 * screen closes on the question instead of looping.
 *
 * Order is fixed at warm then cool for everyone, so every clip made from the
 * home screen has the same shape and the format stays recognisable. That does
 * hand the cool block a recency advantage in the viewer's own judgement; it is
 * accepted, because this run is a hook and never a measurement. Do not "fix" it
 * by randomising the order — a run that differs per user is not a format.
 */
export function neutralRun(): NeutralSwatch[] {
  return (['warm', 'cool'] as const).flatMap((temperature) =>
    TEMPERATURE_DRAPES[temperature].map((color) => ({ ...color, temperature })),
  );
}

export type JewelryRec = {
  metal: 'gold' | 'silver' | 'both';
  note: string;
};

/** Gold vs silver from the undertone read (season as fallback signal). */
export function getJewelryRec(analysis: Pick<Analysis, 'undertone'>): JewelryRec {
  switch (analysis.undertone) {
    case 'warm':
      return { metal: 'gold', note: 'Gold jewelry brings out your warm undertone.' };
    case 'cool':
      return { metal: 'silver', note: 'Silver and white gold flatter your cool undertone.' };
    case 'neutral_warm':
      return { metal: 'both', note: 'Both metals work — gold has a slight edge for you.' };
    case 'neutral_cool':
      return { metal: 'both', note: 'Both metals work — silver has a slight edge for you.' };
  }
}

import { SEASON_LABELS, type ColorRec, type SeasonType } from '../diagnosis/types';

/** Placeholder app name — the one string every shareable is stamped with. */
export const BRAND_NAME = 'PersonalColor';

export type CardFormat = 'story' | 'square';

export const CARD_DIMENSIONS: Record<CardFormat, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 }, // Instagram Story
  square: { width: 1080, height: 1080 }, // feed / share card
};

type SeasonTheme = {
  background: string;
  ink: string;
  sub: string;
  accent: string;
  /**
   * The 5 "best colors" swatch strip. Order matters: the first entry is the
   * season's signature color and is the one the drape comparison drapes with.
   */
  palette: ColorRec[];
};

export const SEASON_THEMES: Record<SeasonType, SeasonTheme> = {
  spring_warm: {
    background: '#FFF6EA',
    ink: '#5A3E2B',
    sub: '#8A6A4F',
    accent: '#FF7F6A',
    palette: [
      { name: 'coral', hex: '#FF7F6A' },
      { name: 'golden yellow', hex: '#FFD34E' },
      { name: 'apple green', hex: '#9CCB3B' },
      { name: 'warm turquoise', hex: '#40C8B0' },
      { name: 'peach', hex: '#FFB48F' },
    ],
  },
  summer_cool: {
    background: '#F4F1F7',
    ink: '#4A4458',
    sub: '#7A7290',
    accent: '#C48793',
    palette: [
      { name: 'cool rose', hex: '#E8A2B8' },
      { name: 'powder blue', hex: '#A7C7E7' },
      { name: 'soft lavender', hex: '#C3B1E1' },
      { name: 'dusty rose', hex: '#C48793' },
      { name: 'mauve', hex: '#B784A7' },
    ],
  },
  autumn_warm: {
    background: '#F7F0E4',
    ink: '#4B3621',
    sub: '#7A6248',
    accent: '#C96F4A',
    palette: [
      { name: 'terracotta', hex: '#C96F4A' },
      { name: 'mustard', hex: '#C9A227' },
      { name: 'olive', hex: '#7A7A2F' },
      { name: 'rust', hex: '#A9502C' },
      { name: 'camel', hex: '#B69B67' },
    ],
  },
  winter_cool: {
    background: '#EEF1F6',
    ink: '#1F2437',
    sub: '#4C5470',
    accent: '#D0003C',
    palette: [
      { name: 'true red', hex: '#D0003C' },
      { name: 'royal blue', hex: '#2E4BC6' },
      { name: 'deep purple', hex: '#5B2A86' },
      { name: 'emerald', hex: '#0F7B5F' },
      { name: 'charcoal navy', hex: '#232B4A' },
    ],
  },
};

export type CardInput = {
  season: SeasonType;
  subtype: string;
  /**
   * Qualitative standing, already resolved to display copy (e.g. "Strong
   * match"). Never a percentage: see `confidenceBand` for why the number it
   * replaced was not a measurement.
   */
  band: string;
  undertone: string;
  depth: string;
  chroma: string;
};

const RECT_PATH = 'M 0 0 L 100 0 L 100 100 L 0 100 Z';

type Layout = {
  overlineY: string;
  seasonY: string;
  subtypeY: string;
  captionY: string;
  swatchY: string;
  swatchHeight: string;
  axesY: string;
  matchY: string;
  footerY: string;
  seasonSize: number;
  subtypeSize: number;
  bodySize: number;
  smallSize: number;
};

const LAYOUTS: Record<CardFormat, Layout> = {
  story: {
    overlineY: '17%',
    seasonY: '25%',
    subtypeY: '31%',
    captionY: '45%',
    swatchY: '52%',
    swatchHeight: '11%',
    axesY: '63%',
    matchY: '70%',
    footerY: '93%',
    seasonSize: 104,
    subtypeSize: 48,
    bodySize: 34,
    smallSize: 28,
  },
  square: {
    overlineY: '13%',
    seasonY: '25%',
    subtypeY: '34%',
    captionY: '50%',
    swatchY: '60%',
    swatchHeight: '16%',
    axesY: '75%',
    matchY: '83%',
    footerY: '94%',
    seasonSize: 92,
    subtypeSize: 42,
    bodySize: 30,
    smallSize: 26,
  },
};

const FONT = 'Poppins';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Build a Creatomate RenderScript source (inline JSON, no pre-built template)
 * for a season result card. Metadata only — the user's photo never appears on
 * the card, so the card is safe to keep and share long-term.
 */
export function buildCardSource(input: CardInput, format: CardFormat): Record<string, unknown> {
  const { width, height } = CARD_DIMENSIONS[format];
  const layout = LAYOUTS[format];
  const theme = SEASON_THEMES[input.season];

  const swatches = theme.palette.map((color, i) => ({
    type: 'shape',
    path: RECT_PATH,
    x: `${16 + i * 17}%`,
    y: layout.swatchY,
    width: '14%',
    height: layout.swatchHeight,
    fill_color: color.hex,
  }));

  const text = (
    y: string,
    value: string,
    fontSize: number,
    color: string,
    weight: '400' | '600' | '700' = '400',
  ) => ({
    type: 'text',
    y,
    width: '86%',
    x_alignment: '50%',
    text: value,
    font_family: FONT,
    font_size: fontSize,
    font_weight: weight,
    fill_color: color,
  });

  return {
    output_format: 'png',
    width,
    height,
    elements: [
      { type: 'shape', path: RECT_PATH, x: '50%', y: '50%', width: '100%', height: '100%', fill_color: theme.background },
      text(layout.overlineY, 'PERSONAL COLOR ANALYSIS', layout.smallSize, theme.sub, '600'),
      text(layout.seasonY, SEASON_LABELS[input.season], layout.seasonSize, theme.ink, '700'),
      text(layout.subtypeY, `${capitalize(input.subtype)} Tone`, layout.subtypeSize, theme.accent, '600'),
      text(layout.captionY, 'YOUR BEST COLORS', layout.smallSize, theme.sub, '600'),
      ...swatches,
      text(
        layout.axesY,
        `${capitalize(input.undertone.replace('_', ' '))} undertone · ${capitalize(input.depth)} depth · ${capitalize(input.chroma)} chroma`,
        layout.bodySize,
        theme.sub,
      ),
      text(layout.matchY, input.band, layout.bodySize, theme.ink, '700'),
      text(layout.footerY, BRAND_NAME, layout.smallSize, theme.sub),
    ],
  };
}

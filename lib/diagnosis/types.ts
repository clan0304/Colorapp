import { z } from 'zod';

export const SEASON_TYPES = ['spring_warm', 'summer_cool', 'autumn_warm', 'winter_cool'] as const;
export type SeasonType = (typeof SEASON_TYPES)[number];

export const SEASON_LABELS: Record<SeasonType, string> = {
  spring_warm: 'Spring Warm',
  summer_cool: 'Summer Cool',
  autumn_warm: 'Autumn Warm',
  winter_cool: 'Winter Cool',
};

// MVP subtype taxonomy: two per season (8 total). Can expand to the 12-tone system later.
export const SUBTYPES: Record<SeasonType, readonly string[]> = {
  spring_warm: ['bright', 'light'],
  summer_cool: ['light', 'mute'],
  autumn_warm: ['mute', 'deep'],
  winter_cool: ['bright', 'deep'],
};

export const AnalysisSchema = z.object({
  image_quality: z.object({
    face_visible: z.boolean().describe('True only if a human face is clearly visible in the image'),
    lighting_ok: z
      .boolean()
      .describe('True if lighting is neutral enough to judge skin undertone reliably'),
    notes: z.string().describe('Short note on any image-quality issue affecting the analysis'),
  }),
  undertone: z
    .enum(['warm', 'cool', 'neutral_warm', 'neutral_cool'])
    .describe('Skin undertone axis'),
  depth: z.enum(['light', 'medium', 'deep']).describe('Overall value level of skin/hair/eyes'),
  chroma: z.enum(['clear', 'muted']).describe('How clear vs soft/greyed the coloring reads'),
  initial_season: z.enum(SEASON_TYPES).describe('Best-fit season from the photo alone'),
  runner_up_season: z
    .enum(SEASON_TYPES)
    .describe('The closest other season. Must differ from initial_season.'),
  subtype: z
    .enum(['bright', 'light', 'mute', 'deep'])
    .describe('Subtype within the initial season'),
  confidence: z
    .number()
    .describe('Confidence in initial_season, between 0 and 1'),
  is_borderline: z
    .boolean()
    .describe('True when runner_up_season is nearly as plausible as initial_season'),
  observed_colors: z.object({
    skin_hex: z.string().describe('Approximate average skin tone as #RRGGBB'),
    hair_hex: z.string().describe('Approximate hair color as #RRGGBB, or empty string'),
    eye_hex: z.string().describe('Approximate iris color as #RRGGBB, or empty string'),
  }),
  reasoning: z.string().describe('Concise reasoning tied to the undertone/depth/chroma axes'),
});

export type Analysis = z.infer<typeof AnalysisSchema>;

/** A named color shown to the user. Names are service copy — English only. */
export type ColorRec = { name: string; hex: string };

export type Swatch = {
  season: SeasonType;
  hex: string;
  name: string;
};

export type DrapeAxis = 'temperature' | 'depth' | 'chroma';

export type DrapeRound = {
  round: number;
  axis: DrapeAxis;
  a: Swatch;
  b: Swatch;
};

export type DrapePick = {
  round: number;
  choice: 'a' | 'b' | 'skip';
  /** null when the user skipped the round ("not sure") — counts as no vote. */
  picked_season: SeasonType | null;
};

export type CombinedResult = {
  final_season: SeasonType;
  final_subtype: string;
  final_confidence: number;
  method: 'llm_confirmed' | 'draping_shifted' | 'llm_default';
  votes: { primary: number; secondary: number };
  llm: Analysis;
  picks: DrapePick[];
};

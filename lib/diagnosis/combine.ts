import { SUBTYPES, type Analysis, type CombinedResult, type DrapePick, type SeasonType } from './types';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const CONFIDENCE_BANDS = ['strong', 'good', 'close'] as const;
export type ConfidenceBand = (typeof CONFIDENCE_BANDS)[number];

export const BAND_LABELS: Record<ConfidenceBand, string> = {
  strong: 'Strong match',
  good: 'Good match',
  close: 'Close call',
};

export const METHOD_NOTES: Record<CombinedResult['method'], string> = {
  llm_confirmed: 'Confirmed by your draping picks',
  draping_shifted: 'Adjusted based on your draping picks',
  llm_default: 'Based on photo analysis',
};

/**
 * How a result should be characterised to the user.
 *
 * Deliberately NOT derived from `final_confidence`. That number is a hand-tuned
 * heuristic with nothing calibrating it — Phase 1's consistency test has never
 * been run — so rendering it as "85% match" claimed a measured fit that does
 * not exist. It is also not one scale: `draping_shifted` computes it from the
 * vote margin alone and ignores the model's own confidence, while
 * `llm_confirmed` starts from that confidence and adds to it. With three
 * hardcoded rounds, `draping_shifted` could only ever emit 0.65, 0.75 or 0.85,
 * so the percent sign was advertising precision that was never there.
 *
 * These bands read off what actually happened instead: whether the photo read
 * and the user's picks agreed, and by how much. Revisit once the consistency
 * test gives the numbers meaning — the exact vote counts stay visible in the
 * result details either way.
 */
export function confidenceBand(result: CombinedResult): ConfidenceBand {
  const margin = Math.abs(result.votes.primary - result.votes.secondary);
  // No net vote — a tie, or every round skipped. Only one signal spoke.
  if (margin === 0) return 'close';
  if (result.method === 'llm_confirmed') {
    return margin >= 2 && !result.llm.is_borderline ? 'strong' : 'good';
  }
  // draping_shifted: the user overrode the photo read, so the two signals
  // disagreed by definition — never 'strong', however lopsided the vote.
  return margin >= 3 ? 'good' : 'close';
}

/**
 * Pick the best subtype for a season using the LLM's depth/chroma read.
 * Used when draping shifts the result to a season other than the LLM's pick.
 */
export function mapSubtype(analysis: Analysis, season: SeasonType): string {
  const options = SUBTYPES[season];
  if (season === analysis.initial_season && options.includes(analysis.subtype)) {
    return analysis.subtype;
  }
  if (analysis.depth === 'deep' && options.includes('deep')) return 'deep';
  if (analysis.depth === 'light' && options.includes('light')) return 'light';
  if (analysis.chroma === 'clear' && options.includes('bright')) return 'bright';
  if (analysis.chroma === 'muted' && options.includes('mute')) return 'mute';
  return options[0];
}

/**
 * Merge the LLM's photo-only read with the user's draping picks.
 *
 * Rules (per CLAUDE.md):
 * - Agreement raises confidence: each net vote for the LLM's pick adds a bump.
 * - Consistent disagreement shifts the result: if the user picks the runner-up
 *   more often than the primary, the runner-up wins with moderate confidence.
 * - A tie leaves the LLM's read in place with its original confidence.
 */
export function combine(analysis: Analysis, picks: DrapePick[]): CombinedResult {
  const primary = analysis.initial_season;
  const secondary = analysis.runner_up_season;

  let votesPrimary = 0;
  let votesSecondary = 0;
  for (const pick of picks) {
    if (pick.picked_season === primary) votesPrimary += 1;
    else if (pick.picked_season === secondary) votesSecondary += 1;
  }

  if (votesSecondary > votesPrimary) {
    const margin = votesSecondary - votesPrimary;
    return {
      final_season: secondary,
      final_subtype: mapSubtype(analysis, secondary),
      final_confidence: clamp(0.55 + 0.1 * margin, 0, 0.9),
      method: 'draping_shifted',
      votes: { primary: votesPrimary, secondary: votesSecondary },
      llm: analysis,
      picks,
    };
  }

  if (votesPrimary > votesSecondary) {
    const margin = votesPrimary - votesSecondary;
    return {
      final_season: primary,
      final_subtype: mapSubtype(analysis, primary),
      final_confidence: clamp(analysis.confidence + 0.08 * margin, 0, 0.95),
      method: 'llm_confirmed',
      votes: { primary: votesPrimary, secondary: votesSecondary },
      llm: analysis,
      picks,
    };
  }

  return {
    final_season: primary,
    final_subtype: mapSubtype(analysis, primary),
    final_confidence: analysis.confidence,
    method: 'llm_default',
    votes: { primary: votesPrimary, secondary: votesSecondary },
    llm: analysis,
    picks,
  };
}

import readline from 'node:readline/promises';
import type { DrapePick, DrapeRound, SeasonType, Swatch } from '../../lib/diagnosis/types';

const WARM_SEASONS: SeasonType[] = ['spring_warm', 'autumn_warm'];

function ansiBlock(hex: string): string {
  const int = parseInt(hex.replace('#', ''), 16);
  const r = (int >> 16) & 0xff;
  const g = (int >> 8) & 0xff;
  const b = int & 0xff;
  return `\x1b[48;2;${r};${g};${b}m      \x1b[0m`;
}

export function formatSwatch(swatch: Swatch): string {
  return `${ansiBlock(swatch.hex)} ${swatch.name} (${swatch.hex})`;
}

/**
 * Terminal stand-in for the app's draping screen: for each round the user says
 * which of the two swatches looks better against their face.
 */
export async function runInteractiveDraping(rounds: DrapeRound[]): Promise<DrapePick[]> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const picks: DrapePick[] = [];
  try {
    for (const round of rounds) {
      console.log(`\nRound ${round.round} (axis: ${round.axis})`);
      console.log(`  A) ${formatSwatch(round.a)}`);
      console.log(`  B) ${formatSwatch(round.b)}`);
      let choice: 'a' | 'b' | 'skip' | null = null;
      while (!choice) {
        const answer = (await rl.question('Which looks better against your face? [a/b/s=skip] '))
          .trim()
          .toLowerCase();
        if (answer === 'a' || answer === 'b') choice = answer;
        else if (answer === 's' || answer === 'skip') choice = 'skip';
      }
      picks.push({
        round: round.round,
        choice,
        picked_season: choice === 'skip' ? null : choice === 'a' ? round.a.season : round.b.season,
      });
    }
  } finally {
    rl.close();
  }
  return picks;
}

/**
 * Simulate a user whose true season is `trueSeason`: they pick the swatch from
 * their own season when it's on offer, otherwise the swatch sharing their
 * temperature, otherwise option A. Used by the consistency harness.
 */
export function simulatePicks(rounds: DrapeRound[], trueSeason: SeasonType): DrapePick[] {
  const isWarm = WARM_SEASONS.includes(trueSeason);
  return rounds.map((round) => {
    let choice: 'a' | 'b';
    if (round.a.season === trueSeason) choice = 'a';
    else if (round.b.season === trueSeason) choice = 'b';
    else if (WARM_SEASONS.includes(round.a.season) === isWarm) choice = 'a';
    else if (WARM_SEASONS.includes(round.b.season) === isWarm) choice = 'b';
    else choice = 'a';
    return {
      round: round.round,
      choice,
      picked_season: choice === 'a' ? round.a.season : round.b.season,
    };
  });
}

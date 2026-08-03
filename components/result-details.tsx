import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { normalizeHex } from '@/lib/diagnosis/color';
import { getDrapeRounds } from '@/lib/diagnosis/palette';
import { SEASON_LABELS, type CombinedResult, type DrapeAxis, type Swatch } from '@/lib/diagnosis/types';
import { cn } from '@/lib/utils';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';

/** What each swatch pair was actually testing, phrased for the user. */
const AXIS_LABELS: Record<DrapeAxis, string> = {
  temperature: 'Warm vs cool',
  depth: 'Light vs deep',
  chroma: 'Clear vs muted',
};

type Sample = { label: string; hex: string };

/**
 * The colors the model read off the photo, in the order they carry weight.
 * Hair and eyes come back as empty strings when a region is not readable, so
 * every value is normalized and anything that is not a hex is dropped.
 */
function observedSamples(result: CombinedResult): Sample[] {
  const { skin_hex, hair_hex, eye_hex } = result.llm.observed_colors;
  return (
    [
      { label: 'Skin', hex: normalizeHex(skin_hex) },
      { label: 'Hair', hex: normalizeHex(hair_hex) },
      { label: 'Eyes', hex: normalizeHex(eye_hex) },
    ] as const
  ).flatMap((sample) => (sample.hex ? [{ label: sample.label, hex: sample.hex }] : []));
}

/**
 * One sentence explaining what the picks did to the photo read — the same three
 * outcomes `combine()` can produce, said plainly.
 */
function drapingSummary(result: CombinedResult): string {
  const { votes } = result;
  const primary = SEASON_LABELS[result.llm.initial_season];
  const secondary = SEASON_LABELS[result.llm.runner_up_season];

  if (votes.primary + votes.secondary === 0) {
    return `You skipped every round, so this rests on the photo read alone.`;
  }
  switch (result.method) {
    case 'draping_shifted':
      return `You chose ${secondary} colors ${votes.secondary} times to ${votes.primary} — enough to move your result off the photo read of ${primary}.`;
    case 'llm_confirmed':
      return `You chose ${primary} colors ${votes.primary} times to ${votes.secondary}, backing the photo read and raising its confidence.`;
    case 'llm_default':
      return `Your picks split ${votes.primary}–${votes.secondary} between ${primary} and ${secondary}, so the photo read stands as it was.`;
  }
}

function SwatchChip({ swatch, picked }: { swatch: Swatch; picked: boolean }) {
  return (
    <View
      className={cn(
        'flex-1 flex-row items-center gap-2 rounded-xl border p-2',
        picked ? 'border-foreground' : 'border-border opacity-40',
      )}>
      <View
        className="h-7 w-7 rounded-lg border border-border"
        style={{ backgroundColor: swatch.hex }}
      />
      <Text className="flex-1 text-xs capitalize" numberOfLines={1}>
        {swatch.name}
      </Text>
      {picked ? <Icon as={CheckIcon} size={14} className="text-foreground" /> : null}
    </View>
  );
}

/**
 * The evidence behind the result: the colors read off the photo, and what the
 * user's own draping picks did with them. Collapsed by default so the share and
 * save actions stay reachable, but the summary line shows either way — the
 * user's contribution to the result is the part worth seeing without tapping.
 */
export function ResultDetails({ result }: { result: CombinedResult }) {
  const [open, setOpen] = React.useState(false);

  // getDrapeRounds is deterministic, so the rounds the user saw rebuild exactly
  // from the same candidate pair — no need to carry swatches through the flow.
  const rounds = React.useMemo(
    () => getDrapeRounds(result.llm.initial_season, result.llm.runner_up_season, 3),
    [result.llm.initial_season, result.llm.runner_up_season],
  );

  const samples = observedSamples(result);
  const skipped = result.picks.length - result.votes.primary - result.votes.secondary;

  return (
    <View className="overflow-hidden rounded-2xl border border-border bg-card">
      <Pressable
        onPress={() => setOpen((wasOpen) => !wasOpen)}
        className="gap-1.5 p-4 active:opacity-70">
        <View className="flex-row items-center gap-3">
          <Text className="flex-1 text-sm font-semibold">How we worked this out</Text>
          <Icon
            as={open ? ChevronUpIcon : ChevronDownIcon}
            size={18}
            className="text-muted-foreground"
          />
        </View>
        <Text className="text-sm leading-5 text-muted-foreground">{drapingSummary(result)}</Text>
      </Pressable>

      {open ? (
        <View className="gap-6 border-t border-border p-4">
          {samples.length > 0 ? (
            <View className="gap-3">
              <Text className="text-xs font-semibold tracking-wider text-muted-foreground">
                READ FROM YOUR PHOTO
              </Text>
              <View className="flex-row gap-2">
                {samples.map((sample) => (
                  <View key={sample.label} className="flex-1 items-center gap-1.5">
                    <View
                      className="h-12 w-full rounded-xl border border-border"
                      style={{ backgroundColor: sample.hex }}
                    />
                    <Text className="text-xs font-medium">{sample.label}</Text>
                    <Text className="text-[10px] text-muted-foreground">{sample.hex}</Text>
                  </View>
                ))}
              </View>
              <Text className="text-xs leading-4 text-muted-foreground">
                Sampled during analysis. These values are all we kept — your photo was deleted the
                moment the analysis finished.
              </Text>
            </View>
          ) : null}

          <View className="gap-3">
            <Text className="text-xs font-semibold tracking-wider text-muted-foreground">
              YOUR DRAPING PICKS
            </Text>
            {result.picks.map((pick) => {
              const round = rounds.find((candidate) => candidate.round === pick.round);
              if (!round) return null;
              return (
                <View key={pick.round} className="gap-1.5">
                  <Text className="text-[11px] text-muted-foreground">
                    Round {pick.round} · {AXIS_LABELS[round.axis]}
                    {pick.choice === 'skip' ? ' · skipped' : ''}
                  </Text>
                  <View className="flex-row gap-2">
                    <SwatchChip swatch={round.a} picked={pick.choice === 'a'} />
                    <SwatchChip swatch={round.b} picked={pick.choice === 'b'} />
                  </View>
                </View>
              );
            })}
            {skipped > 0 ? (
              <Text className="text-xs leading-4 text-muted-foreground">
                {skipped === 1 ? 'The skipped round counts' : `The ${skipped} skipped rounds count`}{' '}
                as no vote — we never guess a pick you did not make.
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

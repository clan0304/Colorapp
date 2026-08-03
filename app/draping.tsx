import { Text } from '@/components/ui/text';
import { combine } from '@/lib/diagnosis/combine';
import { getDrapeRounds } from '@/lib/diagnosis/palette';
import type { DrapePick } from '@/lib/diagnosis/types';
import { useFlow } from '@/lib/flow-store';
import { Redirect, useRouter } from 'expo-router';
import * as React from 'react';
import { Image, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DrapingScreen() {
  const router = useRouter();
  const { photoUri, analysis, setResult } = useFlow();
  const [roundIndex, setRoundIndex] = React.useState(0);
  const picksRef = React.useRef<DrapePick[]>([]);

  const rounds = React.useMemo(
    () => (analysis ? getDrapeRounds(analysis.initial_season, analysis.runner_up_season, 3) : []),
    [analysis],
  );

  if (!analysis || !photoUri) return <Redirect href="/" />;

  const round = rounds[roundIndex];

  function pick(choice: 'a' | 'b' | 'skip') {
    if (!analysis) return;
    const current = rounds[roundIndex];
    picksRef.current.push({
      round: current.round,
      choice,
      picked_season:
        choice === 'skip' ? null : choice === 'a' ? current.a.season : current.b.season,
    });
    if (roundIndex + 1 < rounds.length) {
      setRoundIndex(roundIndex + 1);
    } else {
      setResult(combine(analysis, picksRef.current));
      router.replace('/result');
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <View className="flex-1 gap-6 p-5">
        <View className="items-center gap-1.5">
          <Text className="text-xl font-semibold">Which color suits you better?</Text>
          <Text className="max-w-sm text-center text-sm text-muted-foreground">
            Pick the side where your skin looks brighter and more even — judge your{' '}
            <Text className="text-sm font-semibold text-foreground">face</Text>, not the color.
            Shadows and blemishes stand out more under the wrong color.
          </Text>
        </View>

        {/* Virtual draping: the same photo side by side, each with one of the
            candidate colors "draped" under the chin. */}
        <View className="flex-1 flex-row items-stretch gap-4">
          {(['a', 'b'] as const).map((side) => {
            const swatch = side === 'a' ? round.a : round.b;
            return (
              <Pressable
                key={side}
                onPress={() => pick(side)}
                className="flex-1 overflow-hidden rounded-2xl border border-border active:opacity-80">
                <View className="flex-1 overflow-hidden">
                  <Image
                    source={{ uri: photoUri }}
                    className="absolute inset-0 h-full w-full"
                    resizeMode="cover"
                  />
                  <View
                    className="absolute inset-x-[-12%] bottom-[-4%]"
                    style={{
                      height: '32%',
                      backgroundColor: swatch.hex,
                      borderTopLeftRadius: 999,
                      borderTopRightRadius: 999,
                    }}
                  />
                </View>
                <View className="items-center bg-card px-2 py-3">
                  <View className="flex-row items-center gap-2">
                    <View className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: swatch.hex }} />
                    <Text className="text-sm font-medium capitalize">{swatch.name}</Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Pressable onPress={() => pick('skip')} className="items-center py-1 active:opacity-60">
          <Text className="text-sm text-muted-foreground underline">
            Not sure — skip this round
          </Text>
        </Pressable>

        <View className="flex-row items-center justify-center gap-2 pb-2">
          {rounds.map((r, i) => (
            <View
              key={r.round}
              className={`h-2 w-2 rounded-full ${i <= roundIndex ? 'bg-foreground' : 'bg-muted'}`}
            />
          ))}
          <Text className="ml-2 text-xs text-muted-foreground">
            Round {roundIndex + 1} of {rounds.length}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

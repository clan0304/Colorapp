import { DrapeCompare } from '@/components/drape-compare';
import { ResultDetails } from '@/components/result-details';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { postJson } from '@/lib/api';
import { SEASON_THEMES } from '@/lib/card/templates';
import { BAND_LABELS, confidenceBand, METHOD_NOTES } from '@/lib/diagnosis/combine';
import { getJewelryRec, SEASON_RECOMMENDATIONS } from '@/lib/diagnosis/recommendations';
import { SEASON_LABELS } from '@/lib/diagnosis/types';
import { useFlow } from '@/lib/flow-store';
import { useAuth } from '@clerk/clerk-expo';
import * as FileSystem from 'expo-file-system/legacy';
import { Redirect, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { VideoIcon } from 'lucide-react-native';
import * as React from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ResultScreen() {
  const router = useRouter();
  const { result, envelope, photoUri, reset } = useFlow();
  const { isSignedIn, getToken } = useAuth();
  const [cardUrl, setCardUrl] = React.useState<string | null>(null);
  const [rendering, setRendering] = React.useState(false);
  const [saveState, setSaveState] = React.useState<'idle' | 'saving' | 'saved'>('idle');

  if (!result) return <Redirect href="/" />;

  const theme = SEASON_THEMES[result.final_season];
  const recs = SEASON_RECOMMENDATIONS[result.final_season];
  const jewelry = getJewelryRec(result.llm);

  async function saveResult() {
    if (!result || !envelope) return;
    if (!isSignedIn) {
      Alert.alert('Sign in to save', 'Your result will be saved to your account.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign In', onPress: () => router.push('/sign-in') },
      ]);
      return;
    }
    setSaveState('saving');
    try {
      const token = await getToken();
      await postJson(
        '/api/save',
        {
          analysis: result.llm,
          envelope,
          picks: result.picks.map(({ round, choice }) => ({ round, choice })),
          cardImageUrl: cardUrl,
        },
        { token },
      );
      setSaveState('saved');
    } catch (error) {
      setSaveState('idle');
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  async function shareCard() {
    if (!cardUrl) return;
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing is not available on this device.');
        return;
      }
      const target = `${FileSystem.cacheDirectory}personal-color-card.png`;
      const downloaded = await FileSystem.downloadAsync(cardUrl, target);
      await Sharing.shareAsync(downloaded.uri, { mimeType: 'image/png' });
    } catch (error) {
      Alert.alert('Share failed', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  async function createCard() {
    if (!result) return;
    setRendering(true);
    try {
      const { url } = await postJson<{ url: string }>(
        '/api/card',
        {
          season: result.final_season,
          subtype: result.final_subtype,
          band: confidenceBand(result),
          undertone: result.llm.undertone,
          depth: result.llm.depth,
          chroma: result.llm.chroma,
          format: 'story',
        },
        // Creatomate bills per render, so this route is authenticated too.
        { token: await getToken() },
      );
      setCardUrl(url);
    } catch (error) {
      Alert.alert('Card failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setRendering(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView contentContainerClassName="gap-6 p-5">
        <View
          className="items-center gap-2 rounded-3xl p-8"
          style={{ backgroundColor: theme.background }}>
          <Text className="text-xs font-semibold tracking-widest" style={{ color: theme.sub }}>
            YOUR SEASON
          </Text>
          <Text className="text-4xl font-bold" style={{ color: theme.ink }}>
            {SEASON_LABELS[result.final_season]}
          </Text>
          <Text className="text-lg font-semibold capitalize" style={{ color: theme.accent }}>
            {result.final_subtype} Tone
          </Text>
          <Text className="mt-1 text-sm" style={{ color: theme.sub }}>
            {BAND_LABELS[confidenceBand(result)]} · {METHOD_NOTES[result.method]}
          </Text>
        </View>

        {photoUri ? <DrapeCompare photoUri={photoUri} result={result} /> : null}

        <View className="gap-3">
          <Text className="text-sm font-semibold text-muted-foreground">YOUR BEST COLORS</Text>
          <View className="flex-row gap-2">
            {theme.palette.map((color) => (
              <View
                key={color.hex}
                className="h-16 flex-1 rounded-xl"
                style={{ backgroundColor: color.hex }}
              />
            ))}
          </View>
          <Text className="text-sm text-muted-foreground">
            {result.llm.undertone.replace('_', ' ')} undertone · {result.llm.depth} depth ·{' '}
            {result.llm.chroma} chroma
          </Text>
        </View>

        <View className="gap-3">
          <Text className="text-sm font-semibold text-muted-foreground">COLORS TO AVOID</Text>
          <View className="flex-row gap-2">
            {recs.avoid.map((rec) => (
              <View key={rec.hex} className="flex-1 items-center gap-1">
                <View
                  className="h-10 w-full rounded-lg opacity-90"
                  style={{ backgroundColor: rec.hex }}
                />
                <Text className="text-center text-[10px] capitalize text-muted-foreground">
                  {rec.name}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View className="gap-3">
          <Text className="text-sm font-semibold text-muted-foreground">HAIR COLOR IDEAS</Text>
          <View className="flex-row flex-wrap gap-2">
            {recs.hair.map((rec) => (
              <View
                key={rec.hex}
                className="flex-row items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-1.5 pr-3">
                <View className="h-6 w-6 rounded-full" style={{ backgroundColor: rec.hex }} />
                <Text className="text-sm capitalize">{rec.name}</Text>
              </View>
            ))}
          </View>
          <Text className="text-xs text-muted-foreground">
            Show these to your hair designer — they map directly to your season.
          </Text>
        </View>

        <View className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-4">
          <View className="flex-row">
            {(jewelry.metal === 'gold' || jewelry.metal === 'both') && (
              <View className="h-8 w-8 rounded-full border border-border" style={{ backgroundColor: '#E8C258' }} />
            )}
            {(jewelry.metal === 'silver' || jewelry.metal === 'both') && (
              <View
                className="h-8 w-8 rounded-full border border-border"
                style={{ backgroundColor: '#C9CDD4', marginLeft: jewelry.metal === 'both' ? -8 : 0 }}
              />
            )}
          </View>
          <Text className="flex-1 text-sm text-muted-foreground">{jewelry.note}</Text>
        </View>

        <ResultDetails result={result} />

        <View className="gap-3">
          <Text className="text-sm font-semibold text-muted-foreground">MAKE A CLIP</Text>
          <Text className="text-sm text-muted-foreground">
            Your palette draped under your chin on your live camera, changing on its own — screen
            record it and post it. Nothing is captured or uploaded.
          </Text>
          <Button size="lg" onPress={() => router.push('/clip')}>
            <Icon as={VideoIcon} size={16} />
            <Text>Start the colour run</Text>
          </Button>
        </View>

        {cardUrl ? (
          <View className="items-center gap-3">
            <Image
              source={{ uri: cardUrl }}
              className="aspect-[9/16] w-56 rounded-2xl"
              resizeMode="cover"
            />
            <Button size="lg" className="w-full" onPress={shareCard}>
              <Text>Share Card</Text>
            </Button>
          </View>
        ) : (
          <Button size="lg" onPress={createCard} disabled={rendering}>
            {rendering ? <ActivityIndicator color="white" /> : <Text>Create Share Card</Text>}
          </Button>
        )}

        <Button
          variant="secondary"
          size="lg"
          onPress={saveResult}
          disabled={saveState !== 'idle' || !envelope}>
          {saveState === 'saving' ? (
            <ActivityIndicator />
          ) : (
            <Text>{saveState === 'saved' ? 'Saved ✓' : 'Save Result'}</Text>
          )}
        </Button>

        <Button
          variant="outline"
          onPress={() => {
            reset();
            router.replace('/');
          }}>
          <Text>Start Over</Text>
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { SEASON_THEMES } from '@/lib/card/templates';
import { SEASON_LABELS, type SeasonType } from '@/lib/diagnosis/types';
import { useSupabase } from '@/lib/use-supabase';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import * as React from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// final_confidence is stored but deliberately not fetched: it was shown here as
// "N% match", which was never a measurement (see `confidenceBand`), and the
// qualitative band that replaced it needs the per-round vote counts, which this
// table does not keep. Season, subtype and date are enough for a list row.
type DiagnosisRow = {
  id: string;
  final_season_type: SeasonType;
  subtype: string;
  created_at: string;
};

export default function HistoryScreen() {
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useAuth();
  const supabase = useSupabase();
  const [rows, setRows] = React.useState<DiagnosisRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    (async () => {
      const { data, error: queryError } = await supabase
        .from('diagnoses')
        .select('id, final_season_type, subtype, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (cancelled) return;
      if (queryError) setError(queryError.message);
      else setRows((data ?? []) as DiagnosisRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, supabase]);

  if (!isLoaded) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (!isSignedIn) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
        <View className="flex-1 items-center justify-center gap-4 p-6">
          <Text className="text-lg font-semibold">Sign in to see your results</Text>
          <Button onPress={() => router.push('/sign-in')}>
            <Text>Sign In</Text>
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <View className="flex-1 p-5">
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="text-sm text-muted-foreground">
            {user.primaryEmailAddress?.emailAddress ?? 'Signed in'}
          </Text>
          <Button size="sm" variant="ghost" onPress={() => signOut()}>
            <Text>Sign Out</Text>
          </Button>
        </View>

        {error ? (
          <View className="items-center gap-2 py-10">
            <Text className="text-center text-destructive">Could not load results.</Text>
            <Text className="text-center text-xs text-muted-foreground">{error}</Text>
            <Text className="max-w-xs text-center text-xs text-muted-foreground">
              If this mentions a JWT or role, the Clerk ↔ Supabase third-party auth connection
              may not be set up yet (see supabase/README.md).
            </Text>
          </View>
        ) : rows === null ? (
          <ActivityIndicator className="py-10" />
        ) : rows.length === 0 ? (
          <View className="items-center gap-3 py-10">
            <Text className="text-muted-foreground">No saved results yet.</Text>
            <Button onPress={() => router.push('/capture')}>
              <Text>Start an Analysis</Text>
            </Button>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(row) => row.id}
            ItemSeparatorComponent={() => <View className="h-3" />}
            renderItem={({ item }) => {
              const theme = SEASON_THEMES[item.final_season_type];
              return (
                <View
                  className="flex-row items-center gap-4 rounded-2xl border border-border p-4"
                  style={{ backgroundColor: theme.background }}>
                  <View className="h-10 w-10 rounded-full" style={{ backgroundColor: theme.accent }} />
                  <View className="flex-1">
                    <Text className="text-base font-semibold" style={{ color: theme.ink }}>
                      {SEASON_LABELS[item.final_season_type]}
                    </Text>
                    <Text className="text-sm capitalize" style={{ color: theme.sub }}>
                      {item.subtype} tone
                    </Text>
                  </View>
                  <Text className="text-xs" style={{ color: theme.sub }}>
                    {new Date(item.created_at).toLocaleDateString()}
                  </Text>
                </View>
              );
            }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { BRAND_NAME, SEASON_THEMES } from '@/lib/card/templates';
import { SEASON_TYPES } from '@/lib/diagnosis/types';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const router = useRouter();
  const { isSignedIn } = useAuth();

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center gap-10 p-6">
        <View className="items-center gap-3">
          <View className="flex-row gap-1.5">
            {SEASON_TYPES.map((season) => (
              <View
                key={season}
                className="h-10 w-10 rounded-full"
                style={{ backgroundColor: SEASON_THEMES[season].accent }}
              />
            ))}
          </View>
          {/* Single source of truth — the same string stamps the clip, the
              result card and the saved stills, so the wordmark cannot drift
              between surfaces. */}
          <Text className="mt-4 text-center text-4xl font-bold">{BRAND_NAME}</Text>
          <Text className="max-w-xs text-center text-base text-muted-foreground">
            Find your season with a photo and a quick color draping — then meet hair designers who
            match your palette.
          </Text>
        </View>

        {/* Draping leads and analysis follows, deliberately. The run needs no
            photo, no sign-up and no API call, so it is both the cheapest thing
            to offer a first-time visitor and the one that makes them ask which
            side suited them — which is the question analysis is here to answer.
            Putting the upload first asks for the hardest thing on arrival. */}
        <View className="w-full max-w-sm gap-3">
          <Button size="lg" onPress={() => router.push('/clip')}>
            <Text>Try Warm vs Cool</Text>
          </Button>
          {/* Analysis needs an account; the clip run above never does. The
              routes it calls cost money per request and are authenticated
              server-side, so sending a signed-out user to the camera would only
              fail at the upload. */}
          <Button
            size="lg"
            variant="outline"
            onPress={() => router.push(isSignedIn ? '/capture' : '/sign-in')}>
            <Text>Start Color Analysis</Text>
          </Button>
          <Button
            variant="ghost"
            onPress={() => router.push(isSignedIn ? '/history' : '/sign-in')}>
            <Text>{isSignedIn ? 'My Results' : 'Sign In'}</Text>
          </Button>
          <Text className="text-center text-xs text-muted-foreground">
            Draping is free and needs no account. Analysis needs one, reads a single photo, and
            never stores it.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { SEASON_THEMES } from '@/lib/card/templates';
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
          <Text className="mt-4 text-center text-4xl font-bold">PersonalColor</Text>
          <Text className="max-w-xs text-center text-base text-muted-foreground">
            Find your season with a photo and a quick color draping — then meet hair designers who
            match your palette.
          </Text>
        </View>

        <View className="w-full max-w-sm gap-3">
          <Button size="lg" onPress={() => router.push('/capture')}>
            <Text>Start Color Analysis</Text>
          </Button>
          <Button
            variant="ghost"
            onPress={() => router.push(isSignedIn ? '/history' : '/sign-in')}>
            <Text>{isSignedIn ? 'My Results' : 'Sign In'}</Text>
          </Button>
          <Text className="text-center text-xs text-muted-foreground">
            Your photo is analyzed once and never stored.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

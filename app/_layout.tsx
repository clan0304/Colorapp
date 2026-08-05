import '@/global.css';

import { NAV_THEME } from '@/lib/theme';
import { FlowProvider } from '@/lib/flow-store';
import { ClerkProvider } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { ThemeProvider } from 'expo-router/react-navigation';
import { PortalHost } from '@rn-primitives/portal';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export default function RootLayout() {
  const { colorScheme } = useColorScheme();

  return (
    <ClerkProvider
      tokenCache={tokenCache}
      publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY}>
      <ThemeProvider value={NAV_THEME[colorScheme ?? 'light']}>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        <FlowProvider>
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="capture" options={{ title: 'Take a Photo', headerBackTitle: 'Back' }} />
            <Stack.Screen name="draping" options={{ title: 'Color Draping', headerBackVisible: false }} />
            <Stack.Screen name="result" options={{ title: 'Your Result', headerBackVisible: false }} />
            {/* Full-bleed and headerless: this screen is designed to be screen
                recorded, and a nav bar sitting in the frame ends up in the post.
                It also has its own exit control, so the header's back button is
                redundant. Without this entry the route falls back to the default
                header, which silently eats the top of every clip. */}
            <Stack.Screen name="clip" options={{ headerShown: false }} />
            <Stack.Screen name="sign-in" options={{ title: 'Sign In', presentation: 'modal' }} />
            <Stack.Screen name="history" options={{ title: 'My Results' }} />
          </Stack>
        </FlowProvider>
        <PortalHost />
      </ThemeProvider>
    </ClerkProvider>
  );
}

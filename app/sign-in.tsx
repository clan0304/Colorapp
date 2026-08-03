import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { isClerkAPIResponseError, useSignIn, useSignUp, useSSO } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as React from 'react';
import { ActivityIndicator, Alert, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

WebBrowser.maybeCompleteAuthSession();

// Passwordless auth: one email field — existing users get a sign-in OTP,
// new users are signed up and verified with the same UX. SSO as alternative.
export default function SignInScreen() {
  const router = useRouter();
  const { startSSOFlow } = useSSO();
  const { signIn, setActive: setActiveSignIn, isLoaded: signInLoaded } = useSignIn();
  const { signUp, setActive: setActiveSignUp, isLoaded: signUpLoaded } = useSignUp();

  const [step, setStep] = React.useState<'email' | 'code'>('email');
  const [mode, setMode] = React.useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = React.useState('');
  const [code, setCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const ready = signInLoaded && signUpLoaded;

  async function sendCode() {
    if (!ready || !email.trim()) return;
    setBusy(true);
    try {
      try {
        // Existing account → email-code sign-in.
        const attempt = await signIn.create({ identifier: email.trim() });
        const factor = attempt.supportedFirstFactors?.find(
          (f) => f.strategy === 'email_code',
        );
        if (!factor || !('emailAddressId' in factor)) {
          throw new Error('Email code sign-in is not enabled for this app.');
        }
        await signIn.prepareFirstFactor({
          strategy: 'email_code',
          emailAddressId: factor.emailAddressId,
        });
        setMode('signIn');
        setStep('code');
      } catch (error) {
        // Unknown email → passwordless sign-up with the same OTP UX.
        const notFound =
          isClerkAPIResponseError(error) &&
          error.errors.some((e) => e.code === 'form_identifier_not_found');
        if (!notFound) throw error;
        await signUp.create({ emailAddress: email.trim() });
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
        setMode('signUp');
        setStep('code');
      }
    } catch (error) {
      const message = isClerkAPIResponseError(error)
        ? error.errors[0]?.longMessage ?? error.errors[0]?.message
        : error instanceof Error
          ? error.message
          : 'Please try again.';
      Alert.alert('Could not send code', message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (!ready || code.trim().length < 4) return;
    setBusy(true);
    try {
      if (mode === 'signIn') {
        const result = await signIn.attemptFirstFactor({
          strategy: 'email_code',
          code: code.trim(),
        });
        if (result.status !== 'complete') throw new Error('Verification incomplete. Try again.');
        await setActiveSignIn({ session: result.createdSessionId });
      } else {
        const result = await signUp.attemptEmailAddressVerification({ code: code.trim() });
        if (result.status !== 'complete') throw new Error('Verification incomplete. Try again.');
        await setActiveSignUp({ session: result.createdSessionId });
      }
      router.back();
    } catch (error) {
      const message = isClerkAPIResponseError(error)
        ? error.errors[0]?.longMessage ?? error.errors[0]?.message
        : error instanceof Error
          ? error.message
          : 'Please try again.';
      Alert.alert('Verification failed', message);
    } finally {
      setBusy(false);
    }
  }

  async function signInWith(strategy: 'oauth_google' | 'oauth_apple') {
    setBusy(true);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({ strategy });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.back();
      }
    } catch (error) {
      Alert.alert('Sign in failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <View className="flex-1 items-center justify-center gap-6 p-6">
        <View className="items-center gap-2">
          <Text className="text-2xl font-bold">
            {step === 'email' ? 'Sign in or sign up' : 'Check your email'}
          </Text>
          <Text className="max-w-xs text-center text-muted-foreground">
            {step === 'email'
              ? 'Save your color analysis and get matched with designers who fit your palette.'
              : `We sent a 6-digit code to ${email.trim()}`}
          </Text>
        </View>

        {step === 'email' ? (
          <View className="w-full max-w-sm gap-3">
            <TextInput
              className="h-12 rounded-xl border border-border bg-card px-4 text-base text-foreground"
              placeholder="you@example.com"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              editable={!busy}
              onSubmitEditing={sendCode}
            />
            <Button size="lg" disabled={busy || !email.trim()} onPress={sendCode}>
              {busy ? <ActivityIndicator color="white" /> : <Text>Continue with Email</Text>}
            </Button>

            <View className="my-2 flex-row items-center gap-3">
              <View className="h-px flex-1 bg-border" />
              <Text className="text-xs text-muted-foreground">or</Text>
              <View className="h-px flex-1 bg-border" />
            </View>

            <Button size="lg" variant="outline" disabled={busy} onPress={() => signInWith('oauth_google')}>
              <Text>Continue with Google</Text>
            </Button>
            <Button size="lg" variant="outline" disabled={busy} onPress={() => signInWith('oauth_apple')}>
              <Text>Continue with Apple</Text>
            </Button>
            <Button variant="ghost" disabled={busy} onPress={() => router.back()}>
              <Text>Not now</Text>
            </Button>
          </View>
        ) : (
          <View className="w-full max-w-sm gap-3">
            <TextInput
              className="h-12 rounded-xl border border-border bg-card px-4 text-center text-xl tracking-widest text-foreground"
              placeholder="000000"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={setCode}
              editable={!busy}
              onSubmitEditing={verifyCode}
              autoFocus
            />
            <Button size="lg" disabled={busy || code.trim().length < 4} onPress={verifyCode}>
              {busy ? <ActivityIndicator color="white" /> : <Text>Verify</Text>}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onPress={() => {
                setCode('');
                setStep('email');
              }}>
              <Text>Use a different email</Text>
            </Button>
          </View>
        )}

        {/* Clerk bot protection mount point (no-op on native, required on web) */}
        <View nativeID="clerk-captcha" />
      </View>
    </SafeAreaView>
  );
}

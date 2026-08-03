import { SHOT_REMINDERS, ShotGuide } from '@/components/shot-guide';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { postJson } from '@/lib/api';
import type { Analysis } from '@/lib/diagnosis/types';
import type { DiagnosisEnvelope } from '@/lib/server/envelope'; // type-only import
import { useFlow } from '@/lib/flow-store';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { ImagesIcon, LightbulbIcon, SwitchCameraIcon } from 'lucide-react-native';
import * as React from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CaptureScreen() {
  const router = useRouter();
  const { setCapture } = useFlow();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = React.useState<'front' | 'back'>('front');
  const [busy, setBusy] = React.useState(false);
  // Shown on open, and re-opened after a shot the model flags as unusable.
  const [guideOpen, setGuideOpen] = React.useState(true);
  const [guideNotice, setGuideNotice] = React.useState<string | null>(null);
  const cameraRef = React.useRef<CameraView>(null);

  const blocked = busy || guideOpen;

  function openGuide(notice: string | null) {
    setGuideNotice(notice);
    setGuideOpen(true);
  }

  // Stable so the sheet's back-button handler isn't resubscribed every render.
  const closeGuide = React.useCallback(() => setGuideOpen(false), []);

  async function analyze(sourceUri: string) {
    setBusy(true);
    try {
      // Resize + strip metadata before upload; keeps the request small and cheap.
      const context = ImageManipulator.manipulate(sourceUri);
      context.resize({ width: 1024 });
      const rendered = await context.renderAsync();
      const prepared = await rendered.saveAsync({
        base64: true,
        compress: 0.85,
        format: SaveFormat.JPEG,
      });
      if (!prepared.base64) throw new Error('Could not read the photo.');

      // Preferred path: upload straight to R2, analyze by key (photo is deleted
      // server-side right after analysis). Falls back to inline base64 when R2
      // isn't configured or the upload fails.
      let r2Key: string | null = null;
      try {
        const { key, uploadUrl } = await postJson<{ key: string; uploadUrl: string }>(
          '/api/upload',
          {},
        );
        const upload = await FileSystem.uploadAsync(uploadUrl, prepared.uri, {
          httpMethod: 'PUT',
          headers: { 'Content-Type': 'image/jpeg' },
        });
        if (upload.status >= 200 && upload.status < 300) r2Key = key;
      } catch {
        r2Key = null;
      }

      type AnalyzeResponse = { analysis: Analysis; envelope: DiagnosisEnvelope };
      const { analysis, envelope } = r2Key
        ? await postJson<AnalyzeResponse>('/api/analyze', { r2Key })
        : await postJson<AnalyzeResponse>('/api/analyze', {
            image: prepared.base64,
            mediaType: 'image/jpeg',
          });

      const note = analysis.image_quality.notes.trim();
      if (!analysis.image_quality.face_visible) {
        Alert.alert('No face detected', 'Make sure your face fills the guide oval and try again.', [
          { text: 'OK', onPress: () => openGuide(note ? `Last shot: ${note}` : null) },
        ]);
        return;
      }
      const proceed = () => {
        setCapture(prepared.uri, analysis, envelope);
        router.push('/draping');
      };
      if (!analysis.image_quality.lighting_ok) {
        Alert.alert(
          'Lighting warning',
          'The light in this photo tints your skin, which can flip warm and cool. Indirect daylight from a window is the fix.',
          [
            {
              text: 'Retake',
              style: 'cancel',
              onPress: () =>
                openGuide(
                  note
                    ? `Last shot: ${note}`
                    : 'The lighting in your last shot was off — the first tip is usually the fix.',
                ),
            },
            { text: 'Continue anyway', onPress: proceed },
          ],
        );
        return;
      }
      proceed();
    } catch (error) {
      Alert.alert('Analysis failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function takePhoto() {
    const photo = await cameraRef.current?.takePictureAsync({ quality: 0.9 });
    if (photo?.uri) await analyze(photo.uri);
  }

  async function pickPhoto() {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    const uri = picked.assets?.[0]?.uri;
    if (!picked.canceled && uri) await analyze(uri);
  }

  if (!permission) return <View className="flex-1 bg-background" />;

  if (!permission.granted) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
        <Text className="text-center text-lg font-semibold">Camera access needed</Text>
        <Text className="text-center text-muted-foreground">
          We use the camera to analyze your personal color. Photos are analyzed once and never
          stored.
        </Text>
        <Button onPress={requestPermission}>
          <Text>Allow Camera</Text>
        </Button>
        <Button variant="ghost" onPress={pickPhoto}>
          <Text>Choose from library instead</Text>
        </Button>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      {/* CameraView takes no children — expo-camera warns that it leads to
          inconsistent behaviour or crashes. Everything drawn over the preview
          is an absolutely positioned sibling instead. */}
      <CameraView ref={cameraRef} facing={facing} style={StyleSheet.absoluteFill} />

      {/* Face-alignment guide */}
      <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
        <View
          className="border-2 border-white/80"
          style={{ width: 260, height: 340, borderRadius: 130 }}
        />
        <Text className="mt-4 text-center text-sm text-white/90">
          Fill the oval · phone at eye level · look straight ahead
        </Text>
        <View className="mt-3 max-w-xs flex-row flex-wrap justify-center gap-2">
          {SHOT_REMINDERS.map((reminder) => (
            <View key={reminder} className="rounded-full bg-black/50 px-3 py-1">
              <Text className="text-xs text-white/80">{reminder}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Controls. Disabled while the guide is up: a plain View overlay does
          not claim touches in RN, so these stay tappable through it. */}
      <View className="absolute inset-x-0 bottom-10 flex-row items-center justify-center gap-12">
        <Pressable
          onPress={pickPhoto}
          disabled={blocked}
          className="h-12 w-12 items-center justify-center rounded-full bg-white/20">
          <ImagesIcon color="white" size={22} />
        </Pressable>
        <Pressable
          onPress={takePhoto}
          disabled={blocked}
          className="h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/30">
          <View className="h-14 w-14 rounded-full bg-white" />
        </Pressable>
        <Pressable
          onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}
          disabled={blocked}
          className="h-12 w-12 items-center justify-center rounded-full bg-white/20">
          <SwitchCameraIcon color="white" size={22} />
        </Pressable>
      </View>

      {!guideOpen ? (
        <SafeAreaView className="absolute inset-x-0 top-0 items-end px-5" edges={['top']}>
          <Pressable
            onPress={() => openGuide(null)}
            className="flex-row items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 active:opacity-70">
            <Icon as={LightbulbIcon} size={14} className="text-white" />
            <Text className="text-xs font-medium text-white">Shot tips</Text>
          </Pressable>
        </SafeAreaView>
      ) : null}

      {guideOpen ? <ShotGuide notice={guideNotice} onDismiss={closeGuide} /> : null}

      {busy ? (
        <View className="absolute inset-0 items-center justify-center bg-black/70">
          <ActivityIndicator size="large" color="white" />
          <Text className="mt-4 text-white">Analyzing your colors…</Text>
        </View>
      ) : null}
    </View>
  );
}

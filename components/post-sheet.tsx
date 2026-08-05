import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { BRAND_NAME } from '@/lib/card/templates';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import type { LucideIcon } from 'lucide-react-native';
import { CircleAlertIcon, CopyIcon, FilmIcon, Share2Icon } from 'lucide-react-native';
import * as React from 'react';
import { Alert, BackHandler, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * The caption, written once so the user does not have to think of one — which
 * is the part of posting that actually stalls people, not the file handling.
 *
 * It opens on the question rather than on us. "Which half looked better on me"
 * is a prompt a viewer can answer in one word, and comments are the reach
 * mechanism the whole clip exists for; a caption that describes the app instead
 * would spend the slot on something nobody replies to.
 *
 * Both spellings of the tag are present on purpose. The market is Australian
 * and writes "colour", but the global tag volume sits on "color", and a post
 * only has to carry both strings to be found by either. #shorts is what tells
 * YouTube to file an 11-second vertical clip as a Short.
 *
 * The brand tag leads, and it is the one that actually matters: the name was
 * chosen to be searchable precisely so a viewer who sees the watermark can find
 * us. The generic tags reach people browsing the category; the brand tag is how
 * someone who already saw a clip gets back to it.
 */
const CAPTION = [
  'Which half looked better on me? 👀',
  '',
  `Warm vs cool draping — ${BRAND_NAME}.`,
  '',
  `#${BRAND_NAME.toLowerCase()} #personalcolour #colouranalysis #personalcolor #coloranalysis #warmvscool #draping #shorts`,
].join('\n');

type Step = { icon: LucideIcon; title: string; body: string };

const STEPS: Step[] = [
  {
    icon: FilmIcon,
    title: 'Pick your recording',
    body: 'Your screen recording is in Photos. Tap below and choose it — nothing is uploaded, the file goes straight to the share sheet.',
  },
  {
    icon: Share2Icon,
    title: 'Send it to Reels or Shorts',
    body: 'Instagram, YouTube and TikTok all show up in the share sheet if the app is installed. Pick one and it opens with your clip loaded.',
  },
  {
    icon: CopyIcon,
    title: 'Paste the caption',
    body: 'Press and hold the caption below to copy it, then paste it into the composer. The hashtags are already in there.',
  },
];

/**
 * Post flow for a finished colour run.
 *
 * The app deliberately never records anything — the clip screen is a viewfinder
 * with an overlay, and the artefact is the user's own OS screen recording (see
 * CLAUDE.md). That means the file already exists in Photos and does NOT belong
 * to us, so this sheet hands it back rather than producing it: the user picks
 * the recording through the system picker, and it goes to the native share
 * sheet from there. No media-library permission is involved, because the picker
 * only ever returns what the user selected.
 *
 * A genuine one-tap "record and post" needs a screen-capture API the app can
 * drive itself (ReplayKit on iOS, MediaProjection on Android). Neither is
 * reachable from the current Expo modules, and expo-camera's recordAsync is not
 * a substitute — it records the camera stream, so the drape colour, the labels
 * and the brand mark would all be missing from the file.
 */
export function PostSheet({ onDismiss }: { onDismiss: () => void }) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = React.useState(false);

  // Android hardware back closes the sheet rather than leaving the clip screen.
  React.useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onDismiss();
      return true;
    });
    return () => sub.remove();
  }, [onDismiss]);

  async function pickAndShare() {
    setBusy(true);
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] });
      if (picked.canceled || !picked.assets?.length) return;
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing is not available on this device.');
        return;
      }
      const asset = picked.assets[0];
      await Sharing.shareAsync(asset.uri, { mimeType: asset.mimeType ?? 'video/*' });
    } catch {
      Alert.alert(
        'Could not open that recording',
        'You can still post it straight from the Photos app.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="absolute inset-0">
      {/* Scrim above the sheet in the column, not behind it — same reason as the
          shot guide: the two never overlap and never contend for the responder. */}
      <Pressable className="flex-1 bg-black/60" onPress={onDismiss} />

      <View className="rounded-t-3xl bg-white" style={{ maxHeight: '85%' }}>
        <View className="items-center py-3">
          <View className="h-1 w-10 rounded-full bg-neutral-300" />
        </View>

        <ScrollView
          className="shrink"
          contentContainerClassName="gap-6 px-6 pb-6"
          showsVerticalScrollIndicator={false}>
          <View className="gap-2">
            <Text className="text-2xl font-bold text-neutral-950">Post your clip</Text>
            <Text className="text-sm leading-5 text-neutral-600">
              Three taps to Reels or Shorts. The clip is already the right shape — vertical, and
              framed inside the part that survives the crop.
            </Text>
          </View>

          <View className="gap-5">
            {STEPS.map((step) => (
              <View key={step.title} className="flex-row gap-4">
                <View className="h-10 w-10 items-center justify-center rounded-full bg-neutral-100">
                  <Icon as={step.icon} size={20} className="text-neutral-900" />
                </View>
                <View className="flex-1 gap-1">
                  <Text className="font-semibold text-neutral-950">{step.title}</Text>
                  <Text className="text-sm leading-5 text-neutral-600">{step.body}</Text>
                </View>
              </View>
            ))}
          </View>

          <Button
            size="lg"
            disabled={busy}
            className="bg-neutral-950 active:bg-neutral-800"
            onPress={pickAndShare}>
            <Text className="text-white">{busy ? 'Opening…' : 'Choose recording & share'}</Text>
          </Button>

          {/* Selectable rather than a copy button: a one-tap copy needs
              expo-clipboard, which is a native module, and adding one would
              force a new dev-client build for a convenience. Press-and-hold is
              the platform's own copy gesture and costs nothing. */}
          <View className="gap-2">
            <Text className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Caption — press and hold to copy
            </Text>
            <View className="rounded-2xl bg-neutral-100 p-4">
              <Text selectable className="text-sm leading-5 text-neutral-800">
                {CAPTION}
              </Text>
            </View>
          </View>

          <View className="flex-row gap-3 rounded-2xl border border-amber-500/30 bg-amber-50 p-3">
            <Icon as={CircleAlertIcon} size={18} className="mt-0.5 text-amber-600" />
            <Text className="flex-1 text-sm leading-5 text-amber-900">
              No recording yet? The app cannot start one for you. Open Control Centre on iOS (or
              Quick Settings on Android), tap Screen Recording, come back and run it again.
            </Text>
          </View>

          <Button variant="ghost" onPress={onDismiss}>
            <Text className="text-neutral-600">Not now</Text>
          </Button>

          <View style={{ height: insets.bottom }} />
        </ScrollView>
      </View>
    </View>
  );
}

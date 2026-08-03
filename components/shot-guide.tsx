import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { LucideIcon } from 'lucide-react-native';
import { CircleAlertIcon, ShirtIcon, SparklesIcon, SunIcon, UserIcon } from 'lucide-react-native';
import * as React from 'react';
import { BackHandler, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Tip = { icon: LucideIcon; title: string; body: string };

// Input quality dominates everything downstream: a warm indoor bulb alone can
// flip a cool reading warm, and the prompt's cast correction only goes so far.
// Coaching the shot is the cheapest accuracy we can buy, so the guide is shown
// every time the capture screen opens rather than once per install.
const TIPS: Tip[] = [
  {
    icon: SunIcon,
    title: 'Indirect daylight',
    body: 'Face a window during the day. Indoor bulbs push your skin warm, shade and overcast push it cool, and backlight leaves your face in shadow.',
  },
  {
    icon: SparklesIcon,
    title: 'Filters off',
    body: 'Beauty mode and smoothing erase the skin texture and undertone we read. Turn them off in your phone settings, and if you pick an older photo, use an unedited one.',
  },
  {
    icon: UserIcon,
    title: 'Skin on show',
    body: 'Tuck your hair behind your ears so your forehead and neck are visible, and keep base makeup and blush light.',
  },
  {
    icon: ShirtIcon,
    title: 'Neutral top',
    body: 'A saturated top bounces its own color onto your jaw and neck — that is draping, and it happens before we start. White, grey or black reads truest.',
  },
];

/** Short versions of {@link TIPS}, for the reminder chips on the live camera. */
export const SHOT_REMINDERS = ['Daylight', 'No filters', 'Hair back', 'Neutral top'];

/**
 * Bottom sheet over the live camera — the preview stays visible behind the
 * scrim, so re-opening the tips never reads as leaving the capture screen.
 */
export function ShotGuide({ notice, onDismiss }: { notice?: string | null; onDismiss: () => void }) {
  const insets = useSafeAreaInsets();

  // Android hardware back closes the sheet rather than leaving the camera.
  React.useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onDismiss();
      return true;
    });
    return () => sub.remove();
  }, [onDismiss]);

  return (
    <View className="absolute inset-0">
      {/* The scrim sits above the sheet in the column rather than behind it, so
          the two never overlap and never contend for the touch responder. */}
      <Pressable className="flex-1 bg-black/60" onPress={onDismiss} />

      <View className="rounded-t-3xl bg-white" style={{ maxHeight: '85%' }}>
        <View className="items-center py-3">
          <View className="h-1 w-10 rounded-full bg-neutral-300" />
        </View>

        {/* shrink lets the sheet clamp to maxHeight and the list scroll inside. */}
        <ScrollView
          className="shrink"
          contentContainerClassName="gap-6 px-6 pb-6"
          showsVerticalScrollIndicator={false}>
          <View className="gap-2">
            <Text className="text-2xl font-bold text-neutral-950">Before you shoot</Text>
            <Text className="text-sm leading-5 text-neutral-600">
              Lighting and clothing shift the reading more than anything else — a warm bulb on its
              own can make cool skin look warm. Ten seconds here changes the result.
            </Text>
          </View>

          {notice ? (
            <View className="flex-row gap-3 rounded-2xl border border-amber-500/30 bg-amber-50 p-3">
              <Icon as={CircleAlertIcon} size={18} className="mt-0.5 text-amber-600" />
              <Text className="flex-1 text-sm leading-5 text-amber-900">{notice}</Text>
            </View>
          ) : null}

          <View className="gap-5">
            {TIPS.map((tip) => (
              <View key={tip.title} className="flex-row gap-4">
                <View className="h-10 w-10 items-center justify-center rounded-full bg-neutral-100">
                  <Icon as={tip.icon} size={20} className="text-neutral-900" />
                </View>
                <View className="flex-1 gap-1">
                  <Text className="font-semibold text-neutral-950">{tip.title}</Text>
                  <Text className="text-sm leading-5 text-neutral-600">{tip.body}</Text>
                </View>
              </View>
            ))}
          </View>

          <Button size="lg" className="bg-neutral-950 active:bg-neutral-800" onPress={onDismiss}>
            <Text className="text-white">I'm ready</Text>
          </Button>

          <View style={{ height: insets.bottom }} />
        </ScrollView>
      </View>
    </View>
  );
}

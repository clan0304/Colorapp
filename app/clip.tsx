import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { temperatureRun } from '@/lib/diagnosis/recommendations';
import { SEASON_LABELS } from '@/lib/diagnosis/types';
import { useFlow } from '@/lib/flow-store';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Redirect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { CheckIcon, PauseIcon, XIcon } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

/** How long each colour stays up before the next one swaps in. */
const HOLD_MS = 1200;
/**
 * Counted down before the first colour, so the user has time to get framed
 * after starting their screen recording. Deliberately not automatic on entry:
 * starting the OS screen recorder takes a few taps in Control Centre, and a
 * countdown that fires before the recording does is worse than none.
 */
const COUNT_FROM = 3;
/**
 * The drape colour while getting ready — a stand-in for the white cape a salon
 * puts on you. Neutral so it gives away nothing, and present rather than absent
 * so the user can see where the fabric edge will sit and frame their chin above
 * it before the run starts.
 */
const NEUTRAL_DRAPE = '#EFEFEF';
/**
 * Vertical margin kept clear of captions, as a share of height. A phone screen
 * is about 9:19.5 but Reels is 9:16, so roughly 9% off each end is cropped on
 * upload — anything inside this band survives that crop.
 */
const CROP_SAFE = 0.1;
/** How long the exit control stays up before the screen goes clean to record. */
const CHROME_MS = 2600;

type Phase = 'ready' | 'counting' | 'running';

/**
 * Live draping, built to be filmed: the front camera runs full screen and a
 * fabric-shaped colour band swaps under the chin on a beat, the way a
 * consultant works through drapes in a real session.
 *
 * This replaced a version that slid a masked photo across two colour fields.
 * Compositing a still onto a colour needs the face cut out of its background,
 * and without person segmentation the feathered oval standing in for a cutout
 * read as a ghost. Here there is nothing to composite — the real face is simply
 * in frame and the colour is an overlay beneath it, which is also what physical
 * draping actually is.
 *
 * Nothing is captured, uploaded or stored: this is a viewfinder with a colour
 * band over it. The user's own screen recording is the artefact.
 */
export default function ClipScreen() {
  const router = useRouter();
  const { result } = useFlow();
  const [permission, requestPermission] = useCameraPermissions();
  const [index, setIndex] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [chrome, setChrome] = React.useState(true);
  const [phase, setPhase] = React.useState<Phase>('ready');
  const [count, setCount] = React.useState(COUNT_FROM);
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const swatches = React.useMemo(
    () => (result ? temperatureRun(result.final_season) : []),
    [result],
  );

  const showChrome = React.useCallback(() => {
    setChrome(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setChrome(false), CHROME_MS);
  }, []);

  React.useEffect(() => {
    showChrome();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [showChrome]);

  React.useEffect(() => {
    if (phase !== 'counting') return;
    if (count === 0) {
      setPhase('running');
      return;
    }
    const timer = setTimeout(() => setCount((current) => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [phase, count]);

  // Hands-free by default: the whole point is that the user can hold the phone,
  // move, and react while the colours change on their own.
  React.useEffect(() => {
    if (phase !== 'running' || paused || swatches.length === 0) return;
    const timer = setInterval(
      () => setIndex((current) => (current + 1) % swatches.length),
      HOLD_MS,
    );
    return () => clearInterval(timer);
  }, [phase, paused, swatches.length]);

  function begin() {
    setIndex(0);
    setCount(COUNT_FROM);
    setPaused(false);
    setPhase('counting');
  }

  if (!result) return <Redirect href="/" />;

  if (!permission) return <View className="flex-1 bg-black" />;

  if (!permission.granted) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
        <Text className="text-center text-lg font-semibold">Camera access needed</Text>
        <Text className="text-center text-muted-foreground">
          The clip runs on your live camera. Nothing is recorded or uploaded — use your phone's
          screen recorder to keep it.
        </Text>
        <Button onPress={requestPermission}>
          <Text>Allow Camera</Text>
        </Button>
        <Button variant="ghost" onPress={() => router.back()}>
          <Text>Go back</Text>
        </Button>
      </View>
    );
  }

  const running = phase === 'running';
  const swatch = swatches[index];

  return (
    <View className="flex-1 bg-black">
      <StatusBar hidden />

      {/* CameraView takes no children — expo-camera warns that it leads to
          inconsistent behaviour or crashes. Everything over the preview is an
          absolutely positioned sibling. */}
      <CameraView facing="front" style={StyleSheet.absoluteFill} />

      {/* The drape: wider than the frame so its curve reads as cloth, and it
          cuts straight to the next colour rather than crossfading — a stylist
          swapping fabric is a hard cut, and it is punchier on camera. */}
      <View
        pointerEvents="none"
        className="absolute inset-x-[-12%] bottom-[-4%]"
        style={{
          height: '38%',
          backgroundColor: running ? swatch.hex : NEUTRAL_DRAPE,
          borderTopLeftRadius: 999,
          borderTopRightRadius: 999,
        }}
      />

      <View
        pointerEvents="none"
        className="absolute inset-x-0 flex-row items-start justify-between px-4"
        style={{ top: `${CROP_SAFE * 100}%` }}>
        <View className="rounded-full bg-black/45 px-3 py-1.5">
          <Text className="text-base font-bold text-white">
            {SEASON_LABELS[result.final_season]}
          </Text>
        </View>
        <BrandMark size="lg" />
      </View>

      {running ? (
        <View
          pointerEvents="none"
          className="absolute inset-x-0 items-center gap-3 px-4"
          style={{ bottom: `${CROP_SAFE * 100}%` }}>
          {/* Temperature leads and the colour name supports it. To someone
              scrolling past, "cool" is the part that carries meaning — the
              individual colour name only matters to the person who owns it. */}
          <View className="items-center gap-1 rounded-2xl bg-black/50 px-5 py-2.5">
            <View className="flex-row items-center gap-2">
              <Icon
                as={swatch.suits ? CheckIcon : XIcon}
                size={18}
                className={swatch.suits ? 'text-emerald-300' : 'text-rose-300'}
              />
              <Text className="text-xl font-bold uppercase tracking-wide text-white">
                {swatch.temperature}
              </Text>
            </View>
            <Text className="text-sm capitalize text-white/80">{swatch.name}</Text>
          </View>
          {/* Gapped at the halfway mark so the run visibly has two blocks. */}
          <View className="flex-row items-center gap-1.5">
            {swatches.map((entry, i) => (
              <View
                key={entry.hex}
                className={`h-1.5 w-1.5 rounded-full ${i === index ? 'bg-white' : 'bg-white/35'}`}
                style={i === swatches.length / 2 ? { marginLeft: 10 } : undefined}
              />
            ))}
          </View>
        </View>
      ) : null}

      {phase === 'counting' ? (
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
          <View className="h-28 w-28 items-center justify-center rounded-full bg-black/45">
            <Text className="text-6xl font-bold text-white">{count}</Text>
          </View>
        </View>
      ) : null}

      {/* Tap to skip ahead, hold to freeze on a colour. Sits above the overlays
          so the whole screen is the target, and below the exit control. Only
          live once the run is, so a stray tap while getting ready does nothing. */}
      {running ? (
        <Pressable
          className="absolute inset-0"
          onPress={() => setIndex((current) => (current + 1) % swatches.length)}
          onLongPress={() => {
            setPaused((wasPaused) => !wasPaused);
            showChrome();
          }}
        />
      ) : null}

      {chrome ? (
        <>
          {/* Above the crop-safe band on purpose: if it is still up when
              recording starts, the upload crop takes it out anyway. */}
          <Pressable
            onPress={() => router.back()}
            className="absolute left-4 top-6 h-10 w-10 items-center justify-center rounded-full bg-black/45 active:opacity-70">
            <Icon as={XIcon} size={20} className="text-white" />
          </Pressable>
          {running ? (
            <View className="absolute inset-x-0 bottom-6 items-center px-6">
              <View className="rounded-full bg-black/50 px-4 py-2">
                <Text className="text-center text-xs text-white">
                  Tap to skip a colour, hold to freeze on one.
                </Text>
              </View>
            </View>
          ) : null}
        </>
      ) : null}

      {phase === 'ready' ? (
        <View className="absolute inset-x-0 bottom-0 items-center gap-4 px-6 pb-12">
          <View className="rounded-2xl bg-black/55 px-4 py-3">
            <Text className="text-center text-sm text-white">
              Start your screen recording first, then begin — the colours run on their own from
              there. Line your chin up just above the cape.
            </Text>
          </View>
          <Button size="lg" className="w-full" onPress={begin}>
            <Text>Begin</Text>
          </Button>
        </View>
      ) : null}

      {paused && !chrome ? (
        <View pointerEvents="none" className="absolute right-4 top-6">
          <View className="flex-row items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5">
            <Icon as={PauseIcon} size={12} className="text-white" />
            <Text className="text-[10px] text-white">Held</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

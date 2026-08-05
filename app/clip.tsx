import { BrandMark } from '@/components/brand-mark';
import { PostSheet } from '@/components/post-sheet';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import {
  neutralRun,
  temperatureRun,
  type NeutralSwatch,
  type RunSwatch,
} from '@/lib/diagnosis/recommendations';
import { SEASON_LABELS } from '@/lib/diagnosis/types';
import { useFlow } from '@/lib/flow-store';
import { useAuth } from '@clerk/clerk-expo';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { CheckIcon, PauseIcon, Share2Icon, XIcon } from 'lucide-react-native';
import * as React from 'react';
import { Animated, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * How long each colour stays up before the next one swaps in. Uniform across
 * the whole run, on purpose.
 *
 * Varying it — quicker through one block, lingering on another — was considered
 * and rejected. On the personalised run it is merely unvalidated; on the
 * undiagnosed run it is actively wrong, because holding one temperature longer
 * IS a verdict. That run withholds the answer by design (see neutralRun), and
 * leaking it through the edit would defeat the type-level guard that stops the
 * tick/cross rendering. A single constant cannot drift into implying a winner.
 *
 * 1000ms specifically, rather than any other uniform value. Two reasons, both
 * about the platform the clip is posted to rather than about draping:
 *   - Eight colours land the run at 8s (11s with the countdown). Completion
 *     rate is the strongest ranking signal short-form has, and 9.6s of colour
 *     was pushing the whole thing past 12s.
 *   - It is exactly two beats at 120BPM, so the eight swaps fill 16 beats —
 *     four bars. Trending audio clusters around that tempo, so a user dropping
 *     any of it over the clip gets the cuts on the beat and the run ending on a
 *     phrase boundary, for free.
 * Whether 1000ms is still long enough to read the skin's reaction is the open
 * question, and it needs a real device to answer.
 */
const HOLD_MS = 1000;
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
 * Drape geometry, as shares of screen height. Named rather than inlined because
 * the face guide is positioned off them — move the fabric and the guide follows,
 * instead of the two silently drifting apart and teaching the wrong framing.
 */
const DRAPE_HEIGHT = 0.38;
/** How far the fabric hangs past the bottom edge, so it never reads as a bar. */
const DRAPE_OVERHANG = 0.04;
/** Top edge of the fabric at its centre, measured from the top of the screen. */
const DRAPE_TOP = 1 - DRAPE_HEIGHT + DRAPE_OVERHANG;
/**
 * Where the chin belongs: clear of the fabric edge, but only just. A real drape
 * works because it sits directly under the jaw and throws colour up onto the
 * skin, so a gap here is a weaker effect, not a tidier one.
 */
const CHIN_GAP = 0.015;
const CHIN_LINE = DRAPE_TOP - CHIN_GAP;
/**
 * How far the fabric's colour bleeds up the frame, as a share of height.
 *
 * This is the honest version of "should the clip light the face" (still open in
 * CLAUDE.md): a real drape throws colour UP onto the skin from below, so the
 * glow rises from the fabric rather than washing in from every edge. It is
 * perceptual only — no extra light lands on the face — which is why it is safe
 * to ship ahead of that decision rather than instead of it.
 */
const SPILL_HEIGHT = 0.22;
/** Peak opacity of that glow where it meets the fabric. */
const SPILL_ALPHA = 0.45;
/**
 * What a vertical-video upload keeps. A phone screen is about 9:19.5 and Reels
 * / Shorts / TikTok are 9:16, so the ends get cropped — shown during ready so
 * the framing decision is made with the crop visible rather than discovered
 * after posting. CROP_SAFE above stays as the conservative band the marks live
 * in; this is the measured one.
 */
const REEL_ASPECT = 9 / 16;
/** How long the temperature flip is marked when the run crosses blocks. */
const BLOCK_POP_MS = 460;
/**
 * Vertical margin kept clear of captions, as a share of height. A phone screen
 * is about 9:19.5 but Reels is 9:16, so roughly 9% off each end is cropped on
 * upload — anything inside this band survives that crop.
 */
const CROP_SAFE = 0.1;
/**
 * Extra clearance inside that band. CROP_SAFE is the edge of what survives, and
 * a mark sitting exactly on it reads as flush against the cut — correct by the
 * arithmetic, sloppy on screen.
 */
const MARK_INSET = 0.02;
/** How long the exit control stays up before the screen goes clean to record. */
const CHROME_MS = 2600;

type Phase = 'ready' | 'counting' | 'running' | 'done';

/**
 * Live draping, built to be filmed: the front camera runs full screen and a
 * fabric-shaped colour band swaps under the chin on a beat, the way a
 * consultant works through drapes in a real session.
 *
 * Runs in two modes off one flag — whether a diagnosis is in the flow store.
 * With a result it is the personalised victory lap reached from the result
 * screen: the run closes on the user's own temperature and their season is
 * stamped on the frame. Without one it is the free entry point from the home
 * screen: same colours, no verdict, and it ends on the question rather than
 * looping. The undiagnosed mode is the cheap half of the funnel — no photo, no
 * sign-up, no API call — and it exists to make the user ask which side suited
 * them, which is the thing the analysis then answers.
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
  const { isSignedIn } = useAuth();
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const [index, setIndex] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [chrome, setChrome] = React.useState(true);
  const [phase, setPhase] = React.useState<Phase>('ready');
  const [count, setCount] = React.useState(COUNT_FROM);
  const [postOpen, setPostOpen] = React.useState(false);
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Decays 1 → 0 across the temperature flip; drives the flash and label pop. */
  const blockPop = React.useRef(new Animated.Value(0)).current;

  const personalised = result !== null;
  // Typed as the union element rather than a union of arrays, so .map() over it
  // below stays callable.
  const swatches: (RunSwatch | NeutralSwatch)[] = React.useMemo(
    () => (result ? temperatureRun(result.final_season) : neutralRun()),
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
  //
  // Chained per colour rather than one interval, for two reasons: the last
  // swatch of an undiagnosed run has to end the run instead of wrapping, and
  // tapping to skip now restarts the hold rather than leaving the next
  // auto-advance to fire from whatever was left on a shared interval.
  React.useEffect(() => {
    // The post sheet freezes the run the same way a long-press does, so a
    // personalised run does not keep cycling — or a neutral one quietly end —
    // while the user is away in the system picker.
    if (phase !== 'running' || paused || postOpen || swatches.length === 0) return;
    const last = index >= swatches.length - 1;
    const timer = setTimeout(() => {
      // The personalised run loops so several passes fit in one take. The
      // undiagnosed one stops on the question — that CTA is its whole job.
      if (last && !personalised) setPhase('done');
      else setIndex((current) => (current + 1) % swatches.length);
    }, HOLD_MS);
    return () => clearTimeout(timer);
  }, [phase, paused, postOpen, index, swatches.length, personalised]);

  // Mark the temperature flip. Within a block the swap is a hard cut, which is
  // right — a stylist changing fabric is a hard cut and it is punchier. But the
  // midpoint is the one cut that MEANS something, and treated identically to
  // the other six it reads as just another colour. Marking it is what turns
  // eight swatches into two families.
  React.useEffect(() => {
    if (phase !== 'running' || swatches.length === 0) return;
    if (index !== swatches.length / 2) return;
    blockPop.setValue(1);
    const animation = Animated.timing(blockPop, {
      toValue: 0,
      duration: BLOCK_POP_MS,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [phase, index, swatches.length, blockPop]);

  function begin() {
    setIndex(0);
    setCount(COUNT_FROM);
    setPaused(false);
    setPhase('counting');
  }

  // Theme background rather than black on both of these: the camera covers them
  // once it warms up, so all they ever show is the seam on the way in — and a
  // black flash between a light home screen and the preview reads as a glitch.
  if (!permission) return <View className="flex-1 bg-background" />;

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
  // Roughly crown to chin. Capped so the oval clears the chips at the top of a
  // tall screen without swallowing a short one.
  const guideHeight = Math.min(screenHeight * 0.4, 360);
  const guideWidth = guideHeight * 0.78;
  // What a 9:16 upload keeps, and therefore how much of each end it throws
  // away. Measured off the real screen rather than assumed, since the ratio
  // differs across devices.
  const cropBand = Math.max(0, (screenHeight - screenWidth / REEL_ASPECT) / 2);
  const spillTop = (DRAPE_TOP - SPILL_HEIGHT) * screenHeight;

  return (
    <View className="flex-1 bg-background">
      <StatusBar hidden />

      {/* CameraView takes no children — expo-camera warns that it leads to
          inconsistent behaviour or crashes. Everything over the preview is an
          absolutely positioned sibling. */}
      <CameraView facing="front" style={StyleSheet.absoluteFill} />

      {/* Colour spill and vignette. Both are gradients rather than stacked
          translucent Views because stacking bands visibly.

          NOTE the explicit offset-0 stops: react-native-svg does NOT extend a
          gradient's first stop back to 0 the way the SVG spec says, so a range
          that starts at 0.55 leaves everything below it unpainted. */}
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="spill" x1="0" y1="1" x2="0" y2="0">
            <Stop offset="0" stopColor={swatch.hex} stopOpacity={SPILL_ALPHA} />
            <Stop offset="1" stopColor={swatch.hex} stopOpacity={0} />
          </LinearGradient>
          <RadialGradient id="vignette" cx="50%" cy="42%" rx="72%" ry="58%">
            <Stop offset="0" stopColor="#000" stopOpacity={0} />
            <Stop offset="0.55" stopColor="#000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000" stopOpacity={0.4} />
          </RadialGradient>
        </Defs>
        {/* Only while the colours are actually running — during ready the cape
            is neutral grey and a grey glow would say nothing. */}
        {running ? (
          <Rect
            x={0}
            y={spillTop}
            width={screenWidth}
            height={SPILL_HEIGHT * screenHeight}
            fill="url(#spill)"
          />
        ) : null}
        {/* Darkens the corners so the face and the fabric are the brightest
            things in frame — the cheapest way to stop phone-camera footage
            reading as an accident. Drawn before the drape so the fabric itself
            stays fully saturated. */}
        <Rect x={0} y={0} width={screenWidth} height={screenHeight} fill="url(#vignette)" />
      </Svg>

      {/* The drape: wider than the frame so its curve reads as cloth, and it
          cuts straight to the next colour rather than crossfading — a stylist
          swapping fabric is a hard cut, and it is punchier on camera. */}
      <View
        pointerEvents="none"
        className="absolute inset-x-[-12%]"
        style={{
          bottom: `${-DRAPE_OVERHANG * 100}%`,
          height: `${DRAPE_HEIGHT * 100}%`,
          backgroundColor: running ? swatch.hex : NEUTRAL_DRAPE,
          borderTopLeftRadius: 999,
          borderTopRightRadius: 999,
        }}
      />

      {/* The temperature flip, washed across the whole frame in the incoming
          colour. Sits above the camera and the fabric but below the captions,
          so the labels stay legible through it. */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: swatch.hex,
            opacity: blockPop.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] }),
          },
        ]}
      />

      {/* Face guide. Anchored to the fabric line rather than centred on the
          screen, because the relationship is the whole lesson: a drape works by
          sitting directly under the jaw and bouncing colour up onto the skin, so
          a face floating mid-frame with a colour band somewhere below it is the
          wrong shot and reads as a filter. The oval's bottom edge IS the fabric
          line — and during ready the grey cape is already drawn just under it,
          so the gap is visible without a second marker.

          Gone the moment the run starts: this screen exists to be filmed, and a
          guide left in the frame is a guide left in the post. It does stay up
          through the countdown, which is the framing window and is leader
          footage the user trims anyway — the 3-2-1 is already sitting in it. */}
      {phase === 'ready' || phase === 'counting' ? (
        <View
          pointerEvents="none"
          className="absolute inset-x-0 items-center"
          style={{ bottom: `${(1 - CHIN_LINE) * 100}%` }}>
          {/* Oval only. This used to carry its own "fill the oval, chin above
              the cape" caption, which was the same sentence the ready panel
              below already opens with — the instruction is said once, in the
              panel, and the oval is what points at where. It also kept the
              caption from crowding the top chips on shorter screens, since its
              position floats with the oval's height. */}
          <View
            className="border-2 border-white/75"
            style={{ width: guideWidth, height: guideHeight, borderRadius: guideWidth / 2 }}
          />
        </View>
      ) : null}

      {/* What a vertical-video upload throws away. The marks already live inside
          CROP_SAFE, but the user could not SEE the boundary, so framing was a
          guess that only got checked after posting. Ready only — this is a
          setup aid, and unlike the face guide it is heavy enough that leaving
          it up through the countdown would put two dark bars in the leader
          frames. Nothing is enforced: it informs the shot, it does not crop it. */}
      {phase === 'ready' && cropBand > 1 ? (
        <View pointerEvents="none" className="absolute inset-0">
          <View
            className="absolute inset-x-0 top-0 items-center justify-end bg-black/55"
            style={{ height: cropBand }}>
            <Text className="mb-1 text-[10px] uppercase tracking-widest text-white/70">
              Cropped on upload
            </Text>
          </View>
          <View
            className="absolute inset-x-0 bottom-0 bg-black/55"
            style={{ height: cropBand }}
          />
        </View>
      ) : null}

      {/* items-center, not items-start: the two pills are different heights —
          the label is bold body text, the wordmark is small caps — so aligning
          their top edges leaves the type visibly off a shared line. */}
      <View
        pointerEvents="none"
        className="absolute inset-x-0 flex-row items-center justify-between px-4"
        style={{ top: `${(CROP_SAFE + MARK_INSET) * 100}%` }}>
        {/* Same slot, same job in both modes: tell a stranger scrolling past
            what they are looking at. With a diagnosis that is the season;
            without one it is the question the run is posing. */}
        <View className="rounded-full bg-black/45 px-3 py-1.5">
          <Text className="text-base font-bold text-white">
            {result ? SEASON_LABELS[result.final_season] : 'Warm or cool?'}
          </Text>
        </View>
        <BrandMark size="lg" />
      </View>

      {running ? (
        <View
          pointerEvents="none"
          className="absolute inset-x-0 items-center gap-3 px-4"
          style={{ bottom: `${(CROP_SAFE + MARK_INSET) * 100}%` }}>
          {/* Temperature leads and the colour name supports it. To someone
              scrolling past, "cool" is the part that carries meaning — the
              individual colour name only matters to the person who owns it. */}
          {/* Pops on the temperature flip so the caption lands with the wash
              instead of quietly swapping a word underneath it. The animated
              wrapper carries only the transform — NativeWind's className is left
              on a plain View, which is where it is known to resolve. */}
          <Animated.View
            style={{
              transform: [
                { scale: blockPop.interpolate({ inputRange: [0, 1], outputRange: [1, 1.28] }) },
              ],
            }}>
            {/* Sized for a feed, not for the hand holding the phone. This word
                is the only thing a stranger reads, and it has to survive a
                screen recording, the platform's re-encode and being watched at
                thumbnail size — which the previous text-xl did not. */}
            <View className="items-center gap-1 rounded-2xl bg-black/50 px-6 py-3">
              <View className="flex-row items-center gap-2.5">
              {/* The temperature word shows in both modes; only the tick or
                  cross is withheld. The contrast is what makes the clip
                  readable, the verdict is what the analysis is for. */}
                {'suits' in swatch ? (
                  <Icon
                    as={swatch.suits ? CheckIcon : XIcon}
                    size={30}
                    className={swatch.suits ? 'text-emerald-300' : 'text-rose-300'}
                  />
                ) : null}
                <Text className="text-4xl font-extrabold uppercase tracking-wide text-white">
                  {swatch.temperature}
                </Text>
              </View>
              <Text className="text-base capitalize text-white/80">{swatch.name}</Text>
            </View>
          </Animated.View>
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

      {/* The countdown is the FIRST thing in the recording, which makes it the
          most valuable second in the clip — and a bare numeral spends it on
          nothing. Short-form autoplays muted, so the opening frame has to carry
          the premise on its own. The hook rides along with the digit. */}
      {phase === 'counting' ? (
        <View
          pointerEvents="none"
          className="absolute inset-0 items-center justify-center gap-6 px-8">
          {/* Hook first and large, digit second and small — the inverse of the
              obvious layout, and deliberate. The countdown is for the person
              holding the phone; the hook is for everyone who sees the post. A
              huge "3" is the opening frame of the recording and means nothing
              to a stranger scrolling past. */}
          <View className="rounded-2xl bg-black/60 px-6 py-4">
            <Text className="text-center text-4xl font-extrabold leading-tight text-white">
              {personalised ? 'Warm vs cool on my skin' : 'Which half is your colour?'}
            </Text>
          </View>
          <View className="h-14 w-14 items-center justify-center rounded-full bg-black/45">
            <Text className="text-2xl font-bold text-white">{count}</Text>
          </View>
        </View>
      ) : null}

      {/* The undiagnosed run lands here instead of looping. It deliberately
          names no winner: the user has just seen a difference they cannot name,
          and that gap is the reason to go on to the analysis. Answering it here
          for free would close the funnel rather than open it.
          Rendered above the exit control on purpose — the chrome block below
          draws over this, so the X stays reachable.

          Light, unlike every other overlay on this screen, and the exception is
          deliberate. The rest of the chrome is dark because it sits over a live
          camera feed of an unknown room, where only white-on-dark stays legible.
          This card covers that feed almost entirely, so the constraint does not
          apply — and it is both the frame most likely to be screenshotted and
          the handover back into an otherwise light app. Theme tokens rather than
          literal white, so it follows the app in dark mode too.

          Fully opaque, and it has to be: tailwind.config.js defines background
          as hsl(var(--background)) with no <alpha-value> slot, so an opacity
          modifier like bg-background/95 cannot be built and would silently drop
          the fill instead of softening it. The live feed behind is a
          distraction on a CTA frame anyway. */}
      {phase === 'done' ? (
        <View className="absolute inset-0 items-center justify-center gap-6 bg-background px-8">
          {/* The question is the payload of this frame, not the buttons.
              Whatever is on screen when the recording stops is the last frame of
              the post, and "which half?" is the thing a viewer answers in the
              comments — which is the reach mechanism the clip exists for. The
              CTA is still needed by the person who filmed it, so it is demoted
              rather than dropped. The mark is repeated here because the card is
              opaque and covers the one at the top of the screen. */}
          <View className="items-center gap-4">
            <Text className="text-center text-4xl font-extrabold leading-tight">
              Which half looked better?
            </Text>
            <BrandMark size="lg" />
          </View>
          <Text className="text-center text-sm leading-5 text-muted-foreground">
            That difference is your undertone. One photo and a couple of rounds of draping name it
            properly — warm or cool, and which season sits inside it.
          </Text>
          <View className="w-full max-w-sm gap-2">
            <Button onPress={() => router.replace(isSignedIn ? '/capture' : '/sign-in')}>
              <Text>Find out properly</Text>
            </Button>
            <Button variant="outline" onPress={() => setPostOpen(true)}>
              <Text>Post your clip</Text>
            </Button>
            <Button variant="ghost" size="sm" onPress={begin}>
              <Text>Run it again</Text>
            </Button>
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

      {/* Pinned open on the end card too — chrome times out after a few
          seconds, and the end card's own buttons both go forward, so without
          this there is no way back off it. */}
      {chrome || phase === 'done' ? (
        <>
          {/* Above the crop-safe band on purpose: if it is still up when
              recording starts, the upload crop takes it out anyway. */}
          <Pressable
            onPress={() => router.back()}
            className="absolute left-4 top-6 h-10 w-10 items-center justify-center rounded-full bg-black/45 active:opacity-70">
            <Icon as={XIcon} size={20} className="text-white" />
          </Pressable>
          {/* The personalised run loops and never reaches the end card, so
              without this it would have no route to the post flow at all — and
              it is the more postable of the two, since it carries a season.
              Same crop-excluded band as the exit control. */}
          {running ? (
            <Pressable
              onPress={() => setPostOpen(true)}
              className="absolute right-4 top-6 h-10 flex-row items-center gap-1.5 rounded-full bg-black/45 px-4 active:opacity-70">
              <Icon as={Share2Icon} size={16} className="text-white" />
              <Text className="text-sm font-semibold text-white">Post</Text>
            </Pressable>
          ) : null}
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

      {/* Lifted clear of the bottom crop band when one is showing, so the Begin
          button does not sit inside the strip labelled as being cut off. */}
      {phase === 'ready' ? (
        <View
          className="absolute inset-x-0 bottom-0 items-center gap-4 px-6"
          style={{ paddingBottom: Math.max(48, cropBand + 16) }}>
          {/* Denser than the captions that sit over live footage, because this
              one lands on the pale cape during ready and 55% read as muddy
              against it. It is never in the recording — running hides it. */}
          <View className="rounded-2xl bg-black/70 px-4 py-3">
            <Text className="text-center text-sm text-white">
              {personalised
                ? 'Fill the oval, chin just above the cape. Start your screen recording, then begin.'
                : `Fill the oval, chin just above the cape. ${swatches.length} colours run on their own — warm first, then cool. Watch which half lifts your face.`}
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

      {/* Last in the tree so it covers everything, including the end card. */}
      {postOpen ? <PostSheet onDismiss={() => setPostOpen(false)} /> : null}
    </View>
  );
}

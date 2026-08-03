import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { SEASON_THEMES } from '@/lib/card/templates';
import { SEASON_RECOMMENDATIONS } from '@/lib/diagnosis/recommendations';
import type { CombinedResult } from '@/lib/diagnosis/types';
import { CheckIcon, XIcon } from 'lucide-react-native';
import * as React from 'react';
import { Animated, Image, PanResponder, View } from 'react-native';

const HANDLE_SIZE = 36;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * The diagnostic comparison: the face stays still and the fabric under the
 * chin wipes between the season's signature colour and its sharpest avoid
 * colour, the way a stylist swaps one drape for another.
 *
 * This is the still, considered cut: you control the wipe and can hold it
 * anywhere. `app/clip.tsx` is the filmable one — live camera, colours swapping
 * on a beat. Two things this one keeps that the clip cannot:
 *
 * 1. It works from the photo already taken, so it needs no second setup, no
 *    good light, and no willingness to be on camera again.
 * 2. It compares two colours side by side at once. The clip shows one colour at
 *    a time, which is better television and worse for actually deciding.
 *
 * The divider never splits the face. Splitting the photo down the middle would
 * compare one cheek under one colour against the other cheek under the other,
 * and faces are neither symmetric nor evenly lit.
 */
export function DrapeCompare({ photoUri, result }: { photoUri: string; result: CombinedResult }) {
  const best = SEASON_THEMES[result.final_season].palette[0];
  const worst = SEASON_RECOMMENDATIONS[result.final_season].avoid[0];

  // The divider is driven imperatively so dragging never re-renders the photo.
  // `width` cannot use the native driver, but the gesture is on the JS thread
  // anyway, so there is nothing to gain from one.
  const divider = React.useRef(new Animated.Value(0)).current;
  const dividerValue = React.useRef(0);
  const dragOrigin = React.useRef(0);
  // Mirrored: the ref is what the gesture clamps against without re-subscribing,
  // the state is what the clipped layer needs in order to lay itself out.
  const width = React.useRef(0);
  const [frameWidth, setFrameWidth] = React.useState(0);

  const setDivider = React.useCallback(
    (next: number) => {
      dividerValue.current = next;
      divider.setValue(next);
    },
    [divider],
  );

  // Dragging anywhere on the photo moves the divider, relative to where the
  // finger landed — a thin handle is a small target, and an absolute jump on
  // touch would throw the comparison away on a mistap.
  //
  // This sits inside the result ScrollView, so the two would otherwise trade
  // the responder back and forth on every drag and the wipe would stutter.
  // Claiming only on horizontal intent leaves vertical scrolling alone, and
  // refusing termination stops the ScrollView taking the gesture back mid-drag.
  const pan = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 3 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          dragOrigin.current = dividerValue.current;
        },
        onPanResponderMove: (_event, gesture) => {
          setDivider(clamp(dragOrigin.current + gesture.dx, 0, width.current));
        },
      }),
    [setDivider],
  );

  return (
    <View className="gap-3">
      <Text className="text-sm font-semibold text-muted-foreground">SEE IT ON YOUR SKIN</Text>

      <View
        className="aspect-[4/5] w-full overflow-hidden rounded-2xl bg-black"
        onLayout={(event) => {
          const next = event.nativeEvent.layout.width;
          if (next === width.current) return;
          width.current = next;
          setFrameWidth(next);
          setDivider(next / 2);
        }}
        {...pan.panHandlers}>
        <Image source={{ uri: photoUri }} className="absolute h-full w-full" resizeMode="cover" />

        {/* The avoid colour is the base layer; the best colour is laid over it
            up to the divider, the way a stylist lays one fabric over another. */}
        <Drape hex={worst.hex} />
        {/* Clipped to [0, divider] with transforms only. Animating `width`
            instead would re-run Yoga layout on every touch frame, which is
            what a wipe feels like when it stutters. The outer box slides its
            right edge to the divider; the inner box counter-slides by the same
            amount, so the drape stays put and only the clip window moves. */}
        <Animated.View
          pointerEvents="none"
          className="absolute inset-y-0 left-0 overflow-hidden"
          style={{
            width: frameWidth,
            transform: [{ translateX: Animated.subtract(divider, frameWidth) }],
          }}>
          <Animated.View
            className="h-full"
            style={{
              width: frameWidth,
              transform: [{ translateX: Animated.subtract(frameWidth, divider) }],
            }}>
            <Drape hex={best.hex} />
          </Animated.View>
        </Animated.View>

        <Animated.View
          pointerEvents="none"
          className="absolute inset-y-0 left-0 w-0.5 bg-white/90"
          style={{ transform: [{ translateX: divider }] }}
        />
        <Animated.View
          pointerEvents="none"
          className="absolute bottom-[14%] left-0 items-center justify-center rounded-full bg-white/90"
          style={{
            height: HANDLE_SIZE,
            width: HANDLE_SIZE,
            transform: [{ translateX: Animated.subtract(divider, HANDLE_SIZE / 2) }],
          }}>
          <View className="h-4 w-0.5 rounded-full bg-neutral-500" />
        </Animated.View>

        <View
          pointerEvents="none"
          className="absolute inset-x-0 bottom-0 flex-row items-end justify-between p-3">
          <DrapeLabel name={best.name} verdict="best" />
          <DrapeLabel name={worst.name} verdict="avoid" />
        </View>
      </View>

      <Text className="text-xs text-muted-foreground">
        Drag across the photo to swap the fabric under your chin — watch your face, not the colour.
        Shadows and uneven tone stand out more under the wrong one.
      </Text>
    </View>
  );
}

/** The draped fabric: wider than the frame so its curve reads as cloth, not a bar. */
function Drape({ hex }: { hex: string }) {
  return (
    <View
      className="absolute inset-x-[-12%] bottom-[-4%]"
      style={{
        height: '32%',
        backgroundColor: hex,
        borderTopLeftRadius: 999,
        borderTopRightRadius: 999,
      }}
    />
  );
}

function DrapeLabel({ name, verdict }: { name: string; verdict: 'best' | 'avoid' }) {
  return (
    <View className="max-w-[46%] flex-row items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5">
      <Icon
        as={verdict === 'best' ? CheckIcon : XIcon}
        size={12}
        className={verdict === 'best' ? 'text-emerald-300' : 'text-rose-300'}
      />
      <Text className="text-xs font-medium capitalize text-white" numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

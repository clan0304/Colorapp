import { Text } from '@/components/ui/text';
import { BRAND_NAME } from '@/lib/card/templates';
import { cn } from '@/lib/utils';
import { Image, View, type ImageSourcePropType } from 'react-native';

/**
 * Optional logo, drawn to the left of the wordmark. Point this at a
 * `require()`d asset once one exists.
 *
 * A symbol never replaces the wordmark: someone who sees the clip in a feed
 * searches for a name, not a shape, so the letters have to survive on their
 * own at thumbnail size.
 */
const BRAND_LOGO: ImageSourcePropType | null = null;

/**
 * Optional handle, drawn under the wordmark (e.g. `@somehandle`). A handle is
 * actionable in the feed where the clip is seen, while the app name costs a
 * trip to the store — so this is worth filling in as soon as the accounts
 * exist. Left null until then rather than shipping a handle that 404s.
 */
const BRAND_HANDLE: string | null = null;

/**
 * The attribution stamped on everything a user can post: the sweep clip, the
 * saved still, and (via {@link BRAND_NAME}) the Creatomate result card.
 *
 * This is the whole return on user-generated sharing — a clip that spreads
 * without it costs us the bandwidth and earns nothing. It is deliberately
 * small: the bigger the stamp, the fewer people post at all, and a share that
 * never happens converts worse than one that is quietly branded.
 *
 * Callers are responsible for keeping it inside the crop-safe band; a mark
 * that gets cut off on upload is the same as no mark.
 */
export function BrandMark({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const large = size === 'lg';
  return (
    <View
      className={cn(
        'items-end bg-black/45 px-3 py-1.5',
        // A handle adds a second line, which a pill radius does not sit well on.
        BRAND_HANDLE ? 'rounded-2xl' : 'rounded-full',
      )}>
      <View className="flex-row items-center gap-1.5">
        {BRAND_LOGO ? (
          <Image
            source={BRAND_LOGO}
            className={large ? 'h-4 w-4' : 'h-3 w-3'}
            resizeMode="contain"
          />
        ) : null}
        <Text
          className={cn(
            'font-semibold tracking-wider text-white',
            large ? 'text-xs' : 'text-[10px]',
          )}>
          {BRAND_NAME.toUpperCase()}
        </Text>
      </View>
      {BRAND_HANDLE ? (
        <Text className={cn('text-white/80', large ? 'text-[10px]' : 'text-[8px]')}>
          {BRAND_HANDLE}
        </Text>
      ) : null}
    </View>
  );
}

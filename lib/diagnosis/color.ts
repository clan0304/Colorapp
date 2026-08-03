const HEX_PATTERN = /^#?([0-9a-f]{6})$/i;

/**
 * Canonical `#RRGGBB` form of a hex color, or null if the value is not one.
 *
 * The model writes `observed_colors` free-form — bare, lowercase, or an empty
 * string for a region it could not read — so anything coming out of an analysis
 * passes through here before it reaches a style prop or a computation.
 */
export function normalizeHex(hex: string): string | null {
  const match = HEX_PATTERN.exec(hex.trim());
  return match ? `#${match[1].toUpperCase()}` : null;
}

/** sRGB channel (0–1) → linear-light. */
function linearize(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/**
 * Perceptual lightness (CIE L*, 0–100) of an `#RRGGBB` color, D65 white point.
 *
 * Used to bucket diagnoses by how light or deep the observed skin tone is.
 * L* is used rather than raw RGB average because equal steps in L* are equal
 * perceptual steps — an RGB average would crowd every deep tone into one bin.
 *
 * Returns null for the empty strings and malformed values the model can emit.
 */
export function lightness(hex: string): number | null {
  const normalized = normalizeHex(hex);
  if (normalized === null) return null;
  const int = parseInt(normalized.slice(1), 16);
  const r = linearize(((int >> 16) & 0xff) / 255);
  const g = linearize(((int >> 8) & 0xff) / 255);
  const b = linearize((int & 0xff) / 255);

  // Relative luminance Y against a D65 white of Y=1, so Y/Yn is just Y.
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const f = y > (6 / 29) ** 3 ? Math.cbrt(y) : y / (3 * (6 / 29) ** 2) + 4 / 29;
  return 116 * f - 16;
}

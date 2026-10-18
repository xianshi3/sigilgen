/**
 * Contrast between a mark and the surface it is shown on.
 *
 * The studio lets the reader put a mark on a pale sheet, a dark one, or a checkerboard. Most of the thirty
 * curated palettes are designed against a pale ground — `#f5f5f0`, `#fffbeb`, `#faf7f0` — because that is
 * what a logo is usually printed on. So choosing the dark sheet puts a dark-ink mark on a near-black one,
 * and it simply is not there. Nothing was broken; the mark was drawn for the other surface.
 *
 * The question this module answers is "can the reader see it", and it answers it by measurement rather
 * than by assuming a palette is light or dark. A palette's `background` field records the ground it was
 * designed for, but the useful comparison is between the ink that is actually painted and the surface it
 * is actually on, because a palette may be dark-ground *and* carry dark ink.
 */

/**
 * Below this ratio the mark is not credibly visible, whatever else is true of it.
 *
 * Calibrated against the two cases that define the problem rather than borrowed from WCAG. Its 3:1 is
 * the bar for text and interface components: things that are read, where the cost of marginal contrast is
 * fatigue. A mark is looked at, and its failure mode is not being tiring but being *absent* — so the line
 * belongs lower, and it belongs between a measured pair. A near-black mark on the dark sheet scores
 * 1.23:1 and is genuinely invisible; a green wordmark that is plainly legible in a screenshot of the same
 * sheet scores 2.8:1. Two is the line between them.
 */
export const MIN_CONTRAST = 2

/**
 * The sRGB transfer function's inverse, applied to one linear channel.
 *
 * At module scope rather than inside the converter because it captures nothing: rebuilt on every call, it
 * is a closure allocated per colour for no reason.
 *
 * @param channel - A linear sRGB channel, 0–1.
 * @returns The gamma-encoded channel, rounded to 0–255.
 */
function encodeChannel(channel: number): number {
  const clamped = Math.min(1, Math.max(0, channel))
  const gamma = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055
  return Math.round(gamma * 255)
}

/**
 * The sRGB transfer function, applied to one channel.
 *
 * @param channel - A channel, 0–255.
 * @returns The linear channel, 0–1.
 */
function linearise(channel: number): number {
  const c = channel / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/**
 * WCAG relative luminance of an sRGB colour.
 *
 * The transfer function is the one WCAG defines, not an approximation of it: the channels are linearised
 * with the piecewise curve before weighting, and weighting them first is the usual way to get an answer
 * that is close enough to look right and wrong enough to fail a real case.
 *
 * @param channels - Red, green and blue, each 0–255.
 * @returns Luminance from 0 (black) to 1 (white).
 */
function relativeLuminance([r, g, b]: readonly [number, number, number]): number {
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b)
}

/**
 * Converts an `oklch()` colour to sRGB.
 *
 * Needed because a token like `--paper-dark: oklch(0.19 0.006 265)` is what the sheet is actually painted
 * with, and `getComputedStyle` hands it back in that same form rather than as `rgb()`. The alternative is
 * to keep a second copy of every paper colour in JavaScript, and a second copy is a colour that drifts.
 *
 * @param value - An `oklch(L C H)` string, with or without the `/ alpha` tail.
 * @returns The channels, each 0–255 and clamped, or `null` if the value is not `oklch()`.
 */
function oklchToSrgb(value: string): [number, number, number] | null {
  const match = /oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+%?)/i.exec(value)
  if (match === null) {
    return null
  }
  // Destructured with defaults rather than indexed with `??`. The groups are non-optional in the pattern,
  // so a fallback never runs — and a branch that cannot be taken is a branch that cannot be tested, which
  // is how it ends up in a coverage report as a gap forever.
  const [, rawLightness = '0', rawChroma = '0', rawHue = '0'] = match
  // The three components do not share a range: lightness is 0–1, chroma tops out near 0.4 (so `100%`
  // there means 0.4, not 1) and hue is degrees. Treating them alike is how a converter ends up quietly
  // wrong about a colour that looks fine and measures differently.
  const lightness = rawLightness.endsWith('%')
    ? Number.parseFloat(rawLightness) / 100
    : Number.parseFloat(rawLightness)
  const chroma = rawChroma.endsWith('%')
    ? (Number.parseFloat(rawChroma) / 100) * 0.4
    : Number.parseFloat(rawChroma)
  const hue = (Number.parseFloat(rawHue) * Math.PI) / 180

  const a = chroma * Math.cos(hue)
  const b = chroma * Math.sin(hue)

  // Oklab to linear sRGB, via the LMS cone responses.
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3

  return [
    encodeChannel(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    encodeChannel(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    encodeChannel(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

/**
 * Parses a computed colour into sRGB channels.
 *
 * Accepts the forms a browser actually returns for a background: `rgb()`/`rgba()`, `color(srgb …)`, a
 * `#rgb`/`#rrggbb` literal, and `oklch()`.
 *
 * @param value - Any colour the browser computed.
 * @returns The channels, or `null` when the form is not one of those.
 */
export function toRgb(value: string): [number, number, number] | null {
  const text = value.trim()

  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(text)
  if (hex !== null) {
    const [, digits = ''] = hex
    const full =
      digits.length === 3
        ? digits
            .split('')
            .map(d => d + d)
            .join('')
        : digits
    return [
      Number.parseInt(full.slice(0, 2), 16),
      Number.parseInt(full.slice(2, 4), 16),
      Number.parseInt(full.slice(4, 6), 16),
    ]
  }

  const rgb = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text)
  if (rgb !== null) {
    const [, r = '0', g = '0', b = '0'] = rgb
    return [Number(r), Number(g), Number(b)]
  }

  const srgb = /color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i.exec(text)
  if (srgb !== null) {
    const [, r = '0', g = '0', b = '0'] = srgb
    return [Math.round(Number(r) * 255), Math.round(Number(g) * 255), Math.round(Number(b) * 255)]
  }

  return oklchToSrgb(text)
}

/**
 * The WCAG contrast ratio between two colours, from 1 to 21.
 *
 * @param ink - The colour of the mark.
 * @param ground - The surface behind it.
 * @returns The ratio, or `null` if either colour could not be read.
 */
export function contrastRatio(ink: string, ground: string): number | null {
  const a = toRgb(ink)
  const b = toRgb(ground)
  if (a === null || b === null) {
    return null
  }
  const lighter = Math.max(relativeLuminance(a), relativeLuminance(b))
  const darker = Math.min(relativeLuminance(a), relativeLuminance(b))
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * The worst contrast any of a mark's painted colours manages against a surface.
 *
 * The mark is read as one thing, so its readability is its *least* legible part. Averaging would let a
 * single dark shape disappear behind a bright majority, which is exactly the failure being guarded.
 *
 * @param inks - Every colour the mark is painted in.
 * @param ground - The surface behind it.
 * @returns The lowest ratio found, or `null` if nothing could be read.
 */
export function worstContrast(inks: readonly string[], ground: string): number | null {
  let worst: number | null = null
  for (const ink of inks) {
    const ratio = contrastRatio(ink, ground)
    if (ratio !== null && (worst === null || ratio < worst)) {
      worst = ratio
    }
  }
  return worst
}

/** The three surfaces the stage can put behind a mark. */
export type PaperBackdrop = 'light' | 'dark' | 'board'

/**
 * The token each paper colour is declared as.
 *
 * Reading the token rather than repeating its value is the whole point: the sheet is painted from
 * `--paper-dark`, and a second copy of that colour in JavaScript would be a second copy to forget. When
 * the token moved, the measurement would go on confidently describing the old sheet.
 */
const PAPER_TOKEN: Record<PaperBackdrop, string> = {
  light: '--paper-light',
  dark: '--paper-dark',
  // The checkerboard is drawn as a gradient over this colour, so it is the base the stripes sit on. The
  // lighter squares are within a few points of it and the darker one is the honest worst case.
  board: '--paper-checker-b',
}

/**
 * The colour a sheet is actually painted with.
 *
 * Read from the document's own resolved custom properties, so it is the same value the browser is
 * painting and not a description of it. Called during render because that is where the answer is needed
 * and because reading the cascade changes nothing: no state is written and no effect is scheduled.
 *
 * @param backdrop - Which sheet is behind the mark.
 * @returns The colour as the browser resolved it, or an empty string where no tokens are loaded.
 */
export function readPaper(backdrop: PaperBackdrop): string {
  const root = globalThis.document?.documentElement
  if (root === undefined) {
    return ''
  }
  return getComputedStyle(root).getPropertyValue(PAPER_TOKEN[backdrop]).trim()
}

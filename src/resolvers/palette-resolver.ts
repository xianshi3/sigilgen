/**
 * Chooses the colour scheme for a concept.
 *
 * Three input shapes are supported, in priority order:
 *
 * 1. A palette id from the brain, e.g. `--palette glacier-ice`.
 * 2. A comma separated colour list, e.g. `--palette "#2B1B12,cream,rust"`. Colours may be hex or a
 *    name from `src/brain/colors.json`. Two or three colours become primary/secondary/accent; a
 *    fourth becomes the highlight. A trailing `none` or `transparent` clears the background.
 * 3. Nothing, in which case the mood's palette pool is used.
 *
 * A background is only produced when the caller asked for one, or when the user explicitly listed
 * four or more colours.
 */

import { COLOR_NAMES, PALETTES, findPalette, normaliseColour } from '../brain/index'
import { clamp } from '../format'
import type { MoodMatch, PaletteEntry, ResolvedRequest } from '../types'
import type { SeedResolver } from '../seed-resolver'

/** Palette used when nothing else resolves. */
const FALLBACK_PALETTE: PaletteEntry = {
  id: 'ink-monolith',
  primary: '#14161a',
  secondary: '#2b2f38',
  accent: '#f5f5f0',
  background: null,
  tags: ['fallback'],
}

/** Luminance above which a colour is treated as light. */
const LIGHT_LUMA = 0.72

/**
 * Resolves one colour token to a hex string.
 *
 * @param token - A hex literal or a colour name.
 * @returns The normalised hex colour, or `null` when the token is `none`/`transparent`/unknown.
 */
export function resolveColour(token: string): string | null {
  const trimmed = token.trim()
  if (trimmed === '') {
    return null
  }
  const direct = normaliseColour(trimmed)
  if (direct !== null) {
    return direct
  }
  const named = COLOR_NAMES[trimmed.toLowerCase()]
  return named === undefined ? null : named
}

/**
 * Builds a palette from an explicit colour list.
 *
 * @param id - Palette id to record; derived from the mood when blank.
 * @param tokens - Raw colour tokens.
 * @returns A palette, or `null` when fewer than two tokens resolved.
 */
export function paletteFromColours(id: string, tokens: readonly string[]): PaletteEntry | null {
  const colours = tokens.map(resolveColour).filter((token): token is string => token !== null)
  const [primary, secondary, accent, highlight] = colours
  if (primary === undefined || secondary === undefined) {
    return null
  }
  return {
    id: `custom-${id}`,
    primary,
    secondary,
    accent: accent ?? primary,
    highlight,
    // A colour list says nothing about the canvas. `applyBackground` fills one in only when the
    // caller asked for it, using the same rule as curated palettes.
    background: null,
    tags: ['custom', 'user-specified'],
  }
}

/**
 * Computes relative luminance, used to decide whether a background needs its own colour.
 *
 * @param hex - A `#rrggbb` colour.
 * @returns Luminance in `[0, 1]`.
 */
export function luminance(hex: string): number {
  const value = hex.startsWith('#') ? hex.slice(1) : hex
  const full =
    value.length === 3
      ? `${value[0]}${value[0]}${value[1]}${value[1]}${value[2]}${value[2]}`
      : value.slice(0, 6)
  const channels = [0, 2, 4].map(offset => {
    const part = Number.parseInt(full.slice(offset, offset + 2), 16) / 255
    return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4
  })
  return (
    0.2126 * (channels[0] as number) +
    0.7152 * (channels[1] as number) +
    0.0722 * (channels[2] as number)
  )
}

/**
 * Computes the WCAG contrast ratio between two colours, from `1` to `21`.
 *
 * @param a - First colour.
 * @param b - Second colour.
 * @returns The contrast ratio.
 */
export function contrastRatio(a: string, b: string): number {
  const first = luminance(a)
  const second = luminance(b)
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Ratio below which a colour pair is considered unusable for a logo. */
const MINIMUM_RATIO = 4.5

/** Neutral ink used when no palette colour is legible on a light background. */
const NEUTRAL_DARK = '#111827'

/** Neutral paper used when no palette colour is legible on a dark background. */
const NEUTRAL_LIGHT = '#f8fafc'

/**
 * Picks the palette colour most legible against a background.
 *
 * Chooses by WCAG contrast ratio rather than raw luminance distance: "how far is this from the
 * background" quietly rewards a colour that is nearly *identical* to it when a palette is all light,
 * which is exactly how pale-on-pale wordmarks happen. When no palette colour clears the legibility
 * floor, this falls back to neutral ink or paper so the mark is always readable.
 *
 * @param palette - The palette to choose from.
 * @param background - The colour the mark sits on.
 * @returns A fill that clears the legibility floor.
 */
export function contrastFill(palette: PaletteEntry, background: string): string {
  const candidates = [palette.primary, palette.secondary, palette.accent, palette.highlight]
  let best: string | null = null
  let bestRatio = 0
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === background) {
      continue
    }
    const ratio = contrastRatio(candidate, background)
    if (ratio > bestRatio) {
      bestRatio = ratio
      best = candidate
    }
  }
  if (best !== null && bestRatio >= MINIMUM_RATIO) {
    return best
  }
  return luminance(background) > 0.4 ? NEUTRAL_DARK : NEUTRAL_LIGHT
}

/**
 * Returns `candidate` when it is legible on `background`, otherwise `fallback`.
 *
 * Used where a palette slot is chosen for a design reason rather than for contrast — an accent that
 * leads a wordmark, say. Without this check the accent can be the one colour in the palette that
 * vanishes into the background.
 *
 * @param candidate - The colour to try.
 * @param background - The colour it sits on.
 * @param fallback - The colour to use when the candidate is illegible.
 * @returns A legible colour.
 */
export function readableOn(candidate: string, background: string, fallback: string): string {
  if (candidate === background || contrastRatio(candidate, background) < MINIMUM_RATIO) {
    return fallback
  }
  return candidate
}

/**
 * Chooses a palette.
 *
 * @param request - The validated request.
 * @param mood - The resolved mood.
 * @param seed - The deterministic stream for this concept.
 * @param index - Zero-based concept index, used to spread variations across the mood's pool.
 * @returns The palette to apply.
 */
export function resolvePalette(
  request: ResolvedRequest,
  mood: MoodMatch,
  seed: SeedResolver,
  index: number
): PaletteEntry {
  if (request.palette !== null) {
    const trimmed = request.palette.trim()
    const named = findPalette(trimmed)
    if (named) {
      return applyBackground(named, request)
    }
    const tokens = trimmed.split(/[,\s]+/).filter(token => token !== '')
    const custom = paletteFromColours(mood.mood.id, tokens)
    if (custom) {
      return applyBackground(custom, request)
    }
    // Unrecognised palette string: fall through to the mood pool rather than failing the whole run.
  }

  const pool = mood.mood.paletteIds
    .map(id => PALETTES.find(entry => entry.id === id))
    .filter((entry): entry is PaletteEntry => entry !== undefined)

  if (pool.length === 0) {
    return applyBackground(FALLBACK_PALETTE, request)
  }

  // The concept index nudges the pick so that `variations: 3` shows three different colour stories.
  const spread = seed.shuffle(pool)
  const picked = spread[clamp(index, 0, spread.length - 1)] ?? (spread[0] as PaletteEntry)
  return applyBackground(picked, request)
}

/**
 * Applies the caller's background preference to a palette.
 *
 * When the caller did not ask for a background, a light palette's own background colour is dropped
 * so the mark stays transparent. When they did ask, a light scheme gets its background filled in.
 *
 * @param palette - The palette to adjust.
 * @param request - The validated request.
 * @returns The adjusted palette.
 */
function applyBackground(palette: PaletteEntry, request: ResolvedRequest): PaletteEntry {
  if (!request.background) {
    return palette.background === null ? palette : { ...palette, background: null }
  }
  if (palette.background !== null) {
    return palette
  }
  const isLight = luminance(palette.primary) > LIGHT_LUMA || luminance(palette.accent) > LIGHT_LUMA
  return { ...palette, background: isLight ? '#ffffff' : palette.primary }
}

/**
 * Explains the palette choice in one line.
 *
 * @param palette - The chosen palette.
 * @param request - The validated request.
 * @returns A short rationale.
 */
export function explainPalette(palette: PaletteEntry, request: ResolvedRequest): string {
  if (palette.tags.includes('custom')) {
    return `Palette built from the colours supplied by the caller (${palette.primary}, ${palette.secondary}, ${palette.accent}).`
  }
  const source = request.palette === null ? 'mood' : 'requested'
  return `Palette "${palette.id}" (${source}) with background ${palette.background ?? 'transparent'}.`
}

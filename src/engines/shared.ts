/**
 * Drawing helpers shared by the engines.
 *
 * Engines are pure functions from {@link EngineInput} to `SVGElement[]`: no I/O, no randomness beyond
 * the supplied {@link SeedResolver}, no dependency on the router or the resolvers. Everything an
 * engine needs has already been resolved for it.
 */

import { normaliseLetters } from '../text'
import { transformPath, pathBounds } from '../path'
import {
  capsulePath,
  discPath,
  regularPolygonPath,
  ringPath,
  shieldPath,
  superellipsePath,
} from '../geometry'
import type { EngineInput, IconEntry, SVGElement } from '../types'
import type { SeedResolver } from '../seed-resolver'

/** Container shapes available to the monogram engine. */
export const CONTAINERS: readonly string[] = ['circle', 'squircle', 'hexagon', 'shield', 'seal']

/** Letter layout strategies for the monogram engine. */
export const LETTER_LAYOUTS: readonly string[] = ['side-by-side', 'stacked', 'overlap']

/**
 * Fraction of a container's radius that stays clear across the band the letters occupy.
 *
 * The letters fill most of the container's height, so the widest point of the frame is not the width
 * available to them: a hexagon's bounding box is its full width only on a narrow band around the
 * middle, and its flanks stand at `0.866 × radius`. Measuring against the bounding box is how a letter
 * pokes out through the side of a hexagon.
 */
export const CONTAINER_INNER: Record<string, number> = {
  circle: 1,
  squircle: 0.94,
  hexagon: 0.866,
  shield: 1,
  seal: 0.86,
}

/**
 * Builds a `<path>` element.
 *
 * @param d - Path data.
 * @param fill - Fill colour.
 * @returns The element.
 */
export function path(d: string, fill: string): SVGElement {
  return { tag: 'path', attrs: { d, fill } }
}

/**
 * Builds the path for a monogram container.
 *
 * @param kind - One of {@link CONTAINERS}.
 * @param cx - Centre x.
 * @param cy - Centre y.
 * @param radius - Radius, or half-width for the shield.
 * @returns Path data, or an empty string for an unknown kind.
 */
export function containerPath(kind: string, cx: number, cy: number, radius: number): string {
  switch (kind) {
    case 'circle':
      return discPath(cx, cy, radius)
    case 'squircle':
      return superellipsePath(cx, cy, radius, radius, 4.5, 72)
    case 'hexagon':
      return regularPolygonPath(cx, cy, radius, 6, -90)
    case 'shield':
      return shieldPath(cx, cy - radius, radius * 2, radius * 2, 0.45)
    case 'seal':
      return joinPaths([
        ringPath(cx, cy, radius, radius, radius * 0.14),
        discPath(cx, cy, radius * 0.86),
      ])
    default:
      return discPath(cx, cy, radius)
  }
}

/**
 * Concatenates path fragments with single spaces.
 *
 * @param parts - Fragments to join.
 * @returns The joined path data.
 */
export function joinPaths(parts: readonly string[]): string {
  return parts.filter(part => part !== '').join(' ')
}

/**
 * Places a pictogram.
 *
 * Icons are authored on a nominal `0 0 24 24` grid, but "nominal" is the operative word: a designer
 * drawing a pine tree uses less of the box than a designer drawing a square, and without correction
 * that difference shows up directly as inconsistent icon sizes in a lockup. So each icon is measured
 * once and scaled to fill the box it is given, which makes every icon optically the same size.
 *
 * @param icon - The icon to place.
 * @param x - Left edge of the icon's box.
 * @param y - Top edge of the icon's box.
 * @param box - Side length of the icon's box in user units.
 * @param fill - Fill colour.
 * @returns The element.
 */
export function placeIcon(
  icon: IconEntry,
  x: number,
  y: number,
  box: number,
  fill: string
): SVGElement {
  const place = iconPlacement(icon, x, y, box)
  return path(transformPath(icon.path, place.scale, place.translateX, place.translateY), fill)
}

/**
 * The ink size an icon will actually occupy in a box of side `box`.
 *
 * `placeIcon` scales by the *larger* of the icon's two extents, so a pictogram that is taller than it
 * is wide is letterboxed horizontally and its ink comes out narrower *and shorter* than the box it was
 * given. Any engine that lays out around an icon has to know that, or it centres on a box the ink does
 * not fill: a vertical wordmark came out five percent of the canvas low because the name was positioned
 * against a full-height icon box that the icon only filled to ninety-three percent.
 *
 * Derived from the same measurement {@link placeIcon} uses, so the two cannot disagree.
 *
 * @param icon - The icon to place.
 * @param box - Side length of the icon's box in user units.
 * @returns The ink width and height in user units.
 */
export function iconInkSize(icon: IconEntry, box: number): { width: number; height: number } {
  const { width, height, scale } = iconPlacement(icon, 0, 0, box)
  return { width: width * scale, height: height * scale }
}

/** The scale and translation {@link placeIcon} will use, computed once. */
function iconPlacement(
  icon: IconEntry,
  x: number,
  y: number,
  box: number
): {
  width: number
  height: number
  offsetX: number
  offsetY: number
  scale: number
  translateX: number
  translateY: number
} {
  const [minX = 0, minY = 0, vbWidth = 24, vbHeight = 24] = icon.viewBox.split(/\s+/).map(Number)
  const geometry = iconExtent(icon)
  // Fall back to the declared grid when an icon somehow measures as empty.
  const { width, height, offsetX, offsetY } = geometry ?? {
    width: vbWidth,
    height: vbHeight,
    offsetX: -minX,
    offsetY: -minY,
  }

  const scale = box / Math.max(width, height)
  return {
    width,
    height,
    offsetX,
    offsetY,
    scale,
    translateX: x + (box - width * scale) / 2 - offsetX * scale,
    translateY: y + (box - height * scale) / 2 - offsetY * scale,
  }
}

/** Measured icon extents, cached per key: measuring is a parse, and placement happens repeatedly. */
const EXTENT_CACHE = new Map<
  string,
  { width: number; height: number; offsetX: number; offsetY: number }
>()

/**
 * Measures an icon's own bounding box once and remembers it.
 *
 * @param icon - The icon to measure.
 * @returns The extent, or `null` when the icon encloses no area.
 */
function iconExtent(
  icon: IconEntry
): { width: number; height: number; offsetX: number; offsetY: number } | null {
  const cached = EXTENT_CACHE.get(icon.key)
  if (cached !== undefined) {
    return cached
  }
  const bounds = pathBounds(icon.path)
  if (bounds === null) {
    return null
  }
  const extent = {
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
    offsetX: bounds.minX,
    offsetY: bounds.minY,
  }
  EXTENT_CACHE.set(icon.key, extent)
  return extent
}

/**
 * Chooses a value from a list, deterministically, unless the caller has asked for a specific one.
 *
 * A `forced` value that is not in `items` is ignored rather than rejected. A preference is a hint
 * about taste, and a hint must never be able to fail a render: an interface that offers "hexagon" to a
 * monogram and then throws would be worse than one that quietly keeps the seeded choice. Absent or
 * unusable input therefore falls through to exactly the behaviour that existed before this parameter
 * did, which is what keeps output byte-identical for a configuration with no preferences.
 *
 * @param items - Candidates.
 * @param seed - The deterministic stream.
 * @param forced - A value the caller wants, or `null`/absent to let the seed choose.
 * @returns The chosen item.
 */
export function pick<T>(items: readonly T[], seed: SeedResolver, forced?: string | null): T {
  if (forced !== null && forced !== undefined && (items as readonly unknown[]).includes(forced)) {
    return forced as T
  }
  return seed.choice(items)
}

/**
 * Draws a short accent rule, used by lettermarks and wordmarks as an optical anchor.
 *
 * @param centreX - Centre x.
 * @param y - Centre y of the rule.
 * @param width - Width of the rule.
 * @param height - Thickness of the rule.
 * @param fill - Fill colour.
 * @returns The element.
 */
export function accentRule(
  centreX: number,
  y: number,
  width: number,
  height: number,
  fill: string
): SVGElement {
  return path(capsulePath(centreX, y, width, height), fill)
}

/**
 * Derives the letters a monogram should draw.
 *
 * One- and two-letter names use themselves. Longer names use the initials of the first two *words of
 * the brand name* — not of the keywords, which would produce marks like "LF" for "Ledgerly" just
 * because the brief mentioned fintech. A single-word name falls back to its first letter, because the
 * first two letters of one long word are just a smaller wordmark.
 *
 * @param input - The engine input.
 * @returns One or two uppercase letters.
 */
export function monogramLetters(input: EngineInput): string {
  const { letters } = input
  if (letters.length === 0) {
    return ''
  }
  if (letters.length <= 2) {
    return letters
  }
  const words = input.request.nameWords
  if (words.length >= 2) {
    const first = (words[0] as string)[0] ?? ''
    const second = (words[1] as string)[0] ?? ''
    return normaliseLetters(`${first}${second}`)
  }
  return letters.slice(0, 1)
}

/**
 * Derives the letters a wordmark should draw.
 *
 * Wordmarks show the whole name; multi-word names are drawn with a space so the run stays readable.
 *
 * @param input - The engine input.
 * @returns The letters to draw, spaces included.
 */
export function wordmarkLetters(input: EngineInput): string {
  const words = input.request.nameWords
  if (words.length < 2) {
    return input.letters
  }
  const spaced = words.map(word => normaliseLetters(word)).filter(word => word !== '')
  return spaced.join(' ')
}

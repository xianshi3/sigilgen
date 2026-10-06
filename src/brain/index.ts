/**
 * Loads and validates the curated JSON brain.
 *
 * The brain is the design surface of the project: palettes, fonts, icons and mood rules that turn a
 * brand name into specific, explainable choices. It is bundled into the JavaScript at build time, so
 * loading costs nothing at runtime and works identically in Node, browsers and workers.
 *
 * Validation is deliberately strict. A dangling reference in a mood rule or a malformed colour is a
 * content bug that should fail loudly in development rather than silently produce a broken logo.
 */

import iconsData from './icons.json'
import colorsData from './colors.json'
import fontsData from './fonts.json'
import moodsData from './moods.json'
import palettesData from './palettes.json'
import type { Brain, FontCategory, FontEntry, IconEntry, MoodRule, PaletteEntry } from '../types'
import { isSafePathData } from '../path'

/** Accepted colour literals: `#rgb`, `#rrggbb`, `#rrggbbaa`. */
const HEX_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/** Accepted ids and keys. */
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Every engine id, used to reject mood weights for unknown engines. */
const ENGINE_IDS: ReadonlySet<string> = new Set([
  'monogram',
  'wordmark',
  'lettermark',
  'abstract',
  'emblem',
])

/**
 * Finds ids that appear more than once.
 *
 * @param ids - Candidate ids in declaration order.
 * @returns The repeated ids, sorted. Empty when every id is unique.
 */
function duplicateIds(ids: readonly string[]): string[] {
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) {
      repeated.add(id)
    }
    seen.add(id)
  }
  return [...repeated].toSorted()
}

/**
 * Throws when the brain is internally inconsistent.
 *
 * @param brain - The assembled brain.
 * @throws {Error} On the first inconsistency found.
 */
function assertIntegrity(brain: Brain): void {
  const paletteIds = new Set(brain.palettes.map(entry => entry.id))
  const fontIds = new Set(brain.fonts.map(entry => entry.id))
  const iconKeys = new Set(brain.icons.map(entry => entry.key))

  const dupePalettes = duplicateIds(brain.palettes.map(entry => entry.id))
  if (dupePalettes.length > 0) {
    throw new Error(`duplicate palette ids: ${dupePalettes.join(', ')}`)
  }
  const dupeFonts = duplicateIds(brain.fonts.map(entry => entry.id))
  if (dupeFonts.length > 0) {
    throw new Error(`duplicate font ids: ${dupeFonts.join(', ')}`)
  }
  const dupeIcons = duplicateIds(brain.icons.map(entry => entry.key))
  if (dupeIcons.length > 0) {
    throw new Error(`duplicate icon keys: ${dupeIcons.join(', ')}`)
  }
  const dupeMoods = duplicateIds(brain.moods.map(entry => entry.id))
  if (dupeMoods.length > 0) {
    throw new Error(`duplicate mood ids: ${dupeMoods.join(', ')}`)
  }

  for (const font of brain.fonts) {
    for (const letter of Object.keys(font.glyphs).toSorted()) {
      const d = font.glyphs[letter]
      if (typeof d !== 'string' || d === '' || !isSafePathData(d)) {
        throw new Error(`font ${font.id}: glyph ${letter} has invalid path data`)
      }
    }
    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      if (font.glyphs[letter] === undefined) {
        throw new Error(`font ${font.id}: missing glyph ${letter}`)
      }
    }
  }

  for (const icon of brain.icons) {
    if (typeof icon.path !== 'string' || icon.path === '') {
      throw new Error(`icon ${icon.key}: empty path`)
    }
  }

  for (const mood of brain.moods) {
    for (const id of mood.paletteIds) {
      if (!paletteIds.has(id)) {
        throw new Error(`mood ${mood.id}: unknown palette "${id}"`)
      }
    }
    for (const id of mood.fontIds) {
      if (!fontIds.has(id)) {
        throw new Error(`mood ${mood.id}: unknown font "${id}"`)
      }
    }
    for (const key of mood.iconKeys) {
      if (!iconKeys.has(key)) {
        throw new Error(`mood ${mood.id}: unknown icon "${key}"`)
      }
    }
    for (const engine of Object.keys(mood.engineWeights)) {
      if (!ENGINE_IDS.has(engine)) {
        throw new Error(`mood ${mood.id}: unknown engine "${engine}"`)
      }
    }
  }
}

/**
 * Normalises a colour literal to lowercase `#rrggbb`.
 *
 * @param value - The literal to normalise.
 * @returns The normalised colour, or `null` when the input was invalid.
 */
function normaliseColour(value: string): string | null {
  const lowered = value.trim().toLowerCase()
  if (lowered === 'transparent' || lowered === 'none') {
    return null
  }
  if (!HEX_PATTERN.test(lowered)) {
    return null
  }
  if (lowered.length === 4) {
    return `#${lowered[1]}${lowered[1]}${lowered[2]}${lowered[2]}${lowered[3]}${lowered[3]}`
  }
  return lowered.slice(0, 7)
}

/**
 * The colour name table used to resolve `--palette "#2B1B12,cream,rust"`.
 */
export const COLOR_NAMES: Readonly<Record<string, string | null>> = Object.freeze(
  Object.fromEntries(
    Object.entries(colorsData.colors).map(([name, value]) => [name, normaliseColour(value ?? '')])
  )
)

/** Every curated palette. */
export const PALETTES: readonly PaletteEntry[] = palettesData.palettes.map(entry => ({
  id: entry.id,
  primary: normaliseColour(entry.primary) ?? entry.primary,
  secondary: normaliseColour(entry.secondary) ?? entry.secondary,
  accent: normaliseColour(entry.accent) ?? entry.accent,
  highlight:
    entry.highlight === undefined
      ? undefined
      : (normaliseColour(entry.highlight) ?? entry.highlight),
  background: entry.background === null ? null : normaliseColour(entry.background),
  tags: [...entry.tags],
}))

/** Every curated typeface. */
export const FONTS: readonly FontEntry[] = fontsData.fonts.map(entry => ({
  id: entry.id,
  family: entry.family,
  category: entry.category as FontCategory,
  weight: entry.weight,
  letterSpacing: entry.letterSpacing,
  glyphs: { ...entry.glyphs },
  metrics: {
    capHeight: entry.metrics.capHeight,
    xHeight: entry.metrics.xHeight,
    ascender: entry.metrics.ascender,
    descender: entry.metrics.descender,
    advance: { ...entry.metrics.advance },
  },
  tags: [...entry.tags],
}))

/** Every curated pictogram. */
export const ICONS: readonly IconEntry[] = iconsData.icons.map(entry => ({
  key: entry.key,
  path: entry.path,
  viewBox: entry.viewBox,
  category: entry.category,
  tags: [...entry.tags],
}))

/** Every curated mood rule. */
export const MOODS: readonly MoodRule[] = moodsData.moods.map(entry => ({
  id: entry.id,
  keywords: [...entry.keywords],
  paletteIds: [...entry.paletteIds],
  fontIds: [...entry.fontIds],
  iconKeys: [...entry.iconKeys],
  engineWeights: { ...entry.engineWeights },
}))

/** The assembled brain. */
export const BRAIN: Brain = {
  palettes: PALETTES as PaletteEntry[],
  fonts: FONTS as FontEntry[],
  icons: ICONS as IconEntry[],
  moods: MOODS as MoodRule[],
}

assertIntegrity(BRAIN)

/**
 * Returns the mood used when no keyword matches anything.
 *
 * @returns The `neutral` mood rule.
 * @throws {Error} When the brain has no `neutral` mood.
 */
export function fallbackMood(): MoodRule {
  const mood = MOODS.find(entry => entry.id === 'neutral')
  if (!mood) {
    throw new Error('brain is missing the required "neutral" mood rule')
  }
  return mood
}

/**
 * Looks up a palette by id.
 *
 * @param id - The palette id.
 * @returns The palette, or `undefined` when no palette matches.
 */
export function findPalette(id: string): PaletteEntry | undefined {
  return PALETTES.find(entry => entry.id === id)
}

/**
 * Looks up a font by id.
 *
 * @param id - The font id.
 * @returns The font, or `undefined` when no font matches.
 */
export function findFont(id: string): FontEntry | undefined {
  return FONTS.find(entry => entry.id === id)
}

/**
 * Looks up an icon by key.
 *
 * @param key - The icon key.
 * @returns The icon, or `undefined` when no icon matches.
 */
export function findIcon(key: string): IconEntry | undefined {
  return ICONS.find(entry => entry.key === key)
}

/**
 * Reports whether a string looks like a brain id or key.
 *
 * @param value - The string to test.
 * @returns `true` when the value is a valid lowercase kebab-case identifier.
 */
export function isIdLike(value: string): boolean {
  return ID_PATTERN.test(value)
}

export { normaliseColour }

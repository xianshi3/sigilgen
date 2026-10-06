import { FONTS, ICONS, PALETTES } from '@sigilgen/brain/index'
import { paletteFromColours } from '@sigilgen/resolvers/palette-resolver'
import type { FontCategory, FontEntry, IconEntry, PaletteEntry } from '@sigilgen/types'

/**
 * Read-only views over the brain, for the interface to offer as choices.
 *
 * Everything here comes straight from the curated JSON rather than a second copy, so a palette added
 * to the brain appears in the picker with no second edit and cannot drift out of step with the
 * resolver that will consume it.
 */

/** Every curated palette, in brain order. */
export const ALL_PALETTES: readonly PaletteEntry[] = PALETTES

/** Every curated typeface. */
export const ALL_FONTS = FONTS

/** Every curated pictogram. */
export const ALL_ICONS: readonly IconEntry[] = ICONS

/** Typeface tones, in the order a reader should meet them: plain first, then the display faces. */
const FONT_CATEGORIES: readonly FontCategory[] = [
  'geometric-sans',
  'humanist-sans',
  'serif',
  'display',
]

/**
 * The typefaces grouped by tone, ready to render as sections.
 *
 * Grouping happens once at module load rather than inside a render, because the group a font belongs
 * to never changes and filtering eighteen entries on every keystroke elsewhere in the panel is work
 * with no effect on the result. Tones with no typefaces are left out, so the brain can gain or lose a
 * whole tone without an empty heading appearing.
 */
export const FONT_GROUPS: readonly { category: FontCategory; fonts: readonly FontEntry[] }[] =
  FONT_CATEGORIES.map(category => ({
    category,
    fonts: ALL_FONTS.filter(font => font.category === category),
  })).filter(group => group.fonts.length > 0)

/** Looks up a typeface by id. */
export function findFontEntry(id: string): FontEntry | undefined {
  return ALL_FONTS.find(font => font.id === id)
}

/**
 * Finds pictograms whose key, category or tags match a query.
 *
 * The tags are the reason this is worth having: `pictogram` searching for "mountain" would otherwise
 * find nothing, because the keys are compound (`mountain-peak`) and the categories are coarse. A
 * reader searching for a subject should not have to know how the brain names it.
 *
 * @param query - What the reader typed. Empty returns everything.
 * @returns Matching pictograms in brain order, so the list never reshuffles as the query narrows.
 */
export function searchIcons(query: string): readonly IconEntry[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') {
    return ALL_ICONS
  }
  return ALL_ICONS.filter(icon =>
    [icon.key, icon.category, ...icon.tags].some(field => field.toLowerCase().includes(needle))
  )
}

/**
 * Interprets a colour list the way the generator will.
 *
 * The preview reuses the generator's own `paletteFromColours` rather than a second parser, so what
 * the reader sees is exactly what the mark will be painted with. A list of one colour is a legitimate
 * thing to type on the way to two, so it is reported as "not yet usable" rather than as an error.
 *
 * @param text - A comma or space separated colour list.
 * @returns The palette it produces, or `null` while fewer than two colours resolve.
 */
export function previewColours(text: string): PaletteEntry | null {
  const tokens = text
    .trim()
    .split(/[,\s]+/)
    .filter(token => token !== '')
  return paletteFromColours('preview', tokens)
}

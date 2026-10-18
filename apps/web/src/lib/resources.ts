import { FONTS, ICONS, PALETTES } from '@sigilgen/brain/index'
import { paletteFromColours } from '@sigilgen/resolvers/palette-resolver'
import type { FontCategory, FontEntry, IconEntry, PaletteEntry } from '@sigilgen/types'
import { contrastRatio } from './contrast'

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

/**
 * The curated palettes whose dominant ink reads best on a given surface, best first.
 *
 * This exists because a mark can be put somewhere it cannot be seen. The palettes are largely drawn for
 * a pale sheet — that is what a logo is usually printed on — so putting one of them on the dark sheet
 * leaves dark ink on a near-black ground, and the reader is looking at an empty square with no way back
 * except to guess which of thirty palettes would work.
 *
 * The ranking is by measured contrast between each palette's `primary` and the surface, not by a
 * hand-kept list of "dark palettes". `primary` is the ink an engine draws a mark with by default, so it
 * is the right proxy for what will be seen; the alternative, generating all thirty and measuring the
 * real output, would cost a generation per palette for the same answer.
 *
 * @param paper - The surface, as a colour the contrast module can read.
 * @returns The palettes that could be read there, most legible first; empty when the surface is unknown.
 */
export function palettesReadingOn(paper: string): readonly PaletteEntry[] {
  const scored: { palette: PaletteEntry; ratio: number }[] = []
  for (const palette of PALETTES) {
    const ratio = contrastRatio(palette.primary, paper)
    if (ratio !== null) {
      scored.push({ palette, ratio })
    }
  }
  // Ties break on the id compared by code unit rather than `localeCompare`: this picks the palette a
  // reader is offered, so it has to be the same palette in every locale and on every machine.
  scored.sort((a, b) => b.ratio - a.ratio || (a.palette.id < b.palette.id ? -1 : 1))
  return scored.map(entry => entry.palette)
}

/**
 * The palette to offer when the current one cannot be read on a surface.
 *
 * @param paper - The surface, as a colour the contrast module can read.
 * @returns The most legible palette there, or `null` when the surface is unknown.
 */
export function bestPaletteFor(paper: string): PaletteEntry | null {
  return palettesReadingOn(paper)[0] ?? null
}

# The curated JSON brain

- **Status:** implemented
- **Date:** 2026-10-04

## Why the brain exists

Generating a logo is not hard. Generating one that can be _explained_ is. Anyone can write code that
picks colours at random; the question a designer asks next is "why that blue, and why that typeface?"

Sigilgen answers that by moving the decisions into data. A mood rule is a small, human-authored
statement about a design language: which keywords suggest it, which palettes belong to it, which
typefaces suit it, which pictograms fit, and how much each engine should be preferred. Everything the
generator draws follows from those statements, and the concept notes quote them back.

## Files

| File            | Contents                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| `palettes.json` | 33 colour schemes with primary, secondary, accent, optional highlight, optional background, and matching tags |
| `fonts.json`    | **Generated.** 18 families × 26 glyph outlines plus vertical metrics, advance widths and a word space         |
| `icons.json`    | 70 pictograms on a `0 0 24 24` grid                                                                           |
| `moods.json`    | 34 mood rules binding keywords to resources and engine weights                                                |
| `colors.json`   | Colour names for `--palette "cream,rust"`, plus `none` and `transparent`                                      |

## Schemas

### Palette

```ts
interface PaletteEntry {
  id: string // kebab-case, stable, referenced by moods
  primary: string // #rrggbb
  secondary: string // #rrggbb
  accent: string // #rrggbb
  highlight?: string // #rrggbb
  background: string | null // null means "transparent unless asked"
  tags: string[]
}
```

Palettes lead with `primary`, because the primary is the brand colour a brief would name first.
`accent` is chosen to be usable as a small area against `primary`, and should clear a contrast ratio of
3:1 against it so it works as an icon colour on a primary ground.

### Font

```ts
interface FontEntry {
  id: string
  family: string
  category: 'geometric-sans' | 'humanist-sans' | 'serif' | 'display'
  weight: number // 100–900
  letterSpacing: number // authoring provenance; already baked into each advance
  glyphs: Record<string, string> // 'A'–'Z' → absolute SVG path data
  metrics: {
    capHeight: number
    xHeight: number
    ascender: number
    descender: number
    advance: Record<string, number> // 'A'–'Z' plus a space
  }
  tags: string[]
}
```

Each `advance` is the glyph's **measured** ink width plus equal side bearings, and the glyph path is
shifted so those bearings really are equal on both sides. Three invariants hold for every glyph, and the
compiler fails the build if any breaks, because all are invisible in a path dump and obvious in a
rendered word:

- The ink lies inside the advance box. Deriving the advance from a skeleton's nominal width instead lets
  a round letter overhang its box, and lets `J` collide with the letter before it.
- The left and right bearings are equal. All the spacing sitting on one side makes a centred single
  letter look off centre, because a run is centred on its advance box while its ink is not.
- The bearings are proportional to the stroke. Authoring them as an absolute number of font units is
  the mistake this replaced: a 66-unit gap is wide air on a 46-unit stem and near-contact on a
  241-unit slab, so the light geometric faces came apart into visibly separate letters while the heavy
  ones ran together. The gap across the library ranged from 34 to 345 thousandths of cap height; it is
  now 68 to 117.

#### Spacing, and why the space has an advance

`leading = stroke^0.72 × (1.15 + sideBearing/1000 + tracking/2000)`

The exponent is below one so a heavier stem gets proportionally _less_ air — a slab's stems already
fill their counters, and giving it the same stroke multiple of gap as a hairline geometric would open
the words up. The two authored terms are divided by 1000 so they enter as fractions, which keeps each
family's character: a face designed open stays looser than one designed closed, without the absolute
number deciding how loose.

`advance[' ']` carries a word space with no outline behind it. It exists because a wordmark for a
two-word name has to open a gap, and it is sized against the family's own letter gap rather than being
a constant — sized at 3.2× the gap on the _advance_, which is 2.2× on the clear space a reader sees,
since the space stands in for two bearings before it opens anything. A single hard-coded number came out
narrower than the gap between letters in the loosest family, so `Northwind Coffee` read as one word in
some faces and two in others.

Engines add their own optical tracking on top, expressed through `opticalTracking(font, fraction)` as a
fraction of cap height rather than as a multiple of `letterSpacing`. `letterSpacing` is retained as
provenance for the compiler's own derivation, but depending on it from an engine is the trap this
paragraph exists to close: it is an authoring constant with no relationship to the spacing the bearings
produce, so multiplying it put a wordmark's gap at 309 thousandths of cap height in one family and made
a lettermark's letters overlap in another.

**Do not hand-edit `fonts.json`.** Run `pnpm run build:brain`. CI verifies the committed file matches
what `scripts/build-brain.mjs` produces.

Glyph outlines are authored with the cap top at `y = 0` and the baseline at `y = capHeight`, y growing
downwards to match SVG. There are no `A` commands — see [ADR-002](../architecture/decisions/ADR-002-no-elliptical-arcs.md).

### Icon

```ts
interface IconEntry {
  key: string
  path: string // absolute commands on the viewBox grid
  viewBox: string // always "0 0 24 24"
  category: string
  tags: string[]
}
```

Icons are scaled to fill their own bounding box when placed, so an icon that uses less of the grid
still reads at the same optical size as one that uses all of it.

### Mood

```ts
interface MoodRule {
  id: string
  keywords: string[]
  paletteIds: string[]
  fontIds: string[]
  iconKeys: string[]
  engineWeights: Record<EngineName, number>
}
```

Exactly one rule must be `neutral`, with an empty `keywords` array. It is the fallback whenever nothing
matches, so it needs to work for any brand.

## How a brief becomes a logo

1. **Extract words.** Brand name, keywords and brief are split into lowercase words, de-duplicated,
   and bounded.
2. **Score every mood.** Each word is matched against each rule's keywords. Matching is _prefix_ based
   rather than substring based, because plain containment is far too eager at this scale: `sustainable`
   contains `ai` and `batch` contains `bar`, and a broad substring rule matches almost everything.
   An exact match scores `1`; a prefix match scores `0.6`.
3. **Normalise and rank.** Scores are divided by the square root of how many keywords a rule declares,
   so a rule does not win merely for listing more synonyms. Ties break on rule id, which keeps the
   outcome stable.
4. **Route.** Engine weights come from the winning rule, adjusted for the shape of the name: a name of
   three letters or fewer strongly favours a monogram, more than twelve favours a lettermark, and a
   multi-word name gains a little monogram and emblem weight.
5. **Resolve.** Palettes, typefaces and pictograms are drawn from the mood's pools, with engines
   applying further rules — letter marks drop serif and display faces, because a slab serif has no
   personality at 24px.
6. **Draw and explain.** Each stage appends a line to `conceptNotes`.

## Authoring rules

- **Ids are kebab-case and stable.** Renaming an id is a breaking change to every mood that references it.
- **Every reference must resolve.** `src/brain/index.ts` validates this at load time and throws with the
  offending `mood → id` pair. A test asserts every palette and font is reachable from at least one mood,
  so unused entries get noticed.
- **Colours are lowercase `#rrggbb`.** They are normalised at load, but authoring them normalised avoids
  surprise.
- **Tags are lowercase, single words.** They exist so a human can search the library.
- **Icons must survive 16px.** Minimum feature thickness is 1.8 grid units. Anything thinner disappears
  at logo size, which is the most common way an icon library quietly becomes useless.
- **New moods need new colours to express.** If a mood cannot be distinguished from an existing one by its
  resources, it will not be distinguishable in the output either.

## Extending it

To add a palette, append to `palettes.json` and reference it from at least one mood.

To add a typeface, add a style definition to `scripts/build-brain.mjs` and run `pnpm run build:brain`.
Review the rendered specimen before committing: a family that is too heavy collapses its counters, and a
serif whose slabs overflow the ink box produces letters that collide with their neighbours.

To add an icon, append to `icons.json` and reference it from a mood.

To add a mood, append to `moods.json`. Pick keywords that are _specific_. `coffee` is useful; `design`
is not, because it is already claimed and would make every studio brief resolve to the same direction.

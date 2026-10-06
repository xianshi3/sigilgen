# 001 — Logo engine architecture

- **Status:** implemented
- **Date:** 2026-10-04
- **Supersedes:** nothing. This is the original design, updated to match what shipped.

## 1. Overview

### 1.1 Problem

Existing open-source logo generators — Logoly, Hexalith — solve "get something that looks like a logo
out quickly". They do not make decisions that can be justified. For an open-source project, a
microservice or a small product, what a developer wants is a deterministic, reproducible generator
with no AI dependency: give it a brand name and a few keywords, get back a set of flat geometric SVG
concepts, and be able to say _why_ it chose that palette, that typeface and that shape.

### 1.2 Goals

- **G1** — Input `{ name, keywords }` produces 1–6 flat geometric SVG concepts, deterministically.
  Identical input always yields byte-identical output.
- **G2** — Every design decision comes from a curated JSON knowledge base. No model calls, no network.
- **G3** — Type is a structural part of the logo — monogram, lettermark, wordmark — not text dropped on
  top of a shape.
- **G4** — Output is a plain SVG string with zero runtime dependencies. Rasterising to PNG is optional.
- **G5** — The repository carries the full set of open-source community health files.

### 1.3 Non-goals

| ID  | Not doing                            | Why                                                                                                      |
| --- | ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| NG1 | Image generation or diffusion models | This is an algorithm, and determinism is the product                                                     |
| NG2 | A general vector editor              | Generation only: no dragging, no layer management                                                        |
| NG3 | A design teaching tool               | No design theory; just output and a short rationale                                                      |
| NG4 | CJK glyph outline conversion in v1   | Outlines for a full CJK set are impractical; a name with no A–Z letters is rejected with a clear message |
| NG5 | A hosted service or public API       | Local library and CLI only                                                                               |

### 1.4 Alternatives considered

| Option                              | Pros                                                     | Cons                                                  | Verdict                          |
| ----------------------------------- | -------------------------------------------------------- | ----------------------------------------------------- | -------------------------------- |
| A. Pure random geometry             | Simple, high variety                                     | Unrelated to the brand, unexplainable                 | Rejected                         |
| B. Templates with parameters        | Controllable, consistent                                 | Reads as templates                                    | Rejected as the primary approach |
| C. Curated JSON brain               | Deterministic, explainable, brand-relevant, clean output | Up-front curation effort                              | **Adopted**                      |
| D. AI generation plus vectorisation | High creative ceiling                                    | Not reproducible, needs an API, output needs cleaning | Rejected; violates G2            |

C was adopted because the hard part of logo generation is not drawing geometry, it is making
defensible decisions. The brain encodes a designer's reasoning as structured data, which is what lets
the generator produce the same reasoning on demand.

## 2. Technology

| Layer           | Choice                        | Rationale                                                         |
| --------------- | ----------------------------- | ----------------------------------------------------------------- |
| Language        | TypeScript, `strict`          | Type safety across a pipeline where every stage shares interfaces |
| Runtime         | Node.js 22.12+ (CI on 24 LTS) | Current LTS                                                       |
| Package manager | pnpm 9+                       | Disk-efficient, monorepo-friendly                                 |
| Tests           | Vitest 3                      | Shares Vite's transform pipeline with the build                   |
| Lint/format     | oxc-standard                  | Rust implementation, one dependency instead of two                |
| Output          | SVG 1.1 strings               | Pure string assembly, zero dependencies                           |
| Rasterisation   | `sharp`, optional             | Imported dynamically; absence never affects SVG output            |
| Build           | tsup                          | Zero-config ESM + CJS + declarations                              |

See [ADR-001](../architecture/decisions/ADR-001-typescript-baseline.md).

## 3. Core data structures

```ts
interface Brain {
  palettes: PaletteEntry[]
  fonts: FontEntry[]
  icons: IconEntry[]
  moods: MoodRule[]
}
```

`PaletteEntry`, `FontEntry`, `IconEntry` and `MoodRule` are specified in
[002 — brain schema](002-brain-schema.md). `FontEntry` carries a `metrics` block alongside `glyphs`;
the original design omitted it, but without per-glyph advance widths the wordmark engine cannot lay out
a name without measuring text, which would mean a canvas or a font parser.

### Input and output

```ts
interface LogoConfig {
  name: string // required
  keywords?: string
  brief?: string
  engine?: 'monogram' | 'wordmark' | 'abstract' | 'emblem' | 'lettermark'
  palette?: string // palette id, or a colour list
  font?: string
  icon?: string
  seed?: number
  size?: number // 16–4096, default 512
  variations?: number // 1–6, default 3
  background?: boolean
  preferences?: DesignPreferences // per-dimension pins; see 4.6
}

interface LogoResult {
  svg: string
  palette: PaletteEntry
  font: FontEntry
  icon: IconEntry | null
  engine: EngineName
  conceptNotes: string[]
  seed: string // fingerprint of this concept's stream
}
```

`LogoResult.seed` is a string rather than the numeric seed: it identifies one concept inside a
multi-concept run, which is what you need in order to reproduce exactly that one.

## 4. Pipeline

```text
LogoConfig
  → normaliseConfig     validate, clamp, derive letters and words
  → MoodResolver        keywords + brief → MoodMatch
  → EngineRouter        mood weights + name structure → engine
  → Resolvers           FontResolver / PaletteResolver / IconResolver
  → Engine              SVGElement[]
  → serialiseDocument   SVGElement[] → SVG string
  → LogoResult
```

### 4.1 SeedResolver

Hashes `name`, `keywords`, `brief`, `seed`, engine preference and concept index with SHA-256, then
hands out values read from the digest four bytes at a time. Each pipeline stage calls `derive(label)`
to get an independent child stream, so concept 2 never depends on how many values concept 1 consumed.
That is what makes `variations: 3` return the same three concepts whether you asked for three or for six.

The original design used `node:crypto`. That would have tied the library to Node and made "identical
output everywhere" untrue, so SHA-256 is implemented in `src/sha256.ts` and verified against the
published FIPS 180-4 vectors.

### 4.2 MoodResolver

Scores every mood rule against the words found in the name, keywords and brief. Matching is prefix
based rather than substring based — see [002 — brain schema](002-brain-schema.md) for why — and scores
are normalised by rule size so a rule cannot win by listing more synonyms.

### 4.3 EngineRouter

| Engine       | Selected when                                        | Output                                           |
| ------------ | ---------------------------------------------------- | ------------------------------------------------ |
| `monogram`   | Name has ≤ 3 letters, or the mood weights it heavily | Initials inside a geometric container            |
| `wordmark`   | Name has 4–12 letters                                | Pictogram plus brand name, horizontal or stacked |
| `lettermark` | Minimal or abbreviation brands                       | Letters only, no pictogram                       |
| `abstract`   | Abstract or generative concepts                      | Seed-driven pure geometry                        |
| `emblem`     | Badge, manufacturing or hospitality concepts         | Pictogram and name inside one frame              |

### 4.4 Resolvers

- **Palette** — a palette id, or a colour list such as `"#2B1B12,cream,rust"` where names come from
  `src/brain/colors.json`. An unrecognised value falls back to the mood pool rather than failing the run.
- **Font** — letter marks drop serif and display faces. A slab serif has no personality at 24px, which is
  exactly where a letter mark has to work.
- **Icon** — a pictogram from the mood pool, or `null` for the engines that draw none.

### 4.5 serialiseDocument

The trust boundary. See [section 6](#6-flatness-and-safety).

### 4.6 Design preferences

Every engine draws its container, layout, accent or frame from the seed stream, which is what makes a
reroll produce genuinely different compositions rather than the same mark in new colours. It also means
a reader who liked the hexagon in concept two has no way to ask for the hexagon again.

`LogoConfig.preferences` is the escape hatch. Each dimension is optional, and an engine reads only the
ones it has candidates for:

| Dimension   | Read by    | Candidates                                        |
| ----------- | ---------- | ------------------------------------------------- |
| `container` | monogram   | `circle`, `squircle`, `hexagon`, `shield`, `seal` |
| `layout`    | monogram   | `side-by-side`, `stacked`, `overlap`              |
| `layout`    | wordmark   | `horizontal`, `vertical`                          |
| `treatment` | wordmark   | `plain`, `badge`, `rule`                          |
| `accent`    | lettermark | `none`, `rule`, `dot`, `corner-frame`             |
| `frame`     | emblem     | `shield`, `hexagon`, `circle`, `banner`           |
| `mode`      | abstract   | `orbit`, `venn`, `arcs`, `burst`, `waves`         |

Three rules keep it safe, and all three are enforced by tests:

1. **An absent dimension behaves exactly as it did before the field existed.** The determinism manifest
   is the proof: it is a recorded hash of real output, so if adding the field had shifted a single byte
   it would have failed the build rather than passing quietly.
2. **An unrecognised value is ignored, not rejected.** `pick()` checks membership in the candidate list
   and falls through to the seeded choice. A preference is a hint about taste; an interface that offers
   "hexagon" and then throws when the engine draws no container is worse than one that quietly keeps
   the seeded answer.
3. **Unknown dimensions are dropped before an engine sees them.** `normaliseConfig` copies only the six
   recognised keys out of whatever object it was handed, so a stale saved document or a hand-edited
   local storage entry cannot smuggle a key into the engines.

The candidate lists themselves stay private to each engine. They are exported for the studio's option
panel to import rather than copied into it, because a second copy would be free to drift and would
eventually offer a choice that silently does nothing.

## 5. Engine specification

Each engine is a pure function from `EngineInput` to `SVGElement[]`: no I/O, no randomness beyond the
supplied stream, no dependency on the router or the resolvers.

### Centring is measured, not eyeballed

A mark is aligned when its **ink** is centred, not when the box the engine laid out in is centred, and
the two are not the same thing. Three rules follow, and each exists because ignoring it produced a
visible defect:

1. **Advance and ink are different widths.** `measureText` returns the advance box; `textPath` draws
   ink. The compiler gives every glyph equal side bearings so the outer bearings cancel, but the last
   letter's advance is counted while its glyph stops at the bearing. `fitText` therefore shifts the run
   by half a tracking unit, and the ink lands where it was asked to land.
2. **Measuring and drawing must resolve an advance the same way.** Both go through `letterAdvance`.
   When they disagreed — measurement counting a character the drawer skipped — the run was laid out
   wider than it was drawn, which put the ink off centre _and_ removed the gap. An undrawable
   character therefore still advances the cursor, which is the only reason a word space exists at all:
   the brain carries no space glyph.
3. **A composed lockup is centred as a whole, after it is measured.** The horizontal wordmark cannot
   know its left edge until the name has been fitted, because the name's width is what the lockup's
   width is. Anything that pins one element to the margin and centres the rest in the leftover space
   collects all its slack on one side.

`tests/text.test.ts` asserts the first two directly against all 18 typefaces: it measures the ink of a
fitted run and requires it to sit within 0.25% of the canvas of where `fitText` was told to centre it.
That guard is worth more than the fixes that prompted it — it fails at 2.6% against the previous code.

The abstract engine is the deliberate exception. Its marks are built from arcs, orbits and lobes
placed by angle, so their ink bounding box is not symmetric by construction. Forcing it square would
mean not orbiting; the composition is centred on a circle, and the drawing is judged against that.

### Monogram

Containers: `circle`, `squircle`, `hexagon`, `shield`, `seal`. Letter layouts: side by side, stacked,
overlapping. Two rules are enforced rather than left to taste — never mix typefaces inside one mark,
and keep the container to at most 84% of the canvas so it cannot overpower the letters. The letter
colour is chosen by WCAG contrast ratio against the container, with a neutral fallback, because a
palette accent is often the one colour that would vanish.

### Wordmark

Horizontal (pictogram left, name right) or vertical (pictogram above, name below). The name gets the
larger share; the icon is sized to sit beside it rather than compete with it. Type is fitted to the
space the icon leaves, and the two colours are drawn from one palette so the lockup reads as one object.

### Lettermark

One or two letters with tightened tracking so the pair reads as one glyph, plus at most one accent:
a rule, a dot, or a corner frame. Used for abbreviation brands and restrained briefs, where an icon
would be one decision too many.

The corner frame is four brackets, each the last `arm` of one edge of a padded square, so two are
horizontal and two are vertical. It is drawn with `segmentPath`, which takes its direction from the two
endpoints: a horizontal-only capsule helper silently draws the vertical brackets as horizontal bars,
which puts two of the four outside the square.

### Abstract

Five seed-driven modes with no type at all: `orbit`, `venn`, `arcs`, `burst`, `waves`.

### Emblem

Frames: `shield`, `hexagon`, `circle`, `banner`. Every frame's icon and name live inside one
silhouette, so the interior is budgeted rather than positioned by eye.

Two rules make that budget hold:

- **One source of geometry.** `frameBox` measures each frame, and both the frame's path and its
  interior layout read it. Deriving the layout from the same numbers that draw the outline is what
  stops the composition from being positioned against a rectangle the frame does not occupy.
- **Measured, not assumed, width.** Three of the four frames are narrower at some rows than at their
  widest point — the shield tapers to a point, the hexagon has shoulders, the banner has notched
  corners. `frameHalfWidth` reports a frame's width at any row, and the name is fitted to the
  _narrowest_ row of the band it occupies. Budgeting it against the frame's maximum width instead is
  how names end up hanging outside their own badge.

## 6. Flatness and safety

### Flatness

Emitted SVG contains no `<linearGradient>`, `<radialGradient>`, `<filter>`, `<mask>`, `<clipPath>`,
`<pattern>`, `<image>`, `<foreignObject>`, `<script>` or `<use>`, and no `on*` attributes. Only `fill`,
`stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `opacity`, `fill-rule`, geometry
attributes and `viewBox` are emitted. A `viewBox` is always used so the output scales.

### Escaping contract

A brand name, keyword or brief is attacker-controlled input. The serializer therefore:

1. Allow-lists elements. Anything outside the list throws.
2. Allow-lists attributes. `on*`, `href`, `xlink:href` and `style` throw explicitly by name.
3. Validates every attribute value against a conservative pattern. A value containing a quote, `<` or
   `>` is rejected outright rather than escaped and passed through.
4. Escapes `&`, `<` and `>` in the values that survive.
5. Uses a `viewBox` and fixed `width`/`height`, never user text.

The CLI resolves and creates its output directory before writing anything, and slugifies file stems, so
a brand name like `../../etc/passwd` cannot escape the output directory.

## 7. CLI

```bash
# basic
sigilgen --name "Acme" --keywords "tech, minimal"

# four concepts to files
sigilgen --name "Ledgerly" --keywords "fintech" -N 4 --output ./out/

# custom colours
sigilgen --name "Ember" --keywords "coffee" --palette "#2B1B12,cream,rust"

# machine-readable summary
sigilgen --name "Relay" --keywords "mesh networking" --json

# PNG, needs sharp
sigilgen --name "Acme" --keywords "owl" --png --png-size 1024
```

## 8. Development conventions

### Commits

`<type>(<scope>): <summary>`, with `feat` → minor, `fix` and `perf` → patch, and everything else none.
Breaking changes use `!` after the type or a `BREAKING CHANGE:` footer.

### Testing

Required coverage, all of it present in `tests/`:

| Kind             | Assertion                                                                            |
| ---------------- | ------------------------------------------------------------------------------------ |
| Determinism      | Identical input produces byte-identical SVG, over repeated runs and interleaved runs |
| Seed stream      | Identical input produces identical float sequences; output is uniformly distributed  |
| Routing          | Short names favour monogram and lettermark                                           |
| SVG validity     | Output parses; tags balance; attributes are quoted                                   |
| Flatness         | No gradient, filter, mask, script or handler in output                               |
| Escaping         | Quotes, `<`, `&` and `url()` cannot escape an attribute                              |
| Glyph data       | Every family defines all 26 glyphs with valid path data and plausible metrics        |
| Brain integrity  | Every mood reference resolves; every palette and font is reachable                   |
| Input validation | Out-of-range values clamp; unusable values reject with a useful message              |

## 9. Milestones

| Milestone | Contents                                       | Status |
| --------- | ---------------------------------------------- | ------ |
| M0        | Community health files, CI, AI tool symlinks   | Done   |
| M1        | SeedResolver, brain types, serializer skeleton | Done   |
| M2        | MoodResolver, EngineRouter, resolvers          | Done   |
| M3        | Monogram with typeface integration             | Done   |
| M4        | Lettermark and wordmark                        | Done   |
| M5        | Abstract and emblem                            | Done   |
| M6        | CLI, multi-concept output, JSON summary        | Done   |
| M7        | Optional PNG, test coverage, 1.0.0             | Done   |

## 10. Known limitations

- **CJK names are rejected.** v1 does not convert CJK characters to outlines. A name with no A–Z
  letters produces a clear error rather than a blank canvas.
- **The icon library is uneven.** Some pictograms are stronger than others. Icons are scaled to fill
  their own bounding box when placed, which keeps them optically consistent, but individual glyphs are
  worth reviewing before they appear in a real identity.
- **Layered marks are not supported.** Marks are one flat colour per shape with no strokes, so an
  emblem is built from filled geometry rather than outlines.
- **No lowercase.** The brain defines uppercase outlines only, so names are drawn in caps. This is a
  deliberate flat-design choice rather than an oversight, but it does limit typographic range.

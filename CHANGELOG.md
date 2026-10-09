# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`LogoConfig.preferences`.** Holds a design decision still across every concept while the rest keep
  varying: `container`, `layout`, `treatment`, `accent`, `frame`, `mode`. Every dimension is optional,
  an absent one behaves exactly as before, and a value the engine does not offer is ignored rather
  than rejected — a preference is a hint about taste, and a hint must not be able to fail a render.
- **Exported engine candidate lists.** `FRAMES`, `MODES`, `ACCENTS`, `LAYOUTS` and `TREATMENTS` join
  `CONTAINERS` and `LETTER_LAYOUTS` as module exports, so a consumer can offer the same choices the
  engines accept instead of keeping a second copy that will drift.

### Fixed

Three more centring defects, found the same way as the four below: by generating across a wide input
space and measuring the ink bounding box of every result against the canvas. All three share one cause
— a layout was centred on the **room reserved** for its contents rather than on the **ink those
contents actually draw**.

- **The emblem banner sat a twentieth of the canvas high.** `frameBox` gave the banner a box from
  `-0.72r` to `+0.56r`, whose centre is `-0.08r`, while the shield, hexagon and circle are all exactly
  `-r..+r`. Combined with the interior fault below, a banner emblem's ink was **6.88% of the canvas
  off centre** — the worst misalignment in the library, on every single emblem.
- **A badge's contents were centred on their slots, not their ink.** The name is fitted into a band
  reserved for it, but a long name in a narrow frame comes out far shorter than that band, and the
  interior was then centred on the band. Icon and name together sat high by about a fifth of the way
  out of the block's centre, while each individual slot was placed exactly where the table said. Both
  are now placed on the ink, with the clear gap the table asked for hung off the pictogram's ink.
- **A vertical wordmark was placed against a block its own contents did not fill.** Two independent
  reasons: a long name is bound by width and comes out shorter than the band reserved for it, and
  `placeIcon` scales by the _larger_ of a pictogram's two extents, so a pictogram narrower than it is
  tall is letterboxed and its ink is shorter than the box too. `Northwind Coffee` in a vertical lockup
  came out **5.79% of the canvas low**.

The underlying gap was that no engine could ask how big a thing's ink is. `measureText` answers a
different question — how wide the advance boxes are — and the two differ by the outer side bearings
and, in height, by however far the letters fall short of the cap line. New `textInk` measures the
answer, and `iconInkSize` exposes the same for a pictogram from the same computation `placeIcon` uses,
so the two cannot disagree. `fitText` now centres both axes on the measured ink, which also retired its
half-tracking-unit fudge factor. Measured worst case across the monogram, wordmark and emblem engines,
over 1650 input cases and 3434 generated marks: **under 0.25% of the canvas**, where it was 6.88%.

#### Capitals did not reach the cap line or the baseline

Found while measuring, in the same pass. Fixed here.

Letters that do not share a baseline do not read as set at all, and the error scales with the mark — it
was worst at exactly the sizes a logo is used at. Measured in `orbit-grotesk` (cap 700) against the
rules at 0 and 700: `L` stopped 55 units below the cap line, `S` 63 above the baseline, `I` floated 55
clear at each end, and every letter of `slab-serif` sat between 62 and 72% of cap height. `SALVO` in one
family spanned 39 points of cap height from its shortest letter to its tallest.

`stroke` returns a butt-ended quad, so it reaches exactly as far as its centreline and no further.
`buildGlyphs` therefore insets every endpoint by half a stroke and closes the gap with a terminal disc.
Five things had to be true for that to work, and each was wrong:

- **`capRound` returned an empty string for any family with `round: false`** — and `round` was read
  nowhere else, so the flag was not choosing a terminal style, it was choosing whether a terminal
  existed. Ten of the eighteen families were drawn with their terminals missing. The disc is now
  unconditional and the flag is gone: a geometric sans with softly rounded terminals is idiomatic, and
  it is the only arrangement whose geometry is expressible. Running a butt end to the edge instead would
  need a different inset on the vertical axis than the side bearing uses, plus an audit of every
  diagonal, since a butt end on a diagonal does not reach the same row a disc does.
- **The disc wound the other way from the stroke.** It is centred on an endpoint, so half of it lies
  inside the stroke's own rectangle, and the non-zero fill rule only keeps that overlap filled if the two
  sub-paths wind alike. Wound the other way, every terminal in the library punched a white notch through
  its own stem. A bounding-box test cannot see this and neither can the existing counter-sampling, because
  a terminal is neither out of bounds nor a counter. A new guard asserts that filling a glyph as one path
  agrees with filling each sub-path and taking the union; the two differ exactly where opposite windings
  overlap. Verified to fail against the pre-fix build.
- **A junction is not a terminal.** `U`'s stems end inside the bowl, and a disc there overlaps a band
  wound the other way. `stem` takes a `freeTo` flag for that.
- **The slab sat centred on the stem's endpoint** rather than against the cap line or the baseline, which
  is why the four serif families came out lowest of all.
- **`inset` was doing double duty** as both the side bearing and the terminal inset, so a serif overhang
  — which should only widen a letter — was also lowering its cap line. The vertical half is now `vInset`.

Two arc-built letters needed geometry of their own. `U`'s bowl stopped a half stroke above the baseline,
because `arcBand` measures its thickness inward, so the outer edge is at `ry`. And `S`'s lower bowl swept
130 degrees from 40 to -90, the short way round, which never passes the bottom of its own ellipse — so
`S`'s lowest point was its lower-right terminal. It sweeps 230 now.

All eighteen families now measure exactly 100% of cap height on all twenty-five cap-only letters, so the
spread inside a word is zero points of cap height. `Q` is excluded: its tail is a descender and is meant
to pass the baseline, as a round letter is meant to overshoot the cap line.

#### Previously

Four alignment defects, all found by measuring the ink bounding box of real output against the canvas
rather than by eye. The worst case was 18.5% of the canvas off centre.

- **A wordmark's two words were set as one.** `measureText` counted a space at the missing-glyph
  fallback advance while `textPath` skipped it entirely, so `Northwind Coffee` was measured with a gap
  and drawn without one: `NORTHWINDCOFFEE`. Measurement and drawing now resolve every advance through
  one function, and an undrawable character leaves the gap it was measured as. A word space is 0.26 em
  rather than the full capital it fell back to.

- **The horizontal wordmark lockup was flush left.** The pictogram was pinned to the canvas margin and
  the name centred in whatever was left over, so all the slack collected on the right and the mark
  drifted up to 11% of the canvas off centre. The lockup is now centred as a whole, which means fitting
  the name before placing anything — its width is what the left edge depends on.
- **Centring an advance box does not centre the run.** The compiler gives every glyph equal side
  bearings, so the bearings cancel, but the last letter's advance is counted while its glyph stops at
  the bearing. The ink therefore sat half a tracking unit left of where the run was asked to be
  centred — up to 4.1% of the canvas on a tight-tracked lettermark. `fitText` now shifts by that half
  unit. Measured worst-case drift across all 18 typefaces is now under 0.25% of the canvas.
- **Arc bands all left from the same part of the ring.** Starting angles were staggered by 18–42°
  instead of around the circle, so three or four concentric arcs overlapped into one lopsided fan and
  left up to 18.5% of the canvas empty on one side. They now start a third of a circle apart, which is
  what they were meant to read as. The orbit mode's satellite count also starts at three: two dots on
  opposite sides of a centred ring is the same shape as one dot and its shadow.
- **Letters came apart, and words ran together.** Two separate causes, both spacing metrics that were
  absolute numbers where they needed to be proportional.
  - Side bearings were authored per family in font units, so a 66-unit gap meant wide air on a
    46-unit stem and near-contact on a 241-unit slab. Measured across the library the gap between
    letters ranged from 34 to 345 thousandths of cap height, and the light geometric faces read as
    `N O R T H W I N D` rather than as a word. The compiler now derives the bearing from the stroke,
    sub-linearly so a heavy face gets proportionally less air, and keeps each family's authored
    `sideBearing` and `tracking` as fractions so no face loses its character. The range is now 68–117.
  - The word space was a fixed 0.26 em, which is narrower than the gap between letters in the loosest
    family — so `Northwind Coffee` came out as one word in some faces and two in others, and
    `stipple-display` measured a word gap of 0.06× its letter gap. The space is now compiled into each
    family's `advance` table, sized against that family's own letter gap, and every family measures
    2.2×.
- **Engines derived tracking from an authoring constant.** `wordmark`, `lettermark`, `monogram` and
  `emblem` all scaled `font.letterSpacing`, which is the number the compiler happened to use when
  deriving bearings and has no relationship to the spacing they produce. Since tracking is added to
  every advance, one unit widens the gap by exactly one unit, so the same multiplier put a wordmark's
  gap at 309 thousandths of cap height in one family and made a lettermark's letters overlap in
  another. All four now express optical tracking through `opticalTracking(font, fraction)` as a
  fraction of cap height, which is the unit letterspacing is actually specified in.
- **Half the library was set at hairline weight.** Nine of the eighteen families were authored between
  6.6% and 9.1% of cap height, which is hairline territory — a Regular sans is 12 to 14%. A text face
  can get away with that; a logo cannot. At the size a wordmark fits an eighteen-character name into, a
  7% stroke is barely two pixels, and it is gone by favicon size, which is the size a mark has to
  survive. The library now spans 12.5% to 22% — Regular to heavy — with the nominal weights kept so the
  intended light-to-heavy ordering survives. `tests/brain.test.ts` already sampled the winding number
  inside the counters of seven letters across all eighteen families, so raising the weight could not
  quietly close a bowl in `B`, `R`, `P` or `A`; it did not.

## [1.0.0] — 2026-10-04

First stable release.

### Added

- **Deterministic generation pipeline.** `generateLogo` and `generateLogos` turn a brand name plus
  keywords into one to six flat geometric SVG concepts. Identical input always produces
  byte-identical output.
- **Five rendering engines.** `monogram`, `wordmark`, `lettermark`, `abstract` and `emblem`, each
  producing a different structural interpretation of the same input.
- **Curated JSON brain.** 33 palettes, 18 typeface families with 468 pre-generated glyph outlines,
  70 pictograms, and 34 mood rules that map keywords to a coherent set of resources. The data ships
  inside the bundle, so loading it costs nothing at runtime.
- **Key-driven deterministic randomness.** A dependency-free SHA-256 implementation feeds a
  reproducible numeric stream, so every "random" choice is reproducible across platforms and Node
  versions without importing `node:crypto`.
- **`sigilgen` CLI.** Deterministic SVG on stdout, `--output` for files, `--json` for a
  machine-readable summary, and optional `--png` rasterisation via `sharp`.
- **Optional PNG rasterisation.** `rasterise()` and `--png`, loaded dynamically so `sharp` is only
  needed by callers who actually want a bitmap.
- **A serializer that is the trust boundary.** Allow-listed elements and attributes, quoted values,
  and rejection of anything that could inject markup. Untrusted input — brand names, keywords,
  briefs, colour lists — is never emitted verbatim.
- **Parametric letterform compiler.** `scripts/build-brain.mjs` compiles outlines from geometric
  skeletons into cubic Béziers, so type is generated rather than licensed.
- **Community health files.** MIT `LICENSE`, `README`, `CONTRIBUTING`, `CODE_OF_CONDUCT` (link-only),
  `SECURITY`, this changelog, issue templates, a PR template, and CI.
- **396 tests** covering determinism, flatness, escaping, brain integrity, routing, glyph data,
  engine output and the CLI.

### Fixed

- **Overlapping monograms were drawn off centre and could leave the canvas.** The overlap layout
  measured a narrowed box but drew the full-width run, so the letters were shifted right by a third of
  the difference and a wide pair could reach past the canvas edge. Overlap now comes from the tracking,
  and the run is additionally scaled to the width its container actually offers — a hexagon's flanks
  stand at `0.866 ×` its radius, so measuring against its bounding box let letters poke through.
- **`pathBounds` measured every curve wrongly.** `parsePath` stores a cubic as two control points and
  an end point, with the start point implied by the current position, but the measuring code read those
  six values as though the start were included. Every curve was therefore measured shifted by one
  control point, so bounding boxes were too large — most visibly in icon placement, where each pictogram
  was scaled to the wrong size. It also evaluated only x's turning points, missing the top and bottom of
  any curve that is steep there. Both are now asserted directly.
- **Glyph metrics put all the spacing on one side.** Advances came from the skeleton's nominal box
  width rather than the glyph's measured ink, and the ink was never shifted, so every letter had a left
  bearing of about zero and a large right one. A centred single letter therefore sat visibly off-centre,
  and `J` overshot its advance by enough to collide with the letter before it. The compiler now measures
  each glyph's ink — with the same exact turning-point solve the runtime uses — derives the advance from
  that, and centres the ink between equal side bearings. The build fails if any glyph's ink leaves its
  advance box or if its bearings are unequal.
- **Emblem names no longer escape their frame.** The banner's layout was derived from `size` fractions
  while the banner outline was derived from the centre and radius, so the icon and name were positioned
  against a rectangle the frame did not occupy. Both now read one `frameBox`, and the name is fitted to
  the narrowest row of the frame across the band it occupies rather than to a hand-tuned width, so a
  tapered shield or a notched banner cannot leave the type hanging outside its own badge. The banner
  also keeps its name inside the flag, where the reversed-out colour is guaranteed to read.
- **Lettermark corner frames are drawn in the right direction.** The four brackets are built from the
  endpoints of each edge of a square, but were handed to a horizontal-only capsule helper, so the two
  vertical brackets were drawn as horizontal bars and landed outside the frame. New `segmentPath`
  primitive takes its direction from the endpoints.
- **Font selection honours the engine's category rules in every fallback.** `SeedResolver.choice` picks
  uniformly by index, so ordering candidates by preference never made a category any more likely — only
  filtering the pool does. The last-resort branch sorted the whole brain and picked from it, so a mood
  naming no fonts could hand a letter mark a didone, the one outcome the rules exist to prevent.
- **`check:determinism` can no longer report a false pass.** The check imports the built bundle, so
  running it against a stale `dist` re-hashed the old output and reported success no matter what the
  source said. It now refuses to run when `src` is newer than the build.

### Changed

- Letter normalisation is now a single documented rule (`normaliseLetters`) instead of four copies of
  the same inline expression, so the stages that decide which letters a mark may draw cannot drift
  apart.
- Removed dead code: `selectLetters`, `rect`, `centredText`, `scaleForCapHeight`, `lettersOnly`,
  `dividerRule`, `pathSize` and `engineUsesIcon` were unreachable from any engine and from the public
  API.
- Added `pnpm run test:coverage:gaps`, which prints uncovered line ranges per file so coverage numbers
  can be judged against reachable behaviour rather than in the abstract.
- Glyph geometry is now checked by filling it: a winding-number sampler in the test suite asserts that
  every letter drawn with a counter has one, that letters are not mostly hollow, and that no stray
  sub-path inflates a glyph. The sampler is itself checked against a solid disc and a ring first, so a
  pass cannot come from a broken measurement.

### Security

- The serializer rejects `<script>`, event-handler attributes, external references, `style`, and every
  element and attribute outside its allow-list. Attribute values are validated against conservative
  patterns and only then escaped.
- The CLI resolves and creates its output directory before writing, and only ever appends the
  extensions it advertises. File stems are slugified, so a name like `../../etc/passwd` cannot escape
  the output directory.
- Input length is bounded for names, keywords, briefs, word counts and canvas sizes, so hostile input
  cannot stall the pipeline.

[1.0.0]: https://github.com/sigilgen/sigilgen/releases/tag/v1.0.0

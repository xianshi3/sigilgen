# Documentation

Sigilgen is a deterministic logo generator: the same brand name and keywords always produce the same
SVG. That property shapes how it is documented, because every design decision is meant to be
inspectable rather than implicit.

## Start here

| Document                                 | What it covers                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| [../README.md](../README.md)             | Installation, CLI reference, public API, and the guarantees the library makes       |
| [../AGENTS.md](../AGENTS.md)             | The single source of truth for architecture rules, hard constraints and conventions |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Setup, workflow, commit conventions, and how to add an engine or brain data         |

## Design

| Document                                                                         | What it covers                                                                                                             |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [design/001-logo-engine-architecture.md](design/001-logo-engine-architecture.md) | The original design document: goals, non-goals, data structures, and the specification each of the five engines implements |
| [design/002-brain-schema.md](design/002-brain-schema.md)                         | The curated JSON brain: schemas, authoring rules, and how a mood rule turns into a design decision                         |

## Architecture decisions

Each ADR records a decision that was not obvious, including the alternatives that were rejected.

| ADR                                                                                   | Decision                                                                                   |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [ADR-001: TypeScript baseline](architecture/decisions/ADR-001-typescript-baseline.md) | TypeScript, oxc-standard, tsup, Vitest, pnpm — and why SHA-256 is hand-rolled              |
| [ADR-002: No elliptical arcs](architecture/decisions/ADR-002-no-elliptical-arcs.md)   | Why all generated geometry is cubic Béziers, and the renderer-dependent bug that forced it |

## Concepts worth understanding

**Determinism is a feature, not a side effect.** Nothing calls a model or the network. Every choice
comes from a hash of the inputs, read through `SeedResolver`. If you are adding code, the question is
not "is this correct?" but "does this produce the same bytes every time?".

**The brain is the design surface.** Palettes, typefaces, pictograms and mood rules are curated data,
reviewed like code. Adding a mood rule is how you add a design language, not changing a probability.

**Flatness is a constraint on the output, enforced at the boundary.** No gradient, filter, mask, clip,
pattern, image, text or script reaches a user's SVG. `src/serializer.ts` is the only place markup is
produced, and it allow-lists elements and attributes rather than trying to sanitise.

**Winding is part of the output contract.** With no `mask` and no `clipPath`, the only way a hole is cut
is a sub-path wound against its parent — so the orientation of every contour is load-bearing. Two shapes
that wind alike merge; two that wind against each other erase one another under `fill-rule: nonzero`.
Every primitive therefore pins its winding rather than inheriting it from the order its caller happened to
ask for, because the resulting defect is always a seam, a gap or a notch that no bounding box can see.
This has bitten the glyph compiler and the geometry helpers in turn; see
[design/001 §6](design/001-logo-engine-architecture.md).

**A mark is centred on its ink, not on the box or the geometry that built it.** All three are different
things, and only the first is what a reader sees. Centring on the layout box leaves a bearing's width of
slack on one side; centring on the construction leaves an orbit whose satellites happen to fall one way
pushed off to one side.

## Where things live

| Path                                    | Purpose                                                    |
| --------------------------------------- | ---------------------------------------------------------- |
| `src/types.ts`                          | Every interface the pipeline speaks                        |
| `src/generate.ts`                       | Configuration validation and the pipeline                  |
| `src/seed-resolver.ts`, `src/sha256.ts` | Reproducible randomness                                    |
| `src/mood-resolver.ts`                  | Keywords and brief to a design direction                   |
| `src/engine-router.ts`                  | Which engine draws                                         |
| `src/resolvers/`                        | Palette, typeface and pictogram selection                  |
| `src/engines/`                          | The five renderers, plus shared drawing helpers            |
| `src/serializer.ts`                     | The trust boundary                                         |
| `src/brain/`                            | Curated JSON data and its loader                           |
| `scripts/build-brain.mjs`               | Compiles glyph outlines into `src/brain/fonts.json`        |
| `apps/web/`                             | The bilingual studio: a separate package with its own gate |

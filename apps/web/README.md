# Sigilgen Studio

A browser interface for the [Sigilgen](../README.md) generator. Type a brand name, get one to six
deterministic flat-SVG marks, and see the reasoning behind each one.

This app is a **first-party client**, not a third-party integration: it imports the generator's source
directly, so there is no published package to install and no API to keep in sync.

## Running it

```bash
pnpm install
pnpm dev        # http://localhost:5173
```

Other scripts:

| Command        | Purpose                                  |
| -------------- | ---------------------------------------- |
| `pnpm build`   | Type-check, then bundle to `dist/`       |
| `pnpm preview` | Serve the built bundle                   |
| `pnpm check`   | Lint, format-check, type-check and build |

## How it is put together

```
src/
├── components/
│   ├── chrome/Titlebar.tsx      window chrome: language, theme, reroll
│   ├── panels/                  left: inputs, engine, resources, options; right: inspector
│   ├── primitives/              Button, ChoiceGrid, Disclosure, RangeField, Section, Segmented,
│   │                            TextField, Toggle
│   └── stage/                   the canvas, its control bar, and the concept strip
├── i18n/
│   ├── locales/zh.ts            source of truth for the dictionary's shape
│   ├── locales/en.ts            typed as Record<MessageKey, string>
│   └── I18nProvider.tsx         lookup, interpolation and persistence
├── lib/                         generation, export, engine names, brain views, type specimens
├── store/useStudio.ts           all application state, persisted to localStorage
└── styles/tokens.css            every colour, radius, shadow and type step
```

## What the panels do

The left sidebar answers, in order: _what is it called_, _what shape_, _what colours_, _what details_.

| Panel            | Control                                                            |
| ---------------- | ------------------------------------------------------------------ |
| `InputPanel`     | Brand name, keywords, brief                                        |
| `DesignPanel`    | Engine, concept count, canvas size, opaque background              |
| `ResourcePanel`  | Palette swatches and a custom colour list, typefaces, pictograms   |
| `OptionPanel`    | Tri-state pins for the dimensions the active engine actually reads |
| `InspectorPanel` | What was chosen, why, and how to export it                         |

Three details are worth knowing before changing them.

**Resources fold away; their value stays in the heading.** Palette, typeface and pictogram hold 121
items between them. Rendered at once they push the brand name out of the sidebar, so each group is a
`Disclosure` whose summary line keeps the current choice readable while it is closed.

**Typeface specimens are drawn from the brain's outlines.** Every family name in the brain is invented,
so asking the browser to render `Didone Serif` in `Didone Serif` would fall back to the UI face and
produce eighteen identical rows. `fontSample` lays the run out with the generator's own `textPath` and
metrics instead, set in the reader's own brand name.

**A pinned value the engine cannot use is offered nothing.** `OptionPanel` lists only the dimensions
`DIMENSIONS[engine]` declares, and `ENGINE_USES_ICON` disables the pictogram group for the three
engines that draw no pictogram. A control that silently does nothing is worse than no control.

### Decisions worth knowing

**The core is imported as source, not as a package.** `vite.config.ts` aliases `@sigilgen` to `../../src`,
so editing an engine hot-reloads here. `cli.ts` and `rasterize.ts` are the only modules that reach for
Node built-ins; the browser app never imports them, and `tsconfig.json` excludes them from type-checking
for the same reason.

**The token sheet is the design system.** Components reference `text-ink`, `type-title`, `rounded-card`
and never a literal colour or duration.

**Typography is locale-aware, not just translated.** Latin and Han script need different font stacks,
leading and tracking at the same nominal size, so those live on `:root[lang='zh']` and every component
picks them up without branching on the language. Components say `type-title`, not "18px semibold".

**The stage's paper is deliberately not themed.** A palette picks its colours against a light or dark page
of its own accord, so tying the paper to the interface's theme would put dark ink on a dark stage and hide
the mark. `--paper-light` and friends are fixed.

**Dark values are applied by attribute, not by media query.** A reader must be able to choose light on a
dark system, which a media query cannot express. `useThemeEffect` resolves the preference and writes
`data-theme`, which keeps the token sheet to one dark block instead of two copies that must stay in step.

**Candidate lists are imported, never copied.** `lib/dimensions.ts` imports `CONTAINERS`, `FRAMES`,
`MODES` and the rest from the engine modules themselves, and `lib/resources.ts` reads `PALETTES`,
`FONTS`, `ICONS` straight from the brain. A second copy in the app would be free to drift and would
eventually offer a choice that does nothing.

**A released control is stored as absence.** The generator's contract is that an unpinned dimension is
simply not in `preferences`, so `setPreference('container', 'random')` deletes the key rather than
writing the string `random`. The store holds plain strings; `'random'` exists only so the control has
something to mark as chosen.

**Translations are compile-time checked.** `en.ts` is typed as `Record<MessageKey, string>` against
`zh.ts`, so a key that exists in only one language is a build failure rather than a hole found in review.

## Not in this package

The published CLI and library live in the repository root. The browser app is additive: nothing in the core
depends on it, and `pnpm run check` at the root does not build it.

# Sigilgen Studio

A browser interface for the [Sigilgen](../README.md) generator. Type a brand name, get one to six
deterministic flat-SVG marks, and see the reasoning behind each one.

This app is a **first-party client**, not a third-party integration: it imports the generator's source
directly, so there is no published package to install and no API to keep in sync.

## Running it

This is a **separate package**: its own `package.json`, its own lockfile, its own gate. The root
`pnpm run check` does not build it, so a change that touches the studio also needs this gate.

```bash
pnpm install
pnpm dev        # http://localhost:5173
```

Other scripts:

| Command                  | Purpose                                     |
| ------------------------ | ------------------------------------------- |
| `pnpm build`             | Type-check, then bundle to `dist/`          |
| `pnpm preview`           | Serve the built bundle                      |
| `pnpm test`              | Run the Vitest suite once                   |
| `pnpm run test:watch`    | Run Vitest in watch mode                    |
| `pnpm run test:coverage` | Run Vitest with V8 coverage                 |
| `pnpm check`             | Lint, format-check, type-check, test, build |

## Tests

`tests/` runs in `jsdom`, which is the only way the browser-only surface is testable at all: persistence
and its rehydration, the clipboard fallbacks, locale detection and switching.

| File                 | What it holds                                           |
| -------------------- | ------------------------------------------------------- |
| `dimensions.test.ts` | the dictionaries agree, and every offered value is real |
| `studio.test.ts`     | the store, persistence, generation and file naming      |
| `i18n.test.tsx`      | the provider, rendered rather than merely imported      |

Three assertions are worth keeping an eye on, because each catches a way this app can quietly break:

- **Placeholders must match across languages.** A `{count}` present in one language and not the other
  leaves the reader staring at the literal placeholder. The types do not catch this — both dictionaries
  are hand-written.
- **`app.title` is not a language probe.** It is the product name and reads the same in both
  dictionaries, so a test asserting that switching changes it would assert a difference that is
  correctly absent.
- **Storage holding rubbish must not stop the app opening.** Hand-edited state, or state from an older
  build, has to survive rehydration.

`vitest.config.ts` declares the `@sigilgen/*` aliases a second time, because the test runner resolves
modules separately from `tsc`. Keep the two in step with `tsconfig.json` when an entry point is added.

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
| `InspectorPanel` | What was chosen, and how to export it                              |

Three details are worth knowing before changing them.

**Resources fold away; their value stays in the heading.** Palette, typeface and pictogram hold 121
items between them. Rendered at once they push the brand name out of the sidebar, so each group is a
`Disclosure` whose summary line keeps the current choice readable while it is closed.

**Typeface specimens are drawn from the brain's outlines.** Every family name in the brain is invented,
so asking the browser to render `Didone Serif` in `Didone Serif` would fall back to the UI face and
produce eighteen identical rows. `fontSample` lays the run out with the generator's own `textPath` and
metrics instead, set in the reader's own brand name.

**A pinned value the engine cannot use is offered nothing.** `OptionPanel` lists only the dimensions
`DIMENSIONS[engine]` declares, and `ENGINE_USES_ICON` disables the pictogram group for the four
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
Placeholder _sets_ are not covered by that type, which is why `tests/dimensions.test.ts` compares them
between the two dictionaries.

**File names fold diacritics rather than dropping them.** `fileStem` normalises to ASCII before slugging,
so "Café Über" downloads as `cafe-uber` and not `caf-ber`. Replacing every non-ASCII character outright
removed the accent _and_ the letter carrying it, which both mangled the name and let two different brands
collapse onto one file. Folding still converges "Café" and "Cafe", which is correct — they are the same
brand to a reader.

**The panels become drawers below 900px.** They are 288 and 300 units wide and do not shrink, so between
them they need 588 before the stage gets anything. At a 390px phone the three-column layout rendered
un-reflowed: the stage was squeezed to zero width and the right panel's text was cut off mid-word. Past
that width the panels overlay the stage and only one opens at a time — two open at once would cover the
mark, which is the one thing the app exists to show. Narrowing records which panels were open and closes
them; widening puts them back. Forgetting them instead would mean a reader who briefly shrank the window
lost both panels until they reloaded.

**The panel toggles sit above the drawers in the stacking order.** A toggle underneath an open drawer is
unreachable, and the reader has no way to close it at all.

**The title bar wraps rather than clipping.** The brand, two segmented controls and the primary button
need about 420px between them. Below `sm` the controls take a full row, which costs 24px of height only
where there is height to spare — the alternative was the brand clipped mid-word.

**A `radiogroup` is a contract, not a label.** `Segmented` is one tab stop, with arrow keys moving between
the options and selection following focus, wrapping at both ends. Without it every segment was its own
tab stop, so a reader crossing the studio passed through eight stops to get from the language control to
the theme control, and the arrow keys a screen reader announces as available did nothing.

## Not in this package

The published CLI and library live in the repository root. The browser app is additive: nothing in the core
depends on it, and `pnpm run check` at the root does not build it.

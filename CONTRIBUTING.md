# Contributing to Sigilgen

Thanks for taking the time to contribute. This document is the playbook: it covers setup, the
branching and commit conventions, and the review expectations.

New to the project? Read [`AGENTS.md`](./AGENTS.md) first — it is the single source of truth for
architecture rules, and it is what every other AI tool file links back to.

## Code of Conduct

By participating you agree to uphold the [Code of Conduct](./CODE_OF_CONDUCT.md), which is a
pointer to the [Contributor Covenant](https://www.contributor-covenant.org/).

Security issues do **not** go through the public tracker. See [SECURITY.md](./SECURITY.md).

## Prerequisites

| Tool    | Version                |
| ------- | ---------------------- |
| Node.js | 24 LTS+ (22.12+ works) |
| pnpm    | 9+                     |

Enable pnpm if your Node install does not already provide it:

```bash
corepack enable pnpm
```

## Getting Started

```bash
pnpm install        # install dependencies
pnpm run links      # create AI tool symlinks (AGENTS.md is the source)
pnpm test           # run the test suite
pnpm run check      # lint + format check + typecheck + tests
```

`pnpm run links` creates `CLAUDE.md`, `.cursorrules`, `.windsurfrules` and
`.github/copilot-instructions.md` as symlinks to `AGENTS.md`. Never edit those files directly —
edit `AGENTS.md` instead.

## Everyday Commands

| Command                  | What it does                                                   |
| ------------------------ | -------------------------------------------------------------- |
| `pnpm build`             | Build ESM + CJS + type declarations into `dist/`               |
| `pnpm test`              | Run the Vitest suite once                                      |
| `pnpm run test:watch`    | Run Vitest in watch mode                                       |
| `pnpm run test:coverage` | Run Vitest with V8 coverage                                    |
| `pnpm lint`              | Lint and auto-fix with oxlint                                  |
| `pnpm run lint:check`    | Lint without writing changes                                   |
| `pnpm fmt`               | Format with oxfmt                                              |
| `pnpm run fmt:check`     | Verify formatting without writing changes                      |
| `pnpm run typecheck`     | `tsc --noEmit`                                                 |
| `pnpm run check`         | Everything above, in the order CI runs it                      |
| `pnpm run build:brain`   | Regenerate `src/brain/fonts.json` from the letterform compiler |

## Making a Change

1. **Open an issue first** for anything beyond a bug fix. It saves everyone a rejected PR.
2. **Branch** from `main` using `feat/short-slug`, `fix/short-slug`, `docs/short-slug`,
   `refactor/short-slug`, or `chore/short-slug`.
3. **Keep the diff focused.** Unrelated reformatting makes review harder and hides bugs.
4. **Add or update tests** for every behaviour change. Determinism is the product; an untested
   change to the pipeline is a bug.
5. **Run `pnpm run check`** before you push. CI runs the same command.
6. **Write a Conventional Commit** message (see below).
7. **Open a PR** using the repository template and fill it in honestly.

### Where does new code go?

| Change                     | Location                                                     |
| -------------------------- | ------------------------------------------------------------ |
| New rendering engine       | `src/engines/`                                               |
| New decision resolver      | `src/resolvers/`                                             |
| New or edited curated data | `src/brain/` (generated fonts via `scripts/build-brain.mjs`) |
| New test                   | `tests/<module-name>.test.ts`                                |
| New CLI flag               | `src/cli.ts` plus the README CLI table                       |
| Public API change          | JSDoc in `src/` plus the README API section                  |

## Commit Convention

Format: `<type>(<scope>): <summary>`

```text
feat(engines): add ray-burst mode to the abstract engine
fix(resolver): make palette fallback deterministic for unknown ids
docs(readme): document the --png-size flag
```

| Type       | Use for                                  | SemVer |
| ---------- | ---------------------------------------- | ------ |
| `feat`     | New user-visible feature                 | minor  |
| `fix`      | Bug fix                                  | patch  |
| `perf`     | Performance improvement                  | patch  |
| `docs`     | Documentation only                       | none   |
| `test`     | Tests only                               | none   |
| `refactor` | Code change that is neither fix nor feat | none   |
| `chore`    | Tooling, dependencies, housekeeping      | none   |
| `ci`       | CI/CD configuration                      | none   |
| `build`    | Build system and packaging               | none   |
| `style`    | Whitespace and formatting                | none   |

Mark breaking changes with `!` after the type/scope, or add a `BREAKING CHANGE:` footer. Either
form forces a major version bump.

```text
feat(cli)!: rename --palette to --colors

BREAKING CHANGE: --palette was renamed. Existing scripts must be updated.
```

Keep the summary in the imperative mood, under 72 characters, and do not end it with a period.

## Adding Brain Data

The curated JSON brain is the design surface of this project, and it is reviewed like code.

- **New palette** → append to `src/brain/palettes.json` with a stable kebab-case `id`, lowercase
  hex colours, a non-null `background` or explicit `null`, and descriptive `tags`.
- **New icon** → append to `src/brain/icons.json`. Icons are drawn on a `0 0 24 24` grid, filled
  (not stroked) unless the entry says otherwise, and must stay legible at 16 px.
- **New mood** → append to `src/brain/moods.json`. Every `paletteIds`, `fontIds` and `iconKeys`
  entry must reference an existing resource; a test enforces this.
- **New or edited font** → edit the letterform definitions in `scripts/build-brain.mjs` and run
  `pnpm run build:brain`. Never hand-edit `src/brain/fonts.json`; it is generated.

## Pull Request Expectations

Reviewers will check:

- **Determinism.** Identical inputs still produce byte-identical SVG. No `Date.now()`, no
  `Math.random()`, no `Object`/`Set`/`Map` iteration order leaking into output, no locale-dependent
  string ops.
- **Zero runtime dependencies.** `dependencies` stays empty; `sharp` stays optional.
- **Flat SVG.** No `<linearGradient>`, `<radialGradient>`, `<filter>`, `<mask>`, `<pattern>`,
  `<image>` or `<script>` in emitted output.
- **Safety.** Untrusted text is escaped or rejected before it reaches an attribute.
- **Tests.** New logic is covered, including the failure path.
- **Docs.** README and `docs/` updated when public behaviour changes.
- **Style.** `pnpm run check` is clean.

## Adding a New Engine

1. Create `src/engines/<name>.ts` exporting a function that returns `SVGElement[]`.
2. Register it in `src/engine-router.ts` and add a row to the engine table in the design doc.
3. Add engine weights to at least one mood in `src/brain/moods.json` so it is reachable.
4. Add a routing test and an output-shape test in `tests/engines.test.ts`.

## Reporting Bugs

Open an issue with the reproduction from
[`.github/ISSUE_TEMPLATE/bug_report.md`](./.github/ISSUE_TEMPLATE/bug_report.md). Because output is
deterministic, please include the exact `name`, `keywords`, `seed` and flags — those four values are
usually enough to reproduce a bug exactly. If PNG output differs from SVG output, attach both.

## Licence

By contributing you agree that your contributions are licensed under the [MIT License](./LICENSE).

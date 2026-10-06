# ADR-001: TypeScript, oxlint and tsup as the toolchain baseline

- **Status:** accepted
- **Date:** 2026-10-04

## Context

Sigilgen is a library first and a CLI second. Its consumers are Node projects, build scripts, and
occasionally bundlers. That shapes the toolchain decision more than any other requirement:

- The package ships as ESM **and** CJS with type declarations, because library consumers are split
  between bundler-first and Node-first workflows.
- The runtime must have **zero dependencies**, so anything the build needs cannot become something the
  runtime needs.
- The repository has to stay comfortable for AI coding agents as well as people, which argues for a
  small, explicit toolchain rather than a large one with layers of configuration.

## Decision

**Language: TypeScript in `strict` mode**, with `noUncheckedIndexedAccess`, `noUnusedLocals` and
`noUnusedParameters` enabled. Array indexing is treated as genuinely possibly-`undefined`, because the
code indexes glyph metrics and advance tables by letter throughout.

**Lint and format: [oxc-standard](https://github.com/JohnDeved/ox-standard)**, which wraps `oxlint`
and `oxfmt` from the Rust-based [oxc](https://oxc.rs/) toolchain. This replaces an ESLint + Prettier
pair with a single dependency and one consistent style.

**Style: Standard.** No semicolons, single quotes, 2-space indent, 100 columns, `arrowParens: avoid`,
`interface` over `type` for object shapes and `readonly T[]` over `ReadonlyArray<T>`.

One style rule had to give way to the tool rather than the other way round. `typescript/array-type` in
the pinned oxlint version only accepts `default` (`T[]`) and `readonly`, and offers no
`array-generic` option, so `Array<T>` is not expressible. The codebase was migrated to `T[]` and this
document, `AGENTS.md` and the lint config all say so. A rule that cannot be configured should not be
described as a convention the codebase follows.

**Build: [tsup](https://tsup.egoist.dev/)** for ESM + CJS + declaration output in a single pass.

**Tests: [Vitest](https://vitest.dev/)**, sharing the Vite transform pipeline, so tests run against
the same TypeScript semantics the build uses.

**Package manager: pnpm 9+**, for disk-efficient installs and clean workspace support.

**JSON imports are bundled, not read at runtime.** The brain data is `import`ed like any other module
and inlined by the bundler. Reading JSON from disk at runtime would have broken browser and worker
consumers and added a failure mode for no benefit.

## Consequences

- Two module formats means a slightly larger published package than ESM-only, and every dual-format
  package has to keep both entry points honest. Accepted.
- Standard style means no semicolons. This is visible in every source file but is enforced
  automatically, so style is never a review topic.
- A hand-rolled SHA-256 in `src/sha256.ts` rather than `node:crypto`. This keeps the library usable in
  browsers and workers, and the implementation is verified against the published FIPS 180-4 test
  vectors in `tests/sha256.test.ts`. The cost is roughly 150 lines of code that a reviewer has to
  trust; the benefit is that determinism is identical everywhere.
- `resolveJsonModule` plus a bundler means TypeScript does not type-check the JSON contents. The brain
  is validated at load time by `src/brain/index.ts` instead, which is a stronger guarantee anyway:
  dangling references and malformed colours fail loudly with a useful message.
- The project requires Node 22.12 or newer to develop. Node 24 LTS is what CI runs.

## Alternatives considered

| Option                      | Why not                                                                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ESLint + Prettier           | Two dependencies and two configurations to keep in step; considerably slower. Superseded by oxc-standard.                                                              |
| JavaScript with JSDoc       | Loses compile-time checking on the interfaces that everything else depends on. The brain and the SVG element model are the kind of code that benefits from real types. |
| tsc alone for the build     | Emits one module format per `tsconfig`. Supporting both consumers would mean two tsconfigs, two out dirs and a hand-written `exports` map.                             |
| Node's built-in test runner | No transform pipeline, so tests would need a build step first, slowing the inner loop.                                                                                 |
| `node:crypto` for hashing   | Would tie the library to Node and make "identical output everywhere" untrue. See above.                                                                                |

## Notes for future maintainers

- Do not add anything to `dependencies`. There is no such section. If a feature needs a package at
  runtime, it belongs in `optionalDependencies` behind a dynamic `import()`, the way `sharp` is.
- Any optional dependency must also be listed in `external` in `tsup.config.ts`. Bundling one turns it
  into a de facto requirement: the shipped artefact would contain a native module and the install would
  succeed even on a platform the binary does not support. With it external, a missing package produces
  a clean `RasterSupportError` instead.
- Style is `oxfmt`'s decision, not yours. Run `pnpm fmt` rather than hand-formatting.
- The `T[]` and no-semicolon conventions are lint rules, not preferences. Do not suppress them.
- `oxlint` and `oxfmt` are direct dev dependencies even though `oxc-standard` pulls them in
  transitively. pnpm does not hoist transitive binaries, so `pnpm lint` cannot find `oxlint` unless it
  is a direct dependency.
- Generated files are ignored by the formatter via `.oxfmtignore`. `src/brain/fonts.json` belongs to
  `scripts/build-brain.mjs` alone; if the formatter rewrites it, `--check` reports stale output forever.

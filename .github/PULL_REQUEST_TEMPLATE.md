---
name: Conventional Commit
about: Describe the change and confirm the invariants hold
title: 'type(scope): summary'
labels: ''
assignees: ''
---

## What this changes

<!-- One or two sentences. Link the issue it closes: Closes #123 -->

## Why

<!-- The motivation. What was wrong or missing before? -->

## Type of change

- [ ] Bug fix (`fix`)
- [ ] New feature (`feat`)
- [ ] Performance (`perf`)
- [ ] Documentation (`docs`)
- [ ] Tests only (`test`)
- [ ] Refactor, no behaviour change (`refactor`)
- [ ] Tooling, dependencies, housekeeping (`chore`)
- [ ] CI/CD (`ci`)
- [ ] Build system (`build`)
- [ ] Formatting only (`style`)

- [ ] This PR contains a breaking change (`!` suffix or `BREAKING CHANGE:` footer)

## Invariants

Confirm each one. A reviewer will check the same list.

- [ ] `pnpm run check` passes (lint, format check, typecheck, tests).
- [ ] Same input still produces **byte-identical** SVG. No `Date.now()`, no `Math.random()`, no
      locale-sensitive comparisons, no iteration-order dependence.
- [ ] No runtime dependency was added. `dependencies` is still `{}`; `sharp` is still optional.
- [ ] Emitted SVG stays flat: no `<linearGradient>`, `<radialGradient>`, `<filter>`, `<mask>`,
      `<clipPath>`, `<pattern>`, `<image>`, `<foreignObject>`, `<script>` or `on*` handler.
- [ ] Untrusted input (name, keywords, CLI flags) is escaped or rejected before entering an
      attribute value.
- [ ] Font paths still come from the JSON brain; no font file is parsed at runtime.
- [ ] No import cycle was introduced.

## Testing

- [ ] New behaviour has a test.
- [ ] Changed behaviour has an updated test.
- [ ] Failure paths are covered, not just the happy path.

## Documentation

- [ ] `README.md` updated if public API or CLI changed.
- [ ] `docs/` updated if engine logic, brain schema or architecture changed.
- [ ] New ADR added under `docs/architecture/decisions/` if an architectural decision was made.
- [ ] All public API symbols have JSDoc.

## Brain data

- [ ] Not applicable, or: new/changed entries are in `src/brain/`, every referenced id exists, and
      `src/brain/fonts.json` was regenerated with `pnpm run build:brain` rather than hand-edited.

## Screenshots

<!-- For visual changes: attach before/after SVG or PNG so reviewers can see the difference. -->

## Checklist

- [ ] Commits follow Conventional Commits.
- [ ] The diff contains no unrelated reformatting.
- [ ] The PR description explains _why_, not only _what_.

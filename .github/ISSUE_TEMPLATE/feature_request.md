---
name: Feature request
about: Suggest a new capability for Sigilgen
title: ''
labels: enhancement
assignees: ''
---

## Problem

<!-- The problem first, not the solution. What can you not do today? -->

## Proposed solution

<!-- What you would like to happen. -->

## Which part of the pipeline

<!-- Check all that apply. -->

- [ ] Input / `LogoConfig`
- [ ] Seed determinism
- [ ] Mood resolution (`src/mood-resolver.ts`)
- [ ] Engine routing (`src/engine-router.ts`)
- [ ] Font / palette / icon resolution (`src/resolvers/`)
- [ ] A rendering engine (`src/engines/`)
- [ ] SVG serialization (`src/serializer.ts`)
- [ ] CLI (`src/cli.ts`)
- [ ] Brain data (`src/brain/`)
- [ ] Documentation / tests only

## Example

<!-- A concrete input and the output you would expect. Concrete examples get implemented. -->

```ts
import { generateLogo } from 'sigilgen'

generateLogo({ name: 'Example', keywords: 'fintech, calm' })
```

## Alternatives considered

<!-- Other approaches, and why this one is better. -->

## Constraints

- [ ] This stays deterministic — same input, same bytes.
- [ ] This adds no runtime dependency.
- [ ] This emits flat SVG only (no gradient, filter, mask, script).
- [ ] This works offline with no network access.

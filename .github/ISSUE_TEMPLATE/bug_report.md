---
name: Bug report
about: Something in Sigilgen produces the wrong output
title: ''
labels: bug
assignees: ''
---

## What happened

<!-- A clear, one-paragraph description of the incorrect behaviour. -->

## Reproduction

Sigilgen output is deterministic, so these four values are usually all we need:

```text
name:     <!-- e.g. Acme -->
keywords: <!-- e.g. tech, minimal -->
seed:     <!-- if you set one -->
engine:   <!-- if you forced one -->
```

Exact command (or the smallest `generateLogo` call):

```bash
pnpm sigilgen --name "Acme" --keywords "tech, minimal"
```

If PNG output looks different from the SVG, save **both** files and attach them. If the same input
produced correct output on an earlier version, note the last known-good version.

## Expected result

<!-- What you expected the output to be. Attach the SVG if you have it. -->

## Actual result

<!-- What happened instead. Attach the SVG if you have it. -->

## Environment

|                  |                                                    |
| ---------------- | -------------------------------------------------- |
| Sigilgen version | <!-- `pnpm sigilgen --version` -->                 |
| Node.js version  | <!-- `node --version` -->                          |
| pnpm version     | <!-- `pnpm --version` -->                          |
| OS               | <!-- e.g. Windows 11, macOS 15.5, Ubuntu 24.04 --> |
| sharp installed  | <!-- yes / no (`pnpm why sharp`) -->               |

## Anything else

<!-- Error output, stack traces, related issues, or a screenshot of the generated SVG. -->

# ADR-002: No elliptical arc commands in generated geometry

- **Status:** accepted
- **Date:** 2026-10-04

## Context

Sigilgen draws a great deal of geometry: ring-shaped letter counters, squircle containers, radial
abstract marks, and 468 pre-generated glyph outlines. The obvious way to express a circle or ellipse in
SVG is the elliptical arc command, `A`.

While building the letterform compiler it became clear that `A` cannot be relied on for the specific
job of drawing a _half_ ellipse.

## The problem

An `A` command whose two endpoints are exactly diametrically opposite is mathematically ambiguous. The
chord satisfies both candidate ellipse centres equally, and the `large-arc` and `sweep` flags do not
resolve it: with both endpoints on the vertical extremes of an ellipse, `large-arc=0 sweep=1` produces a
90° or 270° sweep rather than the intended 180°.

This is not a hypothetical. The first version of the font compiler used `A` for every bowl and counter.
The rendered result was a set of crescents: a B with no counters, an O with no counter, letterforms
that read as a different letter entirely. Chrome, librsvg and resvg all agreed on the wrong answer,
which confirmed the data was wrong rather than the renderers.

## Decision

**All generated geometry uses `M`, `L`, `C` and `Z` only.** No `A` commands are emitted anywhere.

- The font compiler converts every ellipse to cubic Béziers directly, using the standard
  approximation: handle length `(4/3) · tan(angle / 4)`, with segments split so that no segment
  exceeds 90°.
- `src/path.ts` still _accepts_ `A` when parsing, and converts it to cubics on the way in. This keeps
  hand-authored icon data and third-party path data working. The conversion follows SVG 1.1 appendix
  F.6.5, including the radii-scaling correction for chords the radii cannot span.
- `transformPath` therefore only ever scales and translates `M`, `L` and `C` coordinates, which is
  exact. It has no arc cases to get wrong.

## Consequences

- Cubics have no flag ambiguity. Two renderers cannot disagree about which of the two candidate
  ellipses was meant.
- The Bézier approximation of a quarter ellipse is accurate to about 0.02% of the radius, which is far
  below the precision at which a logo is judged.
- Paths get slightly longer. A quarter ellipse is one cubic instead of one arc, and a full ellipse is
  four instead of two, so `fonts.json` grew by roughly 3% when this changed. That is a fair trade.
- `parsePath` carries an arc-to-cubic converter that the generator itself never exercises. It is
  covered by tests, and it earns its place by keeping hand-authored icon data working.
- One subtle trap is now guarded by an explicit test in `tests/path.test.ts`: `Math.tan` takes radians.
  Passing degrees produces handles several radii long, which throws curves far outside their own
  bounding box without throwing an error. The `keeps control points near the ellipse` test exists
  solely to catch that class of mistake.

## Alternatives considered

| Option                                          | Why not                                                                                                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep `A` and choose flags carefully             | The ambiguity is inherent to diametrically opposite endpoints; there is no flag combination that reliably gives 180°.                              |
| Use quadratics (`Q`) instead of cubics          | Quadratics cannot represent a circular arc to better than about 8% without splitting, which needs more segments than cubics for the same accuracy. |
| Ship the ambiguity and accept renderer variance | The output is a brand asset. "Renders slightly differently in Firefox" is not acceptable.                                                          |

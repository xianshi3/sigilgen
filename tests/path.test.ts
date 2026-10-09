import { describe, expect, it } from 'vitest'
import { arcPath, isSafePathData, parsePath, pathBounds, transformPath } from '../src/path'
import { capHeightForWidth, fitText, naturalWidth } from '../src/engines/metrics'
import { FONTS, findFont } from '../src/brain/index'
import {
  arcBandPath,
  burstPath,
  capsulePath,
  chevronPath,
  discPath,
  ellipsePath,
  polar,
  regularPolygonPath,
  ringPath,
  roundedRectPath,
  segmentPath,
  shieldPath,
  smoothClosedPath,
  starPath,
  superellipsePath,
} from '../src/geometry'

describe('parsePath', () => {
  it('keeps absolute commands as they are', () => {
    expect(parsePath('M 1 2 L 3 4 Z')).toEqual([
      { cmd: 'M', values: [1, 2] },
      { cmd: 'L', values: [3, 4] },
      { cmd: 'Z', values: [] },
    ])
  })

  it('expands relative commands against the current point', () => {
    expect(parsePath('m 10 10 l 5 5')).toEqual([
      { cmd: 'M', values: [10, 10] },
      { cmd: 'L', values: [15, 15] },
    ])
  })

  it('treats a repeated coordinate pair after a moveto as a lineto', () => {
    expect(parsePath('M 1 1 2 2 3 3')).toEqual([
      { cmd: 'M', values: [1, 1] },
      { cmd: 'L', values: [2, 2] },
      { cmd: 'L', values: [3, 3] },
    ])
  })

  it('expands H and V', () => {
    expect(parsePath('M 0 0 H 10 V 20')).toEqual([
      { cmd: 'M', values: [0, 0] },
      { cmd: 'L', values: [10, 0] },
      { cmd: 'L', values: [10, 20] },
    ])
  })

  it('converts quadratics to cubics', () => {
    const segments = parsePath('M 0 0 Q 10 10 20 0')
    expect(segments[1]?.cmd).toBe('C')
    const values = segments[1]?.values ?? []
    expect(values[0]).toBeCloseTo(20 / 3)
    expect(values[2]).toBeCloseTo(40 / 3)
    expect(values[4]).toBe(20)
  })

  it('reflects shorthand control points', () => {
    // `S` continues the previous curve by mirroring that curve's second control point about the
    // current point: for `C 1 1 2 1 3 0` the mirror of (2,1) about (3,0) is (4,-1).
    const smooth = parsePath('M 0 0 C 1 1 2 1 3 0 S 5 -1 6 0')
    expect(smooth[2]?.cmd).toBe('C')
    expect(smooth[2]?.values.slice(0, 2)).toEqual([4, -1])
  })

  it('reflects the control point of a preceding quadratic for T', () => {
    // `T` is the quadratic counterpart of `S`: it mirrors the *previous* quadratic's single control
    // point about the current point. For `Q 10 10 20 0` the current point is (20,0), so the mirror
    // of (10,10) is (30,-10), and the converted cubic starts at (20,0) + 2/3 * ((30,-10)-(20,0)).
    const segments = parsePath('M 0 0 Q 10 10 20 0 T 30 10')
    expect(segments[2]?.cmd).toBe('C')
    expect(segments[2]?.values[0]).toBeCloseTo(20 + 20 / 3)
    expect(segments[2]?.values[1]).toBeCloseTo(-20 / 3)
    expect(segments[2]?.values.slice(4)).toEqual([30, 10])
  })

  it('treats a leading T as a straight curve, since there is nothing to mirror', () => {
    // With no preceding quadratic the control point coincides with the current point, which converts
    // to a straight line rather than a curve. Guessing a control point here would invent geometry.
    const segments = parsePath('M 5 5 T 10 10')
    expect(segments[1]?.cmd).toBe('C')
    expect(segments[1]?.values.slice(0, 2)).toEqual([5, 5])
    expect(segments[1]?.values.slice(4)).toEqual([10, 10])
  })

  it('converts arcs to cubics', () => {
    const segments = parsePath('M 0 0 A 50 50 0 0 1 100 0')
    expect(segments[0]?.cmd).toBe('M')
    expect(segments.filter(segment => segment.cmd === 'C').length).toBe(2)
  })

  it('handles a full-circle arc as four segments', () => {
    // Two semicircles: with a chord equal to the diameter both arcs are exactly 180 degrees, so each
    // splits into two cubics.
    const segments = parsePath('M 100 0 A 50 50 0 0 1 200 0 A 50 50 0 0 1 100 0')
    expect(segments.filter(segment => segment.cmd === 'C').length).toBe(4)
  })

  it('sweeps the major arc when the large-arc flag is set', () => {
    // A chord shorter than the diameter leaves two candidate arcs; the flag picks the long one.
    const small = parsePath('M 100 0 A 100 100 0 0 1 200 0')
    const large = parsePath('M 100 0 A 100 100 0 1 1 200 0')
    expect(large.filter(s => s.cmd === 'C').length).toBeGreaterThan(
      small.filter(s => s.cmd === 'C').length
    )
  })

  it('degrades a degenerate arc to a line rather than throwing', () => {
    expect(() => parsePath('M 0 0 A 0 0 0 0 1 10 10')).not.toThrow()
    expect(() => parsePath('M 0 0 A 50 50 0 0 1 0 0')).not.toThrow()
  })

  it('returns to the subpath start after Z', () => {
    const segments = parsePath('M 5 5 L 10 10 Z l 1 1')
    expect(segments[2]).toEqual({ cmd: 'Z', values: [] })
    expect(segments[3]).toEqual({ cmd: 'L', values: [6, 6] })
  })

  it('rejects unknown commands', () => {
    expect(() => parsePath('M 0 0 X 1 1')).toThrow(/unsupported path command/)
  })

  it('rejects truncated data', () => {
    expect(() => parsePath('M 0 0 L 1')).toThrow(/missing a coordinate/)
  })

  it('rejects a coordinate too long to be a number', () => {
    // A long enough run of digits parses to Infinity. Letting that through would put `Infinity` into
    // emitted path data, which the serializer rejects much later with a far less useful message.
    expect(() => parsePath(`M ${'9'.repeat(400)} 0 L 10 10`)).toThrow(/invalid number/)
  })

  it('treats a leading S as a straight curve, since there is nothing to mirror', () => {
    const segments = parsePath('M 5 5 S 10 -1 12 0')
    expect(segments[1]?.cmd).toBe('C')
    // With no preceding cubic the mirrored control point sits on the current point.
    expect(segments[1]?.values.slice(0, 2)).toEqual([5, 5])
  })

  it('rejects stray characters', () => {
    expect(() => parsePath('M 0 0 L 1 1 @')).toThrow(/invalid path data/)
  })

  it('tolerates commas and arbitrary whitespace', () => {
    expect(parsePath('M0,0L10,10')).toEqual(parsePath('M 0 0 L 10 10'))
  })
})

describe('transformPath', () => {
  it('scales and translates coordinates', () => {
    expect(transformPath('M 10 20 L 30 40', 2, 5, 7)).toBe('M25 47L65 87')
  })

  it('bakes the transform into the path rather than emitting a transform attribute', () => {
    expect(transformPath('M 0 0 L 1 1', 1, 2, 2)).not.toContain('transform')
  })

  it('scales cubic control points as well as endpoints', () => {
    expect(transformPath('M0 0C1 2 3 4 5 6', 2, 0, 0)).toBe('M0 0C2 4 6 8 10 12')
  })

  it('handles an identity transform without changing the numbers', () => {
    expect(transformPath('M 1.5 2.5 L 3 4', 1, 0, 0)).toBe('M1.5 2.5L3 4')
  })

  it('round-trips every glyph in the brain without producing NaN', () => {
    for (const font of FONTS) {
      for (const [letter, d] of Object.entries(font.glyphs)) {
        const out = transformPath(d, 0.25, 12, 34)
        expect(out, `${font.id}/${letter}`).not.toMatch(/NaN|Infinity|undefined/)
        expect(isSafePathData(out)).toBe(true)
      }
    }
  })

  it('emits nothing for empty input', () => {
    expect(transformPath('', 1, 0, 0)).toBe('')
  })
})

describe('isSafePathData', () => {
  it('accepts the command set the generator emits', () => {
    expect(isSafePathData('M0 0L1 1C2 2 3 3 4 4Z')).toBe(true)
    expect(isSafePathData('M 0 0 A 5 5 0 0 1 10 0')).toBe(true)
  })

  it('rejects anything with markup or javascript', () => {
    expect(isSafePathData('M0 0<script>')).toBe(false)
    expect(isSafePathData('M0 0" onload="x')).toBe(false)
    expect(isSafePathData('javascript:alert(1)')).toBe(false)
  })
})

describe('arcPath', () => {
  it('emits cubic commands only', () => {
    expect(arcPath(0, 0, 10, 10, 0, 90).startsWith('C ')).toBe(true)
  })

  it('splits long sweeps into several segments', () => {
    expect(arcPath(0, 0, 10, 10, 0, 270).split('C').length - 1).toBe(3)
    expect(arcPath(0, 0, 10, 10, 0, 90).split('C').length - 1).toBe(1)
  })

  it('lands on the requested end point', () => {
    const segments = parsePath(`M 0 0 ${arcPath(0, 0, 10, 20, 0, 90)}`)
    const last = segments[segments.length - 1]?.values ?? []
    expect(last[4]).toBeCloseTo(0, 1)
    expect(last[5]).toBeCloseTo(20, 1)
  })

  it('keeps control points near the ellipse', () => {
    // A regression guard. The Bézier handle length is (4/3)*tan(angle/4), and `Math.tan` takes
    // radians: passing degrees silently produced handles many radii long, which threw curves far
    // outside their own bounding box. Control points may sit a little outside the endpoints, so the
    // bound is the ellipse box plus one radius.
    const limit = 100 + 80 + 80
    for (const sweep of [15, 30, 45, 60, 75, 90, 120, 180, 240, 300, 360]) {
      for (const from of [0, 17, 90, 200, 350]) {
        const d = arcPath(100, 100, 80, 50, from, from + sweep)
        for (const number of d.match(/-?\d+(?:\.\d+)?/g) ?? []) {
          const value = Math.abs(Number(number))
          expect(value, `sweep ${sweep} from ${from}`).toBeLessThanOrEqual(limit)
        }
      }
    }
  })

  it('traces a circle accurately', () => {
    // Sample the segment endpoints and confirm each sits on the circle. Control points deliberately do
    // not: a cubic approximation always bows them off the true curve.
    const segments = parsePath(`M 200 100 ${arcPath(100, 100, 100, 100, 0, 360)}`)
    expect(segments.filter(segment => segment.cmd === 'C').length).toBe(4)
    const points: [number, number][] = [[200, 100]]
    for (const segment of segments) {
      if (segment.cmd !== 'C') continue
      points.push([segment.values[4] as number, segment.values[5] as number])
    }
    expect(points).toHaveLength(5)
    for (const [x, y] of points) {
      const r = Math.hypot(x - 100, y - 100)
      expect(r).toBeGreaterThan(99.99)
      expect(r).toBeLessThan(100.01)
    }
  })
})

describe('pathBounds', () => {
  it('measures a circle exactly', () => {
    // A regression guard on the measurement itself. `parsePath` stores a cubic as two control points
    // and an end point, with the start implied; reading those six values as though the start were
    // included shifted every curve by one control point, so this used to return a box far larger than
    // the circle — and every icon measured with it was scaled to the wrong size.
    const bounds = pathBounds(`M 200 100 ${arcPath(100, 100, 100, 100, 0, 360)}`)!
    expect(bounds.minX).toBeCloseTo(0, 1)
    expect(bounds.maxX).toBeCloseTo(200, 1)
    expect(bounds.minY).toBeCloseTo(0, 1)
    expect(bounds.maxY).toBeCloseTo(200, 1)
  })

  it('measures a curve by its curve, not by its control points', () => {
    // A cubic from (0,0) to (100,0) with both control points at y=100 arcs upward. Its highest point is
    // well below the control points, so a box reaching y=100 would be measuring the hull.
    const bounds = pathBounds('M 0 0 C 0 100 100 100 100 0')!
    expect(bounds.minY).toBeCloseTo(0, 1)
    expect(bounds.maxY).toBeCloseTo(75, 0)
    expect(bounds.minX).toBeCloseTo(0, 1)
    expect(bounds.maxX).toBeCloseTo(100, 1)
  })

  it('measures a curve that never turns in x but rises in y', () => {
    // A regression guard on the axis handling. `x` is monotonic here — its turning-point equation has
    // no real roots — so evaluating only x's turning points reports a box with no height at all and
    // silently flattens the curve.
    const bounds = pathBounds('M 0 0 C 0 1 2 1 2 0')!
    expect(bounds.maxY).toBeCloseTo(0.75, 6)
    expect(bounds.minY).toBeCloseTo(0, 6)
    expect(bounds.minX).toBeCloseTo(0, 6)
    expect(bounds.maxX).toBeCloseTo(2, 6)
  })

  it('measures a monotonic curve by its endpoints', () => {
    // The other half of the same guard: `x` never turns, so the box comes from the endpoints alone.
    const bounds = pathBounds('M 0 0 C 1 0 0 0 2 0')!
    expect(bounds.minX).toBeCloseTo(0, 6)
    expect(bounds.maxX).toBeCloseTo(2, 6)
    expect(bounds.minY).toBeCloseTo(0, 6)
    expect(bounds.maxY).toBeCloseTo(0, 6)
  })

  it('measures a straight line by its endpoints', () => {
    expect(pathBounds('M 10 20 L 110 60')).toEqual({ minX: 10, minY: 20, maxX: 110, maxY: 60 })
  })

  it('measures a closed shape including every sub-path', () => {
    // A frame is an outer and an inner contour; both are part of the ink.
    const bounds = pathBounds('M 0 0 L 100 0 L 100 100 Z M 20 20 L 20 80 L 80 80 Z')!
    expect(bounds).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 100 })
  })

  it('returns null for data that encloses nothing', () => {
    expect(pathBounds('')).toBeNull()
  })
})

describe('geometry helpers', () => {
  it('polar follows screen angles', () => {
    expect(polar(0, 0, 10, 0).x).toBeCloseTo(10)
    expect(polar(0, 0, 10, 90).y).toBeCloseTo(10)
    expect(polar(0, 0, 10, 180).x).toBeCloseTo(-10)
    expect(polar(0, 0, 10, 270).y).toBeCloseTo(-10)
  })

  it('produces safe path data from every helper', () => {
    const helpers: [string, string][] = [
      ['disc', discPath(50, 50, 20)],
      ['ellipse', ellipsePath(50, 50, 30, 20)],
      ['ring', ringPath(50, 50, 30, 30, 6)],
      ['arcBand', arcBandPath(50, 50, 30, 20, 6, 0, 140)],
      ['regularPolygon', regularPolygonPath(50, 50, 25, 6)],
      ['star', starPath(50, 50, 25, 10, 5)],
      ['burst', burstPath(50, 50, 25, 14, 8)],
      ['superellipse', superellipsePath(50, 50, 20, 20, 4)],
      ['roundedRect', roundedRectPath(10, 10, 30, 20, 4)],
      ['shield', shieldPath(50, 5, 40, 45)],
      ['chevron', chevronPath(5, 5, 20, 12, 4)],
      ['capsule', capsulePath(50, 50, 30, 8)],
      [
        'smoothClosed',
        smoothClosedPath([
          { x: 0, y: 0 },
          { x: 10, y: 4 },
          { x: 20, y: 0 },
        ]),
      ],
    ]
    for (const [name, d] of helpers) {
      expect(d, name).not.toBe('')
      expect(isSafePathData(d), name).toBe(true)
      expect(d.startsWith('M'), name).toBe(true)
      expect(d.trimEnd().endsWith('Z'), name).toBe(true)
      expect(d, name).not.toMatch(/NaN|Infinity/)
    }
  })

  it('builds a regular polygon with the requested number of sides', () => {
    const path = regularPolygonPath(0, 0, 10, 6)
    expect((path.match(/L/g) ?? []).length).toBe(5)
  })

  it('closes a zero-radius rounded rectangle without curves', () => {
    expect(roundedRectPath(0, 0, 10, 10, 0)).not.toContain('C')
  })

  it('reverses the winding of an arc band swept backwards', () => {
    // The band is traced from the inner edge when the sweep decreases, which is what keeps the
    // counters of a gauge or a progress mark filled when the value goes down as well as up.
    const forwards = arcBandPath(50, 50, 30, 20, 6, 0, 140)
    const backwards = arcBandPath(50, 50, 30, 20, 6, 140, 0)
    expect(backwards.startsWith('M')).toBe(true)
    expect(backwards.trimEnd().endsWith('Z')).toBe(true)
    expect(backwards).not.toBe(forwards)
    // Same two radii either way: the reversal is a change of direction, not of shape.
    expect((backwards.match(/C/g) ?? []).length).toBe((forwards.match(/C/g) ?? []).length)
  })

  it('draws a segment in the direction it is given', () => {
    // The bug this guards: handing a horizontal-only capsule a length and a thickness drew vertical
    // rules as horizontal bars, which put a frame's side brackets in the wrong place entirely.
    const horizontal = pathBounds(segmentPath(10, 50, 110, 50, 10))!
    expect(horizontal.maxX - horizontal.minX).toBeCloseTo(100, 1)
    expect(horizontal.maxY - horizontal.minY).toBeCloseTo(10, 1)

    const vertical = pathBounds(segmentPath(50, 10, 50, 110, 10))!
    expect(vertical.maxY - vertical.minY).toBeCloseTo(100, 1)
    expect(vertical.maxX - vertical.minX).toBeCloseTo(10, 1)

    // A diagonal rule is rotated, so its bounding box is wider than its thickness on both axes.
    const diagonal = pathBounds(segmentPath(0, 0, 30, 40, 12))!
    expect(diagonal.maxX - diagonal.minX).toBeGreaterThan(12)
    expect(diagonal.maxY - diagonal.minY).toBeGreaterThan(12)
    expect((diagonal.minX + diagonal.maxX) / 2).toBeCloseTo(15, 1)
    expect((diagonal.minY + diagonal.maxY) / 2).toBeCloseTo(20, 1)
  })

  it('draws a zero-length segment as a dot rather than a sliver', () => {
    const dot = pathBounds(segmentPath(40, 40, 40, 40, 12))!
    expect(dot.maxX - dot.minX).toBeCloseTo(12, 1)
    expect(dot.maxY - dot.minY).toBeCloseTo(12, 1)
  })

  it('handles a degenerate smooth path without throwing', () => {
    expect(() => smoothClosedPath([{ x: 1, y: 1 }])).not.toThrow()
    // One or two points describe no area, so nothing is emitted.
    expect(smoothClosedPath([{ x: 1, y: 1 }])).toBe('')
    expect(
      smoothClosedPath([
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ])
    ).not.toBe('')
  })
})

describe('fitText', () => {
  const font = findFont('orbit-grotesk')!

  it('fits by width when the box is narrow', () => {
    const fitted = fitText(font, 'ABC', 0, 0, 100, 1000)
    expect(fitted.width).toBeLessThanOrEqual(100)
    expect(fitted.height).toBeLessThan(1000)
  })

  it('fits by height when the box is short', () => {
    const fitted = fitText(font, 'ABC', 0, 0, 1000, 50)
    expect(fitted.height).toBeLessThanOrEqual(50)
  })

  it('centres the ink horizontally and vertically', () => {
    // The ink, not the boxes the run is measured by. The advance box is wider than the drawn letters by
    // the outer side bearings and the cap box is taller than they are by however far they fall short of
    // the cap line, so asserting the boxes are centred would be asserting something `fitText` does not
    // promise — and something no reader can see.
    const fitted = fitText(font, 'ACME', 250, 100, 200, 80)
    expect(fitted.left + fitted.ink.offsetX + fitted.ink.width / 2).toBeCloseTo(250)
    expect(fitted.top + fitted.ink.offsetY + fitted.ink.height / 2).toBeCloseTo(140)
  })

  it('never returns a zero or negative scale', () => {
    expect(fitText(font, 'ABC', 0, 0, 0, 0).scale).toBeGreaterThan(0)
  })

  it('reports natural width in font units', () => {
    expect(naturalWidth(font, 'A')).toBe(font.metrics.advance['A'])
    expect(naturalWidth(font, 'AB')).toBe(
      (font.metrics.advance['A'] ?? 0) + (font.metrics.advance['B'] ?? 0)
    )
  })

  it('accounts for tracking', () => {
    expect(naturalWidth(font, 'AB', 50)).toBe(naturalWidth(font, 'AB') + 100)
  })

  it('tolerates an empty run', () => {
    expect(fitText(font, '', 10, 10, 100, 100).width).toBe(0)
  })
})

describe('capHeightForWidth', () => {
  const font = findFont('orbit-grotesk')!

  it('solves for the cap height that fills a target width', () => {
    const height = capHeightForWidth(font, 'ACME', 200)
    expect(height).toBeGreaterThan(0)
    // The answer is only correct if measuring it again reproduces the target width.
    expect(naturalWidth(font, 'ACME') * (height / font.metrics.capHeight)).toBeCloseTo(200)
  })

  it('scales linearly with the target width', () => {
    expect(capHeightForWidth(font, 'ACME', 400)).toBeCloseTo(
      capHeightForWidth(font, 'ACME', 200) * 2
    )
  })

  it('gives a longer run a smaller cap height for the same width', () => {
    // Same box, more letters: each letter has to be smaller. Without this the longest word in a
    // wordmark set would overflow while short names looked correct.
    expect(capHeightForWidth(font, 'ACMEWIDE', 200)).toBeLessThan(capHeightForWidth(font, 'A', 200))
  })

  it('returns zero for a run with no measurable width', () => {
    expect(capHeightForWidth(font, '', 200)).toBe(0)
  })
})

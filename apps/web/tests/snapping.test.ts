import { describe, expect, it } from 'vitest'
import { snapDrag, type ScreenBox } from '../src/lib/snapping'

/**
 * Alignment snapping.
 *
 * The snapper is deliberately a pure function of screen-space rectangles, because the interesting
 * failures are not visual: an off-by-one in the threshold makes a drag feel like it sticks, and a
 * tie-break that depends on object order makes the same gesture land in two places on two machines.
 */

/** A box from its left/top and its size. */
function box(left: number, top: number, width: number, height: number): ScreenBox {
  return { left, top, right: left + width, bottom: top + height }
}

const CANVAS = box(0, 0, 500, 500)
const THRESHOLD = 6

describe('snapDrag', () => {
  it('leaves a drag alone when no line is near', () => {
    const result = snapDrag({
      moving: box(200, 200, 100, 100),
      targets: [],
      canvas: CANVAS,
      deltaX: 30,
      deltaY: 30,
      threshold: THRESHOLD,
    })
    expect(result).toEqual({ deltaX: 30, deltaY: 30, guideX: null, guideY: null })
  })

  it('pulls the centre onto the canvas centre', () => {
    // A 100px box at x=200 is centred at 250, exactly the canvas centre; three pixels of travel puts the
    // centre at 253 and the line three pixels away, inside the six-pixel capture distance.
    const result = snapDrag({
      moving: box(200, 200, 100, 100),
      targets: [],
      canvas: CANVAS,
      deltaX: 3,
      deltaY: -2,
      threshold: THRESHOLD,
    })
    expect(result.deltaX).toBe(0)
    expect(result.deltaY).toBe(0)
    expect(result.guideX).toBe(250)
    expect(result.guideY).toBe(250)
  })

  it('snaps an edge to a sibling edge', () => {
    const sibling = box(300, 0, 200, 100)
    const result = snapDrag({
      moving: box(100, 120, 100, 100),
      targets: [sibling],
      canvas: box(0, 0, 600, 600),
      deltaX: 103,
      deltaY: 40,
      threshold: THRESHOLD,
    })
    // The moving box's right edge travels to 303, three pixels past the sibling's left edge at 300.
    expect(result.deltaX).toBe(100)
    expect(result.guideX).toBe(300)
    // Vertically it is 40px from the nearest line, so the drag keeps its vertical travel.
    expect(result.deltaY).toBe(40)
    expect(result.guideY).toBeNull()
  })

  it('captures at exactly the threshold distance', () => {
    const result = snapDrag({
      moving: box(0, 0, 100, 100),
      targets: [],
      canvas: CANVAS,
      deltaX: 144,
      deltaY: 144,
      threshold: THRESHOLD,
    })
    // Right edge 100 + 144 = 244, six pixels from the canvas centre at 250.
    expect(result.deltaX).toBe(150)
    expect(result.guideX).toBe(250)
    expect(result.deltaY).toBe(150)
    expect(result.guideY).toBe(250)
  })

  it('does not capture just beyond the threshold', () => {
    const result = snapDrag({
      moving: box(0, 0, 100, 100),
      targets: [],
      canvas: CANVAS,
      deltaX: 143.5,
      deltaY: 143.5,
      threshold: THRESHOLD,
    })
    expect(result.deltaX).toBe(143.5)
    expect(result.deltaY).toBe(143.5)
    expect(result.guideX).toBeNull()
    expect(result.guideY).toBeNull()
  })

  it('prefers the nearest line when several are in range', () => {
    // Canvas centre is 250 and the sibling's left edge is 248. The moving right edge is at 245 after the
    // proposed travel: the sibling is three pixels away and the canvas centre five, so the sibling wins
    // even though the canvas is checked first.
    const sibling = box(248, 300, 100, 100)
    const result = snapDrag({
      moving: box(0, 0, 100, 100),
      targets: [sibling],
      canvas: CANVAS,
      deltaX: 145,
      deltaY: 40,
      threshold: THRESHOLD,
    })
    expect(result.guideX).toBe(248)
    expect(result.deltaX).toBe(148)
  })

  it('handles a canvas that does not start at the origin', () => {
    const result = snapDrag({
      moving: box(200, 200, 100, 100),
      targets: [],
      canvas: box(50, 50, 400, 400),
      deltaX: 3,
      deltaY: 3,
      threshold: THRESHOLD,
    })
    // Canvas centre is (250, 250): the moving centre starts there and three pixels of travel is captured.
    expect(result.deltaX).toBe(0)
    expect(result.deltaY).toBe(0)
    expect(result.guideX).toBe(250)
    expect(result.guideY).toBe(250)
  })
})

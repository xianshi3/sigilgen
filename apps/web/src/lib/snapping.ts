/**
 * Alignment snapping for the stage.
 *
 * Everything is computed in screen pixels: the dragged part's rectangle already includes its existing
 * rotation and scale, the other parts' rectangles come from the live DOM, and the six-pixel threshold
 * therefore feels the same at every zoom level. The caller converts the accepted delta back to SVG user
 * units.
 */

/** A box in screen pixels. */
export interface ScreenBox {
  left: number
  top: number
  right: number
  bottom: number
}

/** What to snap. */
export interface SnapRequest {
  /** The dragged part's rectangle at the start of the gesture. */
  moving: ScreenBox
  /** Every other visible part's current rectangle. */
  targets: readonly ScreenBox[]
  /** The sheet's rectangle; its centre and edges are alignment lines. */
  canvas: ScreenBox
  /** Proposed pointer travel in screen pixels. */
  deltaX: number
  deltaY: number
  /** Maximum distance, in screen pixels, at which a line captures the part. */
  threshold: number
}

/** The accepted travel and the guide line that captured each axis, if any. */
export interface SnapResult {
  deltaX: number
  deltaY: number
  guideX: number | null
  guideY: number | null
}

/**
 * The left, centre and right lines of a box.
 *
 * @param box - The box.
 * @returns Three x positions.
 */
function xLines(box: ScreenBox): number[] {
  return [box.left, (box.left + box.right) / 2, box.right]
}

/**
 * The top, middle and bottom lines of a box.
 *
 * @param box - The box.
 * @returns Three y positions.
 */
function yLines(box: ScreenBox): number[] {
  return [box.top, (box.top + box.bottom) / 2, box.bottom]
}

/**
 * Finds the nearest line that can capture one axis.
 *
 * The moving box's left, centre and right (or top, middle and bottom) all get a vote. The closest
 * target wins; ties keep the first target, and the target order is the caller's DOM order, so the
 * outcome is deterministic.
 *
 * @param candidates - The moving edges/centre after the proposed travel.
 * @param targets - Alignment lines.
 * @param threshold - Maximum capture distance.
 * @returns The correction and the captured line, or `null` deltas when nothing is close.
 */
function nearest(
  candidates: readonly number[],
  targets: readonly number[],
  threshold: number
): { delta: number; guide: number | null } {
  let bestDistance = threshold
  let best: { delta: number; guide: number } | null = null
  for (const candidate of candidates) {
    for (const target of targets) {
      const distance = Math.abs(target - candidate)
      if (distance <= bestDistance && (best === null || distance < bestDistance)) {
        bestDistance = distance
        best = { delta: target - candidate, guide: target }
      }
    }
  }
  return best ?? { delta: 0, guide: null }
}

/**
 * Snaps a dragged box to the nearest canvas or sibling alignment lines.
 *
 * @param request - The moving box, sibling boxes, canvas, proposed travel and threshold.
 * @returns The corrected travel and the guide positions, one per axis.
 */
export function snapDrag(request: SnapRequest): SnapResult {
  const xTargets = xLines(request.canvas)
  const yTargets = yLines(request.canvas)
  for (const target of request.targets) {
    xTargets.push(...xLines(target))
    yTargets.push(...yLines(target))
  }

  const x = nearest(
    xLines(request.moving).map(value => value + request.deltaX),
    xTargets,
    request.threshold
  )
  const y = nearest(
    yLines(request.moving).map(value => value + request.deltaY),
    yTargets,
    request.threshold
  )

  return {
    deltaX: request.deltaX + x.delta,
    deltaY: request.deltaY + y.delta,
    guideX: x.guide,
    guideY: y.guide,
  }
}

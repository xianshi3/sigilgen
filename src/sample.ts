/**
 * Sampling a filled outline against a grid.
 *
 * The letterform engines that draw ink rather than paths — halftone dots, scanline bars — need to know
 * which parts of an outline are inside. SVG fills under `nonzero`, so the answer is a winding number,
 * not a point-in-polygon test: a contour wound against its parent is a hole, and anything that treats
 * the two as nested-but-filled produces a mark with its counters painted in.
 *
 * The flattening and the winding rule live here rather than in `path.ts`: `path.ts` owns parsing,
 * bounds and transforms, and nothing in the library needs a scanline until an engine asks for one.
 */

import { parsePath, pathBounds, type Bounds } from './path'

/** A straight edge of a flattened outline. */
export interface Edge {
  /** Start x. */
  x1: number
  /** Start y. */
  y1: number
  /** End x. */
  x2: number
  /** End y. */
  y2: number
}

/** Cubic curves are split into this many line segments. */
const CURVE_STEPS = 16

/**
 * Flattens a path into straight edges.
 *
 * `M`, `L` and `Z` carry over directly; `C` is sampled at {@link CURVE_STEPS} equal steps in t, which is
 * uniform in parameter rather than arc length — irrelevant for a winding test, where only the sign of
 * each crossing matters.
 *
 * @param d - Path data, as the generator emits it (absolute commands only).
 * @returns The edges of every sub-path.
 */
export function flatten(d: string): Edge[] {
  const edges: Edge[] = []
  let cx = 0
  let cy = 0
  let startX = 0
  let startY = 0
  for (const segment of parsePath(d)) {
    if (segment.cmd === 'M') {
      cx = segment.values[0] as number
      cy = segment.values[1] as number
      startX = cx
      startY = cy
      continue
    }
    if (segment.cmd === 'Z') {
      if (cx !== startX || cy !== startY) {
        edges.push({ x1: cx, y1: cy, x2: startX, y2: startY })
      }
      cx = startX
      cy = startY
      continue
    }
    if (segment.cmd === 'L') {
      const ex = segment.values[0] as number
      const ey = segment.values[1] as number
      edges.push({ x1: cx, y1: cy, x2: ex, y2: ey })
      cx = ex
      cy = ey
      continue
    }
    if (segment.cmd !== 'C') {
      continue
    }
    const [x1 = cx, y1 = cy, x2 = cx, y2 = cy, ex = cx, ey = cy] = segment.values
    let fromX = cx
    let fromY = cy
    for (let step = 1; step <= CURVE_STEPS; step++) {
      const t = step / CURVE_STEPS
      const u = 1 - t
      const toX = u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * ex
      const toY = u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ey
      edges.push({ x1: fromX, y1: fromY, x2: toX, y2: toY })
      fromX = toX
      fromY = toY
    }
    cx = ex
    cy = ey
  }
  return edges
}

/**
 * Winding contribution of one edge to a query point.
 *
 * @param edge - The edge.
 * @param px - Query x.
 * @param py - Query y.
 * @returns `-1`, `0` or `1`.
 */
function crossing(edge: Edge, px: number, py: number): number {
  const { x1, y1, x2, y2 } = edge
  if (y1 > py === y2 > py) {
    return 0
  }
  const t = (py - y1) / (y2 - y1)
  if (px >= x1 + t * (x2 - x1)) {
    return 0
  }
  // The edge runs downwards on screen when `y` grows, which is the opposite of SVG's y-down axes, so
  // an upward edge counts `-1` and a downward edge `+1`.
  return y2 > y1 ? 1 : -1
}

/**
 * The winding number of a point against the outline.
 *
 * @param edges - The flattened outline.
 * @param px - Query x.
 * @param py - Query y.
 * @returns The winding number; nonzero means painted under `nonzero`.
 */
export function windingNumber(edges: readonly Edge[], px: number, py: number): number {
  let winding = 0
  for (const edge of edges) {
    winding += crossing(edge, px, py)
  }
  return winding
}

/**
 * Whether a point is painted, decided the way the renderer decides it.
 *
 * @param edges - The flattened outline.
 * @param px - Query x.
 * @param py - Query y.
 * @returns `true` when the point is painted.
 */
export function isPainted(edges: readonly Edge[], px: number, py: number): boolean {
  return windingNumber(edges, px, py) !== 0
}

/** The runs of a scanline that fall inside the outline. */
export type Interval = readonly [number, number]

/**
 * The x-intervals of a scanline that lie inside the outline, in order.
 *
 * Walks the crossings of the scanline with every edge and pairs them, carrying the winding number:
 * an interval opens when the running total leaves zero and closes when it returns. Exact, unlike a
 * fixed-step point sampling — a curve end is cut where the curve actually is, which is what keeps the
 * bars honest at the tips.
 *
 * @param edges - The flattened outline.
 * @param y - The scanline's y.
 * @returns The inside intervals, ascending in x.
 */
export function scanIntervals(edges: readonly Edge[], y: number): Interval[] {
  const crossings: { x: number; winding: number }[] = []
  for (const edge of edges) {
    if (edge.y1 > y === edge.y2 > y) {
      continue
    }
    const t = (y - edge.y1) / (edge.y2 - edge.y1)
    crossings.push({
      x: edge.x1 + t * (edge.x2 - edge.x1),
      winding: edge.y2 > edge.y1 ? 1 : -1,
    })
  }
  crossings.sort((a, b) => a.x - b.x)
  const intervals: Interval[] = []
  let winding = 0
  let start: number | null = null
  for (const crossingPoint of crossings) {
    const before = winding
    winding += crossingPoint.winding
    if (before === 0 && winding !== 0) {
      start = crossingPoint.x
      continue
    }
    if (before !== 0 && winding === 0 && start !== null) {
      intervals.push([start, crossingPoint.x])
      start = null
    }
  }
  return intervals
}

/**
 * A rectangular field of booleans over an outline.
 *
 * Rows are indexed top to bottom as the file's `y` grows; the grid spans the outline's own bounds, so
 * it stretches to whatever aspect the letter has and the cells are never lopsided.
 */
export interface GlyphSample {
  /** Columns in the grid. */
  cols: number
  /** Rows in the grid. */
  rows: number
  /** Filled cells, row-major; `true` where the cell centre is inside the outline. */
  cells: boolean[][]
  /** The outline's bounds, which the caller needs to place the dots. */
  bounds: Bounds
}

/**
 * Samples an outline into a boolean grid.
 *
 * @param d - Path data.
 * @param rows - How many rows to sample; columns follow the outline's aspect.
 * @returns The grid, or `null` when the outline encloses nothing.
 */
export function sampleGlyph(d: string, rows: number): GlyphSample | null {
  const bounds = pathBounds(d)
  if (bounds === null) {
    return null
  }
  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY
  if (width <= 0 || height <= 0) {
    return null
  }
  const cols = Math.max(3, Math.round((rows * width) / height))
  const edges = flatten(d)
  const cells: boolean[][] = []
  for (let row = 0; row < rows; row++) {
    const y = bounds.minY + ((row + 0.5) / rows) * height
    const line: boolean[] = []
    for (let col = 0; col < cols; col++) {
      const x = bounds.minX + ((col + 0.5) / cols) * width
      line.push(isPainted(edges, x, y))
    }
    cells.push(line)
  }
  if (!cells.some(line => line.some(Boolean))) {
    // A line, a degenerate outline, or an empty glyph: nothing to draw a screen around.
    return null
  }
  return { cols, rows, cells, bounds }
}

/**
 * How many filled neighbours a cell has, capped by the grid's edges.
 *
 * @param cells - The grid.
 * @param row - The cell's row.
 * @param col - The cell's column.
 * @returns The count of orthogonal and diagonal neighbours that are filled, `0`–`8`.
 */
export function neighbourCount(cells: readonly boolean[][], row: number, col: number): number {
  let count = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) {
        continue
      }
      const neighbourRow = cells[row + dy]
      if (neighbourRow === undefined) {
        continue
      }
      if (neighbourRow[col + dx] === true) {
        count += 1
      }
    }
  }
  return count
}

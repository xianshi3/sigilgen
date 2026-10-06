/**
 * Flat geometric primitives shared by the engines.
 *
 * Every helper returns SVG path data built from `M`, `L`, `C` and `Z` only. No gradients, no
 * filters, no masks, no `A` commands — see `src/path.ts` for why arcs are avoided.
 */

import { fmt } from './format'
import { arcPath } from './path'

/** A point in user units. */
export interface Point {
  /** Horizontal position. */
  x: number
  /** Vertical position. */
  y: number
}

/**
 * Converts polar coordinates to a point. Angles are degrees, clockwise on screen.
 *
 * @param cx - Centre x.
 * @param cy - Centre y.
 * @param radius - Distance from the centre.
 * @param degrees - Angle, clockwise from the positive x axis.
 * @returns The corresponding point.
 */
export function polar(cx: number, cy: number, radius: number, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) }
}

/**
 * Closes a path with an explicit `Z`.
 *
 * @param parts - Path fragments.
 * @returns The joined path data.
 */
function join(parts: string[]): string {
  return parts.filter(Boolean).join(' ')
}

/**
 * Builds a closed polygon from a list of points.
 *
 * @param points - Vertices in order.
 * @returns Path data.
 */
export function polygonPath(points: readonly Point[]): string {
  if (points.length < 2) {
    return ''
  }
  const body = points.map(
    (point, index) => `${index === 0 ? 'M' : 'L'} ${fmt(point.x)} ${fmt(point.y)}`
  )
  return join([...body, 'Z'])
}

/**
 * Builds a regular polygon.
 *
 * @param cx - Centre x.
 * @param cy - Centre y.
 * @param radius - Circumradius.
 * @param sides - Number of sides, at least 3.
 * @param rotation - Rotation in degrees; `0` puts a vertex at the top.
 * @returns Path data.
 */
export function regularPolygonPath(
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  rotation = -90
): string {
  const count = Math.max(3, Math.round(sides))
  const points: Point[] = []
  for (let index = 0; index < count; index++) {
    points.push(polar(cx, cy, radius, rotation + (360 / count) * index))
  }
  return polygonPath(points)
}

/**
 * Builds a star with alternating outer and inner radii.
 *
 * @param cx - Centre x.
 * @param cy - Centre y.
 * @param outer - Outer radius.
 * @param inner - Inner radius.
 * @param points - Number of outer points.
 * @param rotation - Rotation in degrees.
 * @returns Path data.
 */
export function starPath(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  points: number,
  rotation = -90
): string {
  const count = Math.max(3, Math.round(points))
  const vertices: Point[] = []
  for (let index = 0; index < count * 2; index++) {
    const radius = index % 2 === 0 ? outer : inner
    vertices.push(polar(cx, cy, radius, rotation + (180 / count) * index))
  }
  return polygonPath(vertices)
}

/**
 * Builds a ray burst: alternating long and short radii, like a sun or a spark.
 *
 * @param cx - Centre x.
 * @param cy - Centre y.
 * @param outer - Outer radius.
 * @param inner - Inner radius.
 * @param rays - Number of rays.
 * @param rotation - Rotation in degrees.
 * @returns Path data.
 */
export function burstPath(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  rays: number,
  rotation = -90
): string {
  const count = Math.max(3, Math.round(rays))
  const vertices: Point[] = []
  for (let index = 0; index < count * 2; index++) {
    const radius = index % 2 === 0 ? outer : inner
    vertices.push(polar(cx, cy, radius, rotation + (180 / count) * index))
  }
  return polygonPath(vertices)
}

/**
 * Builds a filled disc.
 *
 * @param cx - Centre x.
 * @param cy - Centre y.
 * @param radius - Radius.
 * @returns Path data.
 */
export function discPath(cx: number, cy: number, radius: number): string {
  const r = Math.max(radius, 0.01)
  return join([`M ${fmt(cx - r)} ${fmt(cy)}`, arcPath(cx, cy, r, r, 180, 540), 'Z'])
}

/**
 * Builds a closed elliptical outline.
 *
 * @param cx - Centre x.
 * @param cy - Centre y.
 * @param rx - Horizontal radius.
 * @param ry - Vertical radius.
 * @returns Path data.
 */
export function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  const x = Math.max(rx, 0.01)
  const y = Math.max(ry, 0.01)
  return join([`M ${fmt(cx - x)} ${fmt(cy)}`, arcPath(cx, cy, x, y, 180, 540), 'Z'])
}

/**
 * Builds a ring: an elliptical outline with an elliptical hole.
 *
 * The hole is a separate sub-path wound the opposite way, so it reads as a hole under
 * `fill-rule: nonzero` without needing an attribute.
 *
 * @param cx - Centre x.
 * @param cy - Centre y.
 * @param rx - Outer horizontal radius.
 * @param ry - Outer vertical radius.
 * @param weight - Ring thickness.
 * @returns Path data.
 */
export function ringPath(cx: number, cy: number, rx: number, ry: number, weight: number): string {
  const outerRx = Math.max(rx, 0.01)
  const outerRy = Math.max(ry, 0.01)
  const innerRx = Math.max(outerRx - weight, 0.01)
  const innerRy = Math.max(outerRy - weight, 0.01)
  return join([
    `M ${fmt(cx - outerRx)} ${fmt(cy)}`,
    arcPath(cx, cy, outerRx, outerRy, 180, 540),
    'Z',
    `M ${fmt(cx - innerRx)} ${fmt(cy)}`,
    arcPath(cx, cy, innerRx, innerRy, 180, -180),
    'Z',
  ])
}

/**
 * Builds an annular sector, i.e. the stroke of an elliptical arc.
 *
 * The contour is always wound positively, whichever way the arc runs, so overlapping bands merge
 * instead of cancelling.
 *
 * @param cx - Ellipse centre x.
 * @param cy - Ellipse centre y.
 * @param rx - Horizontal radius of the outer edge.
 * @param ry - Vertical radius of the outer edge.
 * @param weight - Thickness.
 * @param from - Start angle in degrees, clockwise on screen.
 * @param to - End angle in degrees, clockwise on screen.
 * @returns Path data.
 */
export function arcBandPath(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  weight: number,
  from: number,
  to: number
): string {
  const outerRx = Math.max(rx, 0.01)
  const outerRy = Math.max(ry, 0.01)
  const innerRx = Math.max(outerRx - weight, 0.01)
  const innerRy = Math.max(outerRy - weight, 0.01)

  const outerAt = (deg: number): Point => {
    const rad = (deg * Math.PI) / 180
    return { x: cx + outerRx * Math.cos(rad), y: cy + outerRy * Math.sin(rad) }
  }
  const innerAt = (deg: number): Point => {
    const rad = (deg * Math.PI) / 180
    return { x: cx + innerRx * Math.cos(rad), y: cy + innerRy * Math.sin(rad) }
  }

  const start = outerAt(from)
  const innerEnd = innerAt(to)

  if (to - from < 0) {
    return join([
      `M ${fmt(innerEnd.x)} ${fmt(innerEnd.y)}`,
      arcPath(cx, cy, innerRx, innerRy, to, from),
      `L ${fmt(start.x)} ${fmt(start.y)}`,
      arcPath(cx, cy, outerRx, outerRy, from, to),
      'Z',
    ])
  }
  return join([
    `M ${fmt(start.x)} ${fmt(start.y)}`,
    arcPath(cx, cy, outerRx, outerRy, from, to),
    `L ${fmt(innerEnd.x)} ${fmt(innerEnd.y)}`,
    arcPath(cx, cy, innerRx, innerRy, to, from),
    'Z',
  ])
}

/**
 * Builds a superellipse, the "squircle" shape used for softer container marks.
 *
 * @param cx - Centre x.
 * @param cy - Centre y.
 * @param rx - Horizontal radius.
 * @param ry - Vertical radius.
 * @param exponent - Shape exponent; `2` is an ellipse, `4`–`8` progressively squarer.
 * @param steps - Number of sampled points; higher is smoother.
 * @returns Path data.
 */
export function superellipsePath(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  exponent: number,
  steps = 64
): string {
  const n = Math.max(2, exponent)
  const count = Math.max(24, Math.round(steps))
  const points: Point[] = []
  for (let index = 0; index < count; index++) {
    const t = (2 * Math.PI * index) / count
    const cos = Math.cos(t)
    const sin = Math.sin(t)
    points.push({
      x: cx + rx * Math.sign(cos) * Math.abs(cos) ** (2 / n),
      y: cy + ry * Math.sign(sin) * Math.abs(sin) ** (2 / n),
    })
  }
  return polygonPath(points)
}

/**
 * Builds a rectangle with rounded corners.
 *
 * @param x - Left edge.
 * @param y - Top edge.
 * @param width - Width.
 * @param height - Height.
 * @param radius - Corner radius.
 * @returns Path data.
 */
export function roundedRectPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): string {
  const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2))
  if (r === 0) {
    return join([
      `M ${fmt(x)} ${fmt(y)}`,
      `L ${fmt(x + width)} ${fmt(y)}`,
      `L ${fmt(x + width)} ${fmt(y + height)}`,
      `L ${fmt(x)} ${fmt(y + height)}`,
      'Z',
    ])
  }
  const right = x + width
  const bottom = y + height
  const k = r * 0.5523
  return join([
    `M ${fmt(x + r)} ${fmt(y)}`,
    `L ${fmt(right - r)} ${fmt(y)}`,
    `C ${fmt(right - r + k)} ${fmt(y)} ${fmt(right)} ${fmt(y + r - k)} ${fmt(right)} ${fmt(y + r)}`,
    `L ${fmt(right)} ${fmt(bottom - r)}`,
    `C ${fmt(right)} ${fmt(bottom - r + k)} ${fmt(right - r + k)} ${fmt(bottom)} ${fmt(right - r)} ${fmt(bottom)}`,
    `L ${fmt(x + r)} ${fmt(bottom)}`,
    `C ${fmt(x + r - k)} ${fmt(bottom)} ${fmt(x)} ${fmt(bottom - r + k)} ${fmt(x)} ${fmt(bottom - r)}`,
    `L ${fmt(x)} ${fmt(y + r)}`,
    `C ${fmt(x)} ${fmt(y + r - k)} ${fmt(x + r - k)} ${fmt(y)} ${fmt(x + r)} ${fmt(y)}`,
    'Z',
  ])
}

/**
 * Builds a shield outline: a flat top, straight flanks that taper into a point at the bottom.
 *
 * @param cx - Centre x.
 * @param top - Top edge y.
 * @param width - Overall width.
 * @param height - Overall height.
 * @param shoulder - Fraction of the height where the taper begins, `0`–`1`.
 * @returns Path data.
 */
export function shieldPath(
  cx: number,
  top: number,
  width: number,
  height: number,
  shoulder = 0.45
): string {
  const half = width / 2
  const bottom = top + height
  const breakY = top + height * Math.min(Math.max(shoulder, 0.1), 0.9)
  return join([
    `M ${fmt(cx - half)} ${fmt(top)}`,
    `L ${fmt(cx + half)} ${fmt(top)}`,
    `L ${fmt(cx + half)} ${fmt(breakY)}`,
    `L ${fmt(cx)} ${fmt(bottom)}`,
    `L ${fmt(cx - half)} ${fmt(breakY)}`,
    'Z',
  ])
}

/**
 * Builds a chevron, the mark used by the abstract engine and by wordmark dividers.
 *
 * @param x - Left tip x.
 * @param y - Top edge y.
 * @param width - Overall width.
 * @param height - Overall height.
 * @param thickness - Stroke thickness.
 * @returns Path data.
 */
export function chevronPath(
  x: number,
  y: number,
  width: number,
  height: number,
  thickness: number
): string {
  const t = Math.min(thickness, height)
  return polygonPath([
    { x, y },
    { x: x + width, y },
    { x: x + width - height * 0.6, y: y + height },
    { x: x + width - height * 0.6 - t, y: y + height },
    { x: x + width - t - height * 0.6, y: y + t },
    { x: x + t, y: y + t },
    { x: x + t, y },
  ])
}

/**
 * Builds a horizontal capsule, useful as a divider or a base rule.
 *
 * @param cx - Centre x.
 * @param cy - Centre y.
 * @param width - Overall width.
 * @param height - Overall height.
 * @returns Path data.
 */
export function capsulePath(cx: number, cy: number, width: number, height: number): string {
  return roundedRectPath(cx - width / 2, cy - height / 2, width, height, height / 2)
}

/**
 * Builds a rule running between two arbitrary points.
 *
 * `capsulePath` can only draw a horizontal one, which is enough for a divider under a wordmark but not
 * for the sides of a frame. Handing `accentRule` a length and a thickness and hoping the caller wanted
 * a particular *direction* is how a vertical bracket ends up drawn as a horizontal bar in the wrong
 * place, so the direction is taken from the endpoints instead.
 *
 * The ends are square rather than round: a bracket is a cut shape, and rounding it would need a
 * rotation that flat output cannot express with a `transform` attribute.
 *
 * @param x1 - Start x.
 * @param y1 - Start y.
 * @param x2 - End x.
 * @param y2 - End y.
 * @param thickness - Stroke thickness.
 * @returns Path data.
 */
export function segmentPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  thickness: number
): string {
  const dx = x2 - x1
  const dy = y2 - y1
  const length = Math.hypot(dx, dy)
  if (length === 0) {
    // A zero-length rule is a dot, not a sliver.
    return discPath(x1, y1, thickness / 2)
  }
  const cos = dx / length
  const sin = dy / length
  const half = thickness / 2
  const local: Point[] = [
    { x: 0, y: -half },
    { x: length, y: -half },
    { x: length, y: half },
    { x: 0, y: half },
  ]
  return polygonPath(
    local.map(point => ({
      x: x1 + point.x * cos - point.y * sin,
      y: y1 + point.x * sin + point.y * cos,
    }))
  )
}

/**
 * Converts points to a smooth closed curve using Catmull-Rom to cubic Bézier conversion.
 *
 * Used by the abstract engine's wave mode.
 *
 * @param points - Sample points around the loop.
 * @param tension - `0` keeps straight lines, `1` gives the full Catmull-Rom curve.
 * @returns Path data.
 */
export function smoothClosedPath(points: readonly Point[], tension = 1): string {
  const count = points.length
  if (count < 3) {
    return polygonPath(points)
  }
  const parts: string[] = [`M ${fmt((points[0] as Point).x)} ${fmt((points[0] as Point).y)}`]
  for (let index = 0; index < count; index++) {
    const p0 = points[(index - 1 + count) % count] as Point
    const p1 = points[index] as Point
    const p2 = points[(index + 1) % count] as Point
    const p3 = points[(index + 2) % count] as Point
    const c1x = p1.x + ((p2.x - p0.x) / 6) * tension
    const c1y = p1.y + ((p2.y - p0.y) / 6) * tension
    const c2x = p2.x - ((p3.x - p1.x) / 6) * tension
    const c2y = p2.y - ((p3.y - p1.y) / 6) * tension
    parts.push(`C ${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(p2.x)} ${fmt(p2.y)}`)
  }
  parts.push('Z')
  return join(parts)
}

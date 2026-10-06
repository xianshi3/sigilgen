/**
 * A small, allocation-light SVG path toolkit.
 *
 * Sigilgen composes logos by concatenating path data. To place a glyph or an icon at a position and
 * scale, path data has to be rewritten rather than wrapped in a `<g transform>`: baking the
 * transform in keeps the emitted SVG flat and keeps every element independently positionable, which
 * matters for downstream tooling that re-flows individual elements.
 *
 * ## Why paths are normalised to `M`/`L`/`C`/`Z`
 *
 * The parser accepts the full absolute command set (`M`, `L`, `C`, `Q`, `A`, `Z`) plus `H`/`V`, and
 * immediately rewrites everything to absolute `M`/`L`/`C`/`Z`. Quadratics become cubics and
 * elliptical arcs become runs of cubics, because an arc's endpoint is only well defined relative to
 * its start point — and a 180° arc through diametrically opposite points is ambiguous enough that
 * renderers disagree about the result. Cubics have no such ambiguity.
 */

import { fmt } from './format'

/** One parsed path segment. */
interface Segment {
  /** Absolute command letter. */
  cmd: 'M' | 'L' | 'C' | 'Z'
  /** Coordinate triples: `[x, y]`, `[x1, y1, x2, y2, x, y]`, or `[]`. */
  values: number[]
}

/** A coordinate pair, used while reflecting shorthand curve control points. */
interface Point {
  /** Horizontal position. */
  x: number
  /** Vertical position. */
  y: number
}

/** Number of coordinate pairs each command consumes. */
const ARITY: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
}

/** Magic constant for approximating a quarter ellipse with a cubic Bézier. */
const KAPPA = 0.5522847498307936

/**
 * Splits path data into commands and numbers.
 *
 * Command letters keep their original case: upper case means absolute, lower case means relative, so
 * uppercasing here would silently change the meaning of every relative command.
 *
 * @param d - Path data.
 * @returns A flat list of `string` commands and `number` values.
 * @throws {Error} When the data contains an unsupported construct.
 */
function tokenize(d: string): (string | number)[] {
  const tokens: (string | number)[] = []
  let index = 0
  while (index < d.length) {
    const char = d[index] as string
    if (char === ' ' || char === ',' || char === '\n' || char === '\r' || char === '\t') {
      index++
      continue
    }
    if (/[A-Za-z]/.test(char)) {
      tokens.push(char)
      index++
      continue
    }
    let cursor = index
    if (d[cursor] === '-' || d[cursor] === '+') {
      cursor++
    }
    while (cursor < d.length && d[cursor] !== undefined && /[\d]/.test(d[cursor] as string)) {
      cursor++
    }
    if (d[cursor] === '.') {
      cursor++
      while (cursor < d.length && d[cursor] !== undefined && /[\d]/.test(d[cursor] as string)) {
        cursor++
      }
    }
    if (cursor === index) {
      throw new Error(`invalid path data near "${d.slice(index, index + 12)}"`)
    }
    const value = Number(d.slice(index, cursor))
    if (!Number.isFinite(value)) {
      throw new Error(`invalid number in path data near "${d.slice(index, cursor)}"`)
    }
    tokens.push(value)
    index = cursor
  }
  return tokens
}

/**
 * Converts a quadratic segment to an equivalent cubic.
 *
 * @param x1 - Start x.
 * @param y1 - Start y.
 * @param qx - Quadratic control x.
 * @param qy - Quadratic control y.
 * @param x - End x.
 * @param y - End y.
 * @returns Six cubic control coordinates.
 */
function quadToCubic(
  x1: number,
  y1: number,
  qx: number,
  qy: number,
  x: number,
  y: number
): number[] {
  return [
    x1 + (2 / 3) * (qx - x1),
    y1 + (2 / 3) * (qy - y1),
    x + (2 / 3) * (qx - x),
    y + (2 / 3) * (qy - y),
    x,
    y,
  ]
}

/**
 * Converts an elliptical arc to a run of cubic segments, splitting into at most 90° pieces.
 *
 * @param x1 - Start x.
 * @param y1 - Start y.
 * @param rx - Horizontal radius.
 * @param ry - Vertical radius.
 * @param rotation - X-axis rotation in degrees.
 * @param largeArc - Large-arc flag.
 * @param sweep - Sweep flag, where `1` runs clockwise on screen.
 * @param x - End x.
 * @param y - End y.
 * @returns A flat list of cubic segments, each six numbers long.
 * @throws {Error} When the arc collapses to a point.
 */
function arcToCubics(
  x1: number,
  y1: number,
  rxIn: number,
  ryIn: number,
  rotation: number,
  largeArcIn: number,
  sweepIn: number,
  x: number,
  y: number
): number[] {
  let rx = Math.abs(rxIn)
  let ry = Math.abs(ryIn)
  if (rx === 0 || ry === 0 || (x1 === x && y1 === y)) {
    return [x1, y1, x, y, x, y]
  }

  const largeArc = largeArcIn === 1
  const sweep = sweepIn === 1
  const phi = (rotation * Math.PI) / 180
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)

  const dx2 = (x1 - x) / 2
  const dy2 = (y1 - y) / 2
  const x1p = cosPhi * dx2 + sinPhi * dy2
  const y1p = -sinPhi * dx2 + cosPhi * dy2

  // Scale the radii up when they are too small to span the chord (SVG 1.1 appendix F.6.6).
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lambda > 1) {
    const scale = Math.sqrt(lambda)
    rx *= scale
    ry *= scale
  }

  const sign = largeArc === sweep ? -1 : 1
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  if (denominator === 0) {
    return [x1, y1, x, y, x, y]
  }
  // Centre offset, per SVG 1.1 appendix F.6.5 step 3: the scaled radii product over the chord term,
  // minus one. The sign flips when the large-arc and sweep flags agree, which is what selects between
  // the two candidate centres.
  const magnitude = (rx * rx * ry * ry) / denominator - 1
  const coefficient = sign * Math.sqrt(Math.max(magnitude, 0))
  const cxp = coefficient * ((rx * y1p) / ry)
  const cyp = -coefficient * ((ry * x1p) / rx)
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x) / 2
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y) / 2

  const angle = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy)
    const clamped = Math.min(Math.max(dot / len, -1), 1)
    const base = Math.acos(clamped)
    return ux * vy - uy * vx < 0 ? -base : base
  }

  const ux = (x1p - cxp) / rx
  const uy = (y1p - cyp) / ry
  const vx = (-x1p - cxp) / rx
  const vy = (-y1p - cyp) / ry
  const startAngle = angle(1, 0, ux, uy)
  let delta = angle(ux, uy, vx, vy)
  if (!sweep && delta > 0) {
    delta -= 2 * Math.PI
  } else if (sweep && delta < 0) {
    delta += 2 * Math.PI
  }

  const segments = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)))
  const step = delta / segments
  const alpha = (4 / 3) * Math.tan(step / 4)

  const out: number[] = []
  let from = startAngle
  for (let index = 0; index < segments; index++) {
    const to = from + step
    const cosFrom = Math.cos(from)
    const sinFrom = Math.sin(from)
    const cosTo = Math.cos(to)
    const sinTo = Math.sin(to)

    const px = cosPhi * rx * cosFrom - sinPhi * ry * sinFrom + cx
    const py = sinPhi * rx * cosFrom + cosPhi * ry * sinFrom + cy
    const qx = cosPhi * rx * cosTo - sinPhi * ry * sinTo + cx
    const qy = sinPhi * rx * cosTo + cosPhi * ry * sinTo + cy

    const dFromX = -rx * sinFrom
    const dFromY = ry * cosFrom
    const dToX = -rx * sinTo
    const dToY = ry * cosTo

    out.push(
      px + alpha * (cosPhi * dFromX - sinPhi * dFromY),
      py + alpha * (sinPhi * dFromX + cosPhi * dFromY),
      qx - alpha * (cosPhi * dToX - sinPhi * dToY),
      qy - alpha * (sinPhi * dToX + cosPhi * dToY),
      qx,
      qy
    )
    from = to
  }
  return out
}

/**
 * Parses path data into absolute `M`/`L`/`C`/`Z` segments.
 *
 * @param d - Path data using absolute or relative commands.
 * @returns Normalised segments with absolute coordinates.
 * @throws {Error} When the data cannot be parsed.
 */
export function parsePath(d: string): Segment[] {
  const tokens = tokenize(d)
  const segments: Segment[] = []
  let index = 0
  let cx = 0
  let cy = 0
  let startX = 0
  let startY = 0
  let previousCubic: { x: number; y: number } | null = null
  let previousQuad: { x: number; y: number } | null = null

  const push = (cmd: 'M' | 'L' | 'C' | 'Z', values: number[]): void => {
    segments.push({ cmd, values })
  }

  while (index < tokens.length) {
    let letter = tokens[index]
    if (typeof letter === 'number') {
      // A repeated coordinate pair after a moveto is an implicit lineto.
      letter = 'L'
    } else {
      index++
    }
    const command = String(letter)
    const base = command.toUpperCase()
    const arity = ARITY[base]
    if (arity === undefined) {
      throw new Error(`unsupported path command "${command}"`)
    }

    if (command === 'Z' || command === 'z') {
      push('Z', [])
      cx = startX
      cy = startY
      previousCubic = null
      previousQuad = null
      continue
    }

    const numbers: number[] = []
    for (let slot = 0; slot < arity; slot++) {
      const token = tokens[index + slot]
      if (typeof token !== 'number') {
        throw new Error(`command "${command}" is missing a coordinate`)
      }
      numbers.push(token)
    }
    index += arity

    const relative = command !== base
    const ox = relative ? cx : 0
    const oy = relative ? cy : 0

    switch (base) {
      case 'M': {
        cx = (numbers[0] as number) + ox
        cy = (numbers[1] as number) + oy
        startX = cx
        startY = cy
        push('M', [cx, cy])
        previousCubic = null
        previousQuad = null
        break
      }
      case 'L': {
        cx = (numbers[0] as number) + ox
        cy = (numbers[1] as number) + oy
        push('L', [cx, cy])
        previousCubic = null
        previousQuad = null
        break
      }
      case 'H': {
        cx = (numbers[0] as number) + ox
        push('L', [cx, cy])
        previousCubic = null
        previousQuad = null
        break
      }
      case 'V': {
        cy = (numbers[0] as number) + oy
        push('L', [cx, cy])
        previousCubic = null
        previousQuad = null
        break
      }
      case 'C': {
        const c1x = (numbers[0] as number) + ox
        const c1y = (numbers[1] as number) + oy
        const c2x = (numbers[2] as number) + ox
        const c2y = (numbers[3] as number) + oy
        const ex = (numbers[4] as number) + ox
        const ey = (numbers[5] as number) + oy
        push('C', [c1x, c1y, c2x, c2y, ex, ey])
        previousCubic = { x: c2x, y: c2y }
        previousQuad = null
        cx = ex
        cy = ey
        break
      }
      case 'S': {
        const mirror: Point = previousCubic
          ? { x: 2 * cx - previousCubic.x, y: 2 * cy - previousCubic.y }
          : { x: cx, y: cy }
        const c2x = (numbers[0] as number) + ox
        const c2y = (numbers[1] as number) + oy
        const ex = (numbers[2] as number) + ox
        const ey = (numbers[3] as number) + oy
        push('C', [mirror.x, mirror.y, c2x, c2y, ex, ey])
        previousCubic = { x: c2x, y: c2y }
        previousQuad = null
        cx = ex
        cy = ey
        break
      }
      case 'Q': {
        const qx = (numbers[0] as number) + ox
        const qy = (numbers[1] as number) + oy
        const ex = (numbers[2] as number) + ox
        const ey = (numbers[3] as number) + oy
        push('C', quadToCubic(cx, cy, qx, qy, ex, ey))
        previousQuad = { x: qx, y: qy }
        previousCubic = null
        cx = ex
        cy = ey
        break
      }
      case 'T': {
        const mirror: Point = previousQuad
          ? { x: 2 * cx - previousQuad.x, y: 2 * cy - previousQuad.y }
          : { x: cx, y: cy }
        const ex = (numbers[0] as number) + ox
        const ey = (numbers[1] as number) + oy
        push('C', quadToCubic(cx, cy, mirror.x, mirror.y, ex, ey))
        previousQuad = mirror
        previousCubic = null
        cx = ex
        cy = ey
        break
      }
      case 'A': {
        const cubics = arcToCubics(
          cx,
          cy,
          numbers[0] as number,
          numbers[1] as number,
          numbers[2] as number,
          numbers[3] as number,
          numbers[4] as number,
          (numbers[5] as number) + ox,
          (numbers[6] as number) + oy
        )
        for (let slot = 0; slot < cubics.length; slot += 6) {
          const values = cubics.slice(slot, slot + 6) as number[]
          push('C', values)
          previousCubic = { x: values[2] as number, y: values[3] as number }
        }
        previousQuad = null
        cx = cubics[cubics.length - 2] as number
        cy = cubics[cubics.length - 1] as number
        break
      }
      default:
        break
    }
  }

  return segments
}

/**
 * Applies a uniform scale plus translation to path data.
 *
 * The scale is uniform on purpose: a non-uniform scale would need arc radii re-derived per axis,
 * and nothing in the pipeline needs one.
 *
 * @param d - Path data to transform.
 * @param scale - Uniform scale factor.
 * @param translateX - Horizontal translation applied after scaling.
 * @param translateY - Vertical translation applied after scaling.
 * @returns Transformed path data, rounded to {@link PRECISION} decimals.
 * @throws {Error} When the input cannot be parsed.
 */
export function transformPath(
  d: string,
  scale: number,
  translateX: number,
  translateY: number
): string {
  const segments = parsePath(d)
  const parts: string[] = []

  for (const segment of segments) {
    if (segment.cmd === 'Z') {
      parts.push('Z')
      continue
    }
    if (segment.cmd === 'M' || segment.cmd === 'L') {
      const x = (segment.values[0] as number) * scale + translateX
      const y = (segment.values[1] as number) * scale + translateY
      parts.push(`${segment.cmd}${fmt(x)} ${fmt(y)}`)
      continue
    }
    const scaled: number[] = []
    for (let index = 0; index + 1 < segment.values.length; index += 2) {
      scaled.push(
        (segment.values[index] as number) * scale + translateX,
        (segment.values[index + 1] as number) * scale + translateY
      )
    }
    const pairs: string[] = []
    for (let index = 0; index < scaled.length; index += 2) {
      pairs.push(`${fmt(scaled[index] as number)} ${fmt(scaled[index + 1] as number)}`)
    }
    parts.push(`C${pairs.join(' ')}`)
  }

  return parts.join('')
}

/**
 * Reports whether path data uses only characters that can appear in safe path data.
 *
 * This is a safety predicate, not a canonicalisation check: it asks whether the string could be
 * embedded in an attribute without breaking out of it or introducing markup. The canonical form the
 * generator emits is absolute `M`/`L`/`C`/`Z`, but `transformPath` normalises everything, so arcs and
 * shorthand commands are still safe to inspect.
 *
 * @param d - Path data to inspect.
 * @returns `true` when the string contains only path characters.
 */
export function isSafePathData(d: string): boolean {
  return /^[MLCQAZHVSTmlcqazhvst0-9.,\-+eE\s]*$/.test(d)
}

/** An axis-aligned bounding box. */
export interface Bounds {
  /** Leftmost x. */
  minX: number
  /** Topmost y. */
  minY: number
  /** Rightmost x. */
  maxX: number
  /** Bottommost y. */
  maxY: number
}

/**
 * Evaluates one axis of a cubic Bézier at `t`.
 *
 * @param p0 - First control value.
 * @param p1 - Second control value.
 * @param p2 - Third control value.
 * @param p3 - Fourth control value.
 * @param t - Parameter in `[0, 1]`.
 * @returns The interpolated value.
 */
function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
}

/**
 * Finds the parameters in `(0, 1)` where one axis of a cubic Bézier turns around.
 *
 * Solving the derivative for its quadratic roots is what makes the bounding box exact rather than a
 * control-point hull, which for a circle is almost twice the right size.
 *
 * @param p0 - First control value.
 * @param p1 - Second control value.
 * @param p2 - Third control value.
 * @param p3 - Fourth control value.
 * @returns The turning points.
 */
function cubicExtrema(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = 3 * (-p0 + 3 * p1 - 3 * p2 + p3)
  const b = 6 * (p0 - 2 * p1 + p2)
  const c = 3 * (p1 - p0)
  const out: number[] = []

  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) {
      const t = -c / b
      if (t > 0 && t < 1) {
        out.push(t)
      }
    }
    return out
  }

  const discriminant = b * b - 4 * a * c
  if (discriminant < 0) {
    return out
  }
  const root = Math.sqrt(discriminant)
  for (const t of [(-b + root) / (2 * a), (-b - root) / (2 * a)]) {
    if (t > 0 && t < 1) {
      out.push(t)
    }
  }
  return out
}

/**
 * Computes the exact bounding box of path data.
 *
 * Curves are measured by evaluating their turning points, so the result is tight.
 *
 * @param d - Path data.
 * @returns The bounding box, or `null` when the data encloses no area.
 * @throws {Error} When the data cannot be parsed.
 */
export function pathBounds(d: string): Bounds | null {
  const segments = parsePath(d)
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let cx = 0
  let cy = 0

  const include = (x: number, y: number): void => {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  for (const segment of segments) {
    if (segment.cmd === 'Z') {
      continue
    }
    if (segment.cmd === 'M' || segment.cmd === 'L') {
      cx = segment.values[0] as number
      cy = segment.values[1] as number
      include(cx, cy)
      continue
    }
    // `parsePath` emits a cubic as its two control points and its end point; the start point is the
    // current point, which is not repeated in the segment. Reading the values as though the start were
    // included shifted every curve by one control point and reported the wrong box for every path with
    // a curve in it.
    const [c1x, c1y, c2x, c2y, endX, endY] = segment.values
    const x0 = cx
    const y0 = cy
    const x1 = c1x ?? x0
    const y1 = c1y ?? y0
    const x2 = c2x ?? x0
    const y2 = c2y ?? y0
    const x3 = endX ?? x0
    const y3 = endY ?? y0
    include(x0, y0)
    include(x3, y3)
    // A coordinate reaches its extremes at its own turning points, so both axes' turning points have to
    // be evaluated: using only x's would miss the top and bottom of a curve that is steep there.
    for (const t of [...cubicExtrema(x0, x1, x2, x3), ...cubicExtrema(y0, y1, y2, y3)]) {
      include(cubicAt(x0, x1, x2, x3, t), cubicAt(y0, y1, y2, y3, t))
    }
    cx = x3
    cy = y3
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return null
  }
  return { minX, minY, maxX, maxY }
}

/**
 * Builds a cubic Bézier approximation of an elliptical arc.
 *
 * Mirrors the conversion used by the font compiler so that runtime shapes (containers, abstract
 * marks, icon backgrounds) and glyphs curve identically.
 *
 * @param cx - Ellipse centre x.
 * @param cy - Ellipse centre y.
 * @param rx - Horizontal radius.
 * @param ry - Vertical radius.
 * @param from - Start angle in degrees, clockwise on screen.
 * @param to - End angle in degrees, clockwise on screen.
 * @returns A `C`-command fragment; the caller must emit the initial `M`.
 */
export function arcPath(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  from: number,
  to: number
): string {
  let sweep = to - from
  while (sweep < -360) sweep += 360
  while (sweep > 360) sweep -= 360
  const segments = Math.max(1, Math.ceil(Math.abs(sweep) / 90))
  const step = sweep / segments
  // Handle length = (4/3) * tan(angle / 4). `Math.tan` takes radians, `step` is in degrees.
  const alpha = (4 / 3) * Math.tan(((step / 4) * Math.PI) / 180)
  const parts: string[] = []

  for (let index = 0; index < segments; index++) {
    const a0 = ((from + step * index) * Math.PI) / 180
    const a1 = ((from + step * (index + 1)) * Math.PI) / 180
    const x0 = cx + rx * Math.cos(a0)
    const y0 = cy + ry * Math.sin(a0)
    const x1 = cx + rx * Math.cos(a1)
    const y1 = cy + ry * Math.sin(a1)
    const c1x = x0 - alpha * rx * Math.sin(a0)
    const c1y = y0 + alpha * ry * Math.cos(a0)
    const c2x = x1 + alpha * rx * Math.sin(a1)
    const c2y = y1 - alpha * ry * Math.cos(a1)
    parts.push(`C ${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(x1)} ${fmt(y1)}`)
  }
  return parts.join(' ')
}

/**
 * The Bézier approximation constant for a quarter ellipse, exported for shape helpers.
 */
export const QUARTER = KAPPA

import { describe, expect, it } from 'vitest'
import { ICONS } from '../src/brain/index'
import { parsePath, pathBounds } from '../src/path'
import { placeIcon } from '../src/engines/shared'

/**
 * The icon set's geometry contract.
 *
 * The visual pass that redrew several pictograms found two classes of defect that a bounding box cannot
 * see: an icon drawn against a 24-unit grid but placed from a different origin, and a "hole" sub-path
 * wound the same way as its parent, which fills the counter solid. These assertions are the cheap,
 * deterministic half of that review; the contact sheets in the PR are the other half.
 */

interface Point {
  x: number
  y: number
}

/**
 * Flattens path data into one point list per sub-path.
 *
 * Cubics are sampled rather than solved: the sign of a contour is stable under sampling, and a sampled
 * outline is the same operation the renderer performs.
 *
 * @param d - Path data.
 * @returns One point list per closed or unclosed contour.
 */
function contours(d: string): Point[][] {
  const out: Point[][] = []
  let points: Point[] = []
  let x = 0
  let y = 0
  let startX = 0
  let startY = 0

  const finish = (): void => {
    if (points.length > 2) {
      out.push(points)
    }
    points = []
  }

  for (const segment of parsePath(d)) {
    const { values } = segment
    switch (segment.cmd) {
      case 'M': {
        finish()
        x = values[0] ?? 0
        y = values[1] ?? 0
        startX = x
        startY = y
        points = [{ x, y }]
        break
      }
      case 'L': {
        x = values[0] ?? x
        y = values[1] ?? y
        points.push({ x, y })
        break
      }
      case 'C': {
        const x1 = values[0] ?? x
        const y1 = values[1] ?? y
        const x2 = values[2] ?? x
        const y2 = values[3] ?? y
        const x3 = values[4] ?? x
        const y3 = values[5] ?? y
        for (let step = 1; step <= 8; step += 1) {
          const t = step / 8
          const u = 1 - t
          points.push({
            x: u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
            y: u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
          })
        }
        x = x3
        y = y3
        break
      }
      case 'Z': {
        finish()
        x = startX
        y = startY
        points = []
        break
      }
    }
  }
  finish()
  return out
}

/**
 * Signed area of a polygon, by the shoelace formula.
 *
 * @param points - The contour.
 * @returns Positive for one orientation, negative for the other.
 */
function area(points: readonly Point[]): number {
  let twice = 0
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index] as Point
    const b = points[(index + 1) % points.length] as Point
    twice += a.x * b.y - b.x * a.y
  }
  return twice / 2
}

describe('icons', () => {
  it('draws inside its own 24-unit grid', () => {
    for (const icon of ICONS) {
      const bounds = pathBounds(icon.path)
      expect(bounds, icon.key).not.toBeNull()
      expect(bounds?.minX, icon.key).toBeGreaterThanOrEqual(0)
      expect(bounds?.minY, icon.key).toBeGreaterThanOrEqual(0)
      expect(bounds?.maxX, icon.key).toBeLessThanOrEqual(24)
      expect(bounds?.maxY, icon.key).toBeLessThanOrEqual(24)
    }
  })

  it('is centred on its ink when placed in a box', () => {
    for (const icon of ICONS) {
      const d = placeIcon(icon, 0, 0, 100, '#000000').attrs['d'] as string
      const bounds = pathBounds(d)
      expect(bounds, icon.key).not.toBeNull()
      expect((bounds!.minX + bounds!.maxX) / 2, icon.key).toBeCloseTo(50, 1)
      expect((bounds!.minY + bounds!.maxY) / 2, icon.key).toBeCloseTo(50, 1)
    }
  })

  it('keeps the counters of the icons that rely on one open', () => {
    // The icons whose meaning depends on a counter: a keyhole, a rocket window, a road, a receipt's
    // lines, a terminal screen, a cog's hub, a server's bays. The vendored Material Design Icons paths
    // are authored with holes; a regeneration that loses their orientation would fill them solid.
    const withCounters = [
      'shield-lock',
      'rocket',
      'road-arrow',
      'receipt',
      'terminal-window',
      'gear-cog',
      'cloud-server',
    ]
    for (const key of withCounters) {
      const icon = ICONS.find(entry => entry.key === key)
      expect(icon, key).toBeDefined()
      const signs = contours(icon!.path).map(area)
      expect(
        signs.some(sign => sign > 0),
        key
      ).toBe(true)
      expect(
        signs.some(sign => sign < 0),
        key
      ).toBe(true)
    }
  })
})

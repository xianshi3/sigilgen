/**
 * Abstract engine — seed-driven pure geometry, no type.
 *
 * Some brands want a mark that is not a container, an initial or a pictogram: a shape that stands on
 * its own. That is what this engine produces. Five modes cover a wide range of visual languages:
 *
 * | Mode | Reads as |
 * | ---- | -------- |
 * | `orbit` | a body with satellites; systems, orbits, planets |
 * | `venn` | overlapping fields; collaboration, chemistry, data |
 * | `arcs` | nested crescents; motion, signal, layering |
 * | `burst` | radiating spikes; energy, launch, celebration |
 * | `waves` | a smooth ribbon; flow, water, sound |
 *
 * Every parameter is derived from the seed stream, so the same request always yields the same mark and
 * `variations` yields genuinely different ones.
 */

import { path, pick } from './shared'
import { contrastFill } from './monogram'
import { contrastRatio } from '../resolvers/palette-resolver'
import { fmt } from '../format'
import {
  arcBandPath,
  burstPath,
  discPath,
  polar,
  regularPolygonPath,
  ringPath,
  segmentPath,
  smoothClosedPath,
  type Point,
} from '../geometry'
import { pathBounds, transformPath } from '../path'
import type { SeedResolver } from '../seed-resolver'
import type { Engine, EngineInput, PaletteEntry, SVGElement } from '../types'

/** Modes available to the engine. */
export const MODES: readonly string[] = [
  'orbit',
  'venn',
  'arcs',
  'burst',
  'waves',
  'lattice',
  'gridframe',
  'portal',
  'helix',
  'aperture',
  'prism',
  'scatter',
  'meridian',
  'chevrons',
  'stacked',
]

/** Fraction of the canvas the mark occupies. */
const SCALE = 0.66

/** The three fill roles the abstract engine draws from. */
interface FillRoles {
  /** Dominant colour. */
  lead: string
  /** Secondary colour. */
  second: string
  /** Tertiary colour. */
  third: string
}

/**
 * Resolves a fill role to a colour.
 *
 * Roles are named rather than pre-resolved so that the mode tables stay declarative and a typo
 * becomes a type error rather than a `'lead'` string reaching the output.
 *
 * @param role - One of the role names.
 * @param roles - The resolved colours for this concept.
 * @returns The colour to fill with.
 */
function resolveRole(role: (typeof VENN_ROLES)[number], roles: FillRoles): string {
  return roles[role]
}

/** Fill roles used by the venn mode, one per field, so each field keeps its own colour. */
const VENN_ROLES = ['lead', 'second', 'third'] as const

/** Fill roles cycled by the arcs mode, which draws three to four bands. */
const ARC_ROLES = ['lead', 'second', 'third', 'second'] as const

/**
 * The modes that build from the canvas centre outward, and therefore draw inside a centred box.
 *
 * Every mode constructs its geometry around `centre` and `radius`, so it is *nominally* centred. Most of
 * them are not actually centred, because their filled pattern is asymmetric: a lattice whose cells fade
 * along a diagonal, arcs that only sweep one side, a polygon rotated off its own symmetry axis, a
 * satellite arc that starts at a random tilt. The ink then sits to one side of the centre the geometry
 * was built on, which is what "not 整整齐齐" looks like — a mark that is not visibly wrong, only visibly
 * off. Measured, the worst of these sat 69.6 user units off centre on a 512 canvas, about 14% of the
 * width, at the scale where nobody can say why it looks loose.
 *
 * So the ink is measured and the whole composition is translated to centre it, rather than the geometry
 * being nudged until it looks centred by eye.
 */
type CentredMode = (
  size: number,
  seed: SeedResolver,
  colours: [string, string, string]
) => SVGElement[]

/**
 * A square grid of equal cells, filling along a diagonal.
 *
 * The density rule is a diagonal rather than a per-cell coin flip: a scatter of random cells reads as
 * noise at small sizes, whereas a diagonal reads as a gradient of weight and stays legible all the way
 * down to a favicon. Every cell is the same size and the grid is square, so the only thing that can bias
 * the ink is the fill rule, and {@link centreOnInk} deals with that.
 */
const lattice: CentredMode = (size, seed, colours) => {
  const centre = size / 2
  const cells = seed.int(4, 6)
  const cell = (size * 0.72) / cells
  const half = (cells * cell) / 2
  const top = centre - half
  const gap = cell * 0.18
  const cut = seed.range(0.45, 0.62)
  const out: SVGElement[] = []
  for (let row = 0; row < cells; row++) {
    for (let col = 0; col < cells; col++) {
      const diagonal = cells === 1 ? 0 : (col + row) / ((cells - 1) * 2)
      if (diagonal > cut) {
        continue
      }
      const x = top + col * cell + gap / 2
      const y = top + row * cell + gap / 2
      const fill = (row + col) % 3 === 0 ? (colours[1] as string) : (colours[2] as string)
      out.push(path(discPath(x + (cell - gap) / 2, y + (cell - gap) / 2, (cell - gap) / 2), fill))
    }
  }
  return out
}

/**
 * A ring with a cross through it: a coordinate frame.
 *
 * Built from a ring and two segments, which all share the centre by construction, so this mode is
 * exactly centred for every seed and never needs correcting.
 */
const gridframe: CentredMode = (size, seed, colours) => {
  const centre = size / 2
  const r = size * 0.3
  const weight = r * 0.14
  const out: SVGElement[] = [
    path(ringPath(centre, centre, r, r, weight), colours[0] as string),
    path(
      segmentPath(centre, centre - r * 1.28, centre, centre + r * 1.28, weight * 0.7),
      colours[1] as string
    ),
    path(
      segmentPath(centre - r * 1.28, centre, centre + r * 1.28, centre, weight * 0.7),
      colours[2] as string
    ),
  ]
  if (seed.chance(0.5)) {
    out.push(path(discPath(centre, centre, weight * 0.9), colours[1] as string))
  }
  return out
}

/**
 * Concentric arcs sweeping one side of the centre, like a transmitter.
 *
 * The sweep is deliberately one-sided: that asymmetry is what makes it read as a signal rather than as a
 * target, and it is also why this mode needs its ink measured rather than assumed centred.
 */
const portal: CentredMode = (size, seed, colours) => {
  const centre = size / 2
  const r = size * 0.34
  const out: SVGElement[] = []
  const count = seed.int(3, 4)
  const from = seed.range(-180, -140)
  const sweep = seed.range(120, 220)
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1)
    const rr = r * (0.46 + t * 0.54)
    const weight = r * (0.15 - t * 0.06)
    out.push(
      path(
        arcBandPath(centre, centre, rr, rr, weight, from, from + sweep),
        colours[i % 2] as string
      )
    )
  }
  out.push(path(discPath(centre, centre, r * 0.2), colours[2] as string))
  return out
}

/**
 * A ribbon of constant thickness through a polyline, as one closed polygon.
 *
 * Flat output cannot use `stroke`, so a strand has to be filled. Offsetting a polyline's vertices by half
 * the thickness along its normal and joining the two sides gives an even ribbon; chaining capsules
 * instead would leave a scalloped edge wherever the curve turned.
 *
 * @param points - Centreline of the strand.
 * @param thickness - Width of the ribbon.
 * @returns Path data.
 */
function ribbonPath(points: readonly Point[], thickness: number): string {
  const half = thickness / 2
  const left: Point[] = []
  const right: Point[] = []
  for (let i = 0; i < points.length; i++) {
    const previous = points[Math.max(0, i - 1)] as Point
    const next = points[Math.min(points.length - 1, i + 1)] as Point
    const dx = next.x - previous.x
    const dy = next.y - previous.y
    const length = Math.hypot(dx, dy) || 1
    const at = points[i] as Point
    left.push({ x: at.x + (-dy / length) * half, y: at.y + (dx / length) * half })
    right.push({ x: at.x - (-dy / length) * half, y: at.y - (dx / length) * half })
  }
  const ring = [...left, ...right.toReversed()]
  return `${ring.map((p, i) => `${i === 0 ? 'M' : 'L'} ${fmt(p.x)} ${fmt(p.y)}`).join(' ')} Z`
}

/**
 * Two interleaved sine strands joined by rungs: a molecule, or a data channel.
 *
 * The strands are sampled rather than solved, so the ribbon offset and the rung positions both read from
 * the same curve, which is what keeps every rung meeting the strands exactly.
 */
const helix: CentredMode = (size, seed, colours) => {
  const centre = size / 2
  const amp = size * 0.17
  const span = amp * 3.2
  const turns = seed.range(2.2, 3.4)
  const steps = 64
  const out: SVGElement[] = []
  for (let strand = 0; strand < 2; strand++) {
    const points: Point[] = []
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      points.push({
        x: centre + Math.sin(t * Math.PI * 2 * turns + strand * Math.PI) * amp,
        y: centre - span / 2 + t * span,
      })
    }
    out.push(path(ribbonPath(points, size * 0.045), colours[strand] as string))
  }
  const rungs = seed.int(3, 5)
  for (let i = 0; i < rungs; i++) {
    const t = (i + 0.5) / rungs
    const y = centre - span / 2 + t * span
    const phase = t * Math.PI * 2 * turns
    out.push(
      path(
        segmentPath(
          centre + Math.sin(phase) * amp,
          y,
          centre + Math.sin(phase + Math.PI) * amp,
          y,
          size * 0.022
        ),
        colours[2] as string
      )
    )
  }
  return out
}

/**
 * Blades arranged around a centre, like a camera iris.
 *
 * Each blade is a wedge from an inner radius out to the rim, overlapping its neighbours. They all wind
 * the same way, so under `nonzero` the overlaps merge into one solid shape instead of cancelling.
 */
const aperture: CentredMode = (size, seed, colours) => {
  const centre = size / 2
  const r = size * 0.34
  const blades = seed.int(5, 7)
  const out: SVGElement[] = []
  for (let i = 0; i < blades; i++) {
    const a0 = (360 / blades) * i
    const a1 = a0 + 360 / blades
    const mid = (a0 + a1) / 2
    const inner = r * 0.42
    const points = [
      polar(centre, centre, inner, a0),
      polar(centre, centre, r, a0),
      polar(centre, centre, r, mid),
      polar(centre, centre, r, a1),
      polar(centre, centre, inner, a1),
    ]
    out.push(
      path(
        `${points
          .map((p, index) => `${index === 0 ? 'M' : 'L'} ${fmt(p.x)} ${fmt(p.y)}`)
          .join(' ')} Z`,
        colours[i % 3] as string
      )
    )
  }
  out.push(path(discPath(centre, centre, r * 0.3), colours[0] as string))
  return out
}

/**
 * Nested polygons, each rotated a little further than the last: depth, in the flatest possible terms.
 */
const prism: CentredMode = (size, seed, colours) => {
  const centre = size / 2
  const sides = seed.int(3, 6)
  const rings = seed.int(2, 3)
  const out: SVGElement[] = []
  for (let i = 0; i < rings; i++) {
    out.push(
      path(
        regularPolygonPath(centre, centre, size * 0.34 * (1 - i * 0.28), sides, -90 + i * 14),
        colours[i % 3] as string
      )
    )
  }
  return out
}

/**
 * A few discs evenly spaced on a ring: a tidy `orbit`, with nothing crowding the middle.
 *
 * The satellites sit at exact multiples of the division rather than with a per-satellite jitter, so the
 * set is rotationally balanced and the ring does most of the centring work.
 */
const scatter: CentredMode = (size, seed, colours) => {
  const centre = size / 2
  const r = size * 0.3
  const count = seed.int(3, 4)
  const out: SVGElement[] = [path(ringPath(centre, centre, r, r, r * 0.09), colours[0] as string)]
  const tilt = seed.range(0, 360)
  for (let i = 0; i < count; i++) {
    const at = polar(centre, centre, r, tilt + (360 / count) * i)
    out.push(path(discPath(at.x, at.y, r * 0.26), colours[(i + 1) % 3] as string))
  }
  return out
}

/**
 * A disc crossed by a set of latitude ellipses: a globe, or a lens.
 *
 * Each latitude is a thin ring rather than a filled lens, so the middle of the shape stays open and the
 * mark reads as a transparent sphere rather than a solid blob.
 */
const meridian: CentredMode = (size, seed, colours) => {
  const centre = size / 2
  const r = size * 0.32
  const out: SVGElement[] = [path(ringPath(centre, centre, r, r, r * 0.1), colours[0] as string)]
  const lines = seed.int(3, 5)
  for (let i = 0; i < lines; i++) {
    const t = (i + 1) / (lines + 1)
    out.push(
      path(
        ringPath(centre, centre, r * (0.3 + 0.68 * Math.sin(t * Math.PI)), r * 0.92, r * 0.055),
        colours[1] as string
      )
    )
  }
  out.push(path(discPath(centre, centre, r * 0.13), colours[2] as string))
  return out
}

/**
 * Stacked chevrons climbing, like a signal bar.
 */
const chevrons: CentredMode = (size, seed, colours) => {
  const centre = size / 2
  const count = seed.int(3, 4)
  const unit = (size * 0.62) / count
  const half = size * 0.3
  const stem = unit * 0.46
  const out: SVGElement[] = []
  for (let i = 0; i < count; i++) {
    const y = centre - (count * unit) / 2 + unit * (i + 0.5)
    const points: Point[] = [
      { x: centre - half, y: y + unit * 0.4 },
      { x: centre, y: y - unit * 0.22 },
      { x: centre + half, y: y + unit * 0.4 },
      { x: centre + half - stem, y: y + unit * 0.4 },
      { x: centre, y: y - unit * 0.22 + stem },
      { x: centre - half + stem, y: y + unit * 0.4 },
    ]
    out.push(
      path(
        `${points
          .map((p, index) => `${index === 0 ? 'M' : 'L'} ${fmt(p.x)} ${fmt(p.y)}`)
          .join(' ')} Z`,
        colours[i % 3] as string
      )
    )
  }
  return out
}

/**
 * Nested squares, each rotated a few degrees further than the last: the strongest depth cue available
 * without a gradient.
 */
const stacked: CentredMode = (size, seed, colours) => {
  const centre = size / 2
  const count = seed.int(3, 4)
  const out: SVGElement[] = []
  for (let i = 0; i < count; i++) {
    out.push(
      path(
        regularPolygonPath(centre, centre, size * 0.33 * (1 - i * 0.25), 4, -90 + i * 8),
        colours[i % 3] as string
      )
    )
  }
  return out
}

/**
 * The modes that build from the canvas centre outward, keyed by the name the seed picks.
 *
 * Anything absent from this table falls through to the original `waves` branch, so the five modes that
 * existed before behave exactly as they did for any mode name that is not here.
 */
const CENTRED_MODES: Record<string, CentredMode> = {
  lattice,
  gridframe,
  portal,
  helix,
  aperture,
  prism,
  scatter,
  meridian,
  chevrons,
  stacked,
}

/**
 * Picks the abstract engine's three fill roles, as distinct colours that each clear the legibility floor.
 *
 * Resolving the roles one at a time with {@link readableOn} is not enough, because each role's fallback is
 * the previous role. On `azure-current` the accent is *the same colour as the background*, so the accent
 * fell back to the lead, which made `second` equal to `lead`; the highlight then failed the contrast floor
 * and fell back to `second`, which made `third` equal to both. Every mark came out a single flat tone —
 * and the modes that build depth from layered tones lost exactly the thing they are for.
 *
 * So the roles are drawn from the palette as a set rather than as a chain: a candidate is rejected if it
 * is illegible on the background *or* already spoken for. Only when the palette runs genuinely dry does a
 * role fall back, and then to the role before it.
 *
 * @param palette - The resolved palette.
 * @param canvas - The colour the mark sits on.
 * @returns Three fills, distinct wherever the palette allows.
 */
function fillRoles(palette: PaletteEntry, canvas: string): [string, string, string] {
  const lead = contrastFill(palette, canvas)
  const pool: (string | undefined)[] = [
    palette.accent,
    palette.highlight,
    palette.secondary,
    palette.primary,
  ]
  const taken = new Set<string>([lead])
  const take = (): string => {
    for (const candidate of pool) {
      if (candidate === undefined || taken.has(candidate)) {
        continue
      }
      if (candidate === canvas || contrastRatio(candidate, canvas) < 4.5) {
        continue
      }
      taken.add(candidate)
      return candidate
    }
    // Every remaining slot is either illegible or already used. Reusing a tone beats drawing nothing.
    return lead
  }
  return [lead, take(), take()]
}

/**
 * Measures a group of elements and translates them so their ink is centred on the canvas.
 *
 * Returns the elements unchanged when they enclose no area, since there is nothing to centre.
 *
 * @param elements - Elements to re-centre.
 * @param size - Canvas side in user units.
 * @returns The elements, shifted so the ink box is centred.
 */
function centreOnInk(elements: SVGElement[], size: number): SVGElement[] {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const element of elements) {
    const { d } = element.attrs
    if (typeof d !== 'string') {
      continue
    }
    const bounds = pathBounds(d)
    if (bounds === null) {
      continue
    }
    minX = Math.min(minX, bounds.minX)
    minY = Math.min(minY, bounds.minY)
    maxX = Math.max(maxX, bounds.maxX)
    maxY = Math.max(maxY, bounds.maxY)
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return elements
  }
  const dx = size / 2 - (minX + maxX) / 2
  const dy = size / 2 - (minY + maxY) / 2
  if (dx === 0 && dy === 0) {
    return elements
  }
  return elements.map(element => {
    const { d } = element.attrs
    if (typeof d !== 'string') {
      return element
    }
    return { ...element, attrs: { ...element.attrs, d: transformPath(d, 1, dx, dy) } }
  })
}

/**
 * Draws an abstract mark.
 *
 * @param input - The engine input.
 * @returns The SVG elements that make up the mark.
 */
export const abstractEngine: Engine = (input: EngineInput): SVGElement[] => {
  const { palette, seed, size } = input
  const mode = pick(MODES, seed, input.request.preferences.mode)
  const centre = size / 2
  const radius = (size * SCALE) / 2

  const canvas = palette.background ?? '#ffffff'
  // Named rather than assigned: these are roles, not colours. `VENN_FILLS` and `ARC_FILLS` index into
  // them by position, so a fill of `'lead'` in output is a bug, not a style.
  const [lead, second, third] = fillRoles(palette, canvas)

  const elements: SVGElement[] = []

  switch (mode) {
    case 'orbit': {
      const inner = radius * seed.range(0.3, 0.46)
      // Three or more, evenly spread. Two satellites on opposite sides of a centred ring is the same
      // shape as one satellite and its shadow, and left the mark reading as lopsided whenever the two
      // were not the same distance out.
      const count = seed.int(3, 5)
      const tilt = seed.range(0, 180)
      elements.push(path(discPath(centre, centre, inner), lead))
      for (let index = 0; index < count; index++) {
        const angle = tilt + (360 / count) * index + seed.range(-12, 12)
        const distance = radius * seed.range(0.86, 1)
        const dot = radius * seed.range(0.1, 0.17)
        const at = polar(centre, centre, distance, angle)
        elements.push(path(discPath(at.x, at.y, dot), index % 2 === 0 ? second : third))
      }
      elements.push(
        path(ringPath(centre, centre, radius * 0.72, radius * 0.72, radius * 0.045), second)
      )
      break
    }
    case 'venn': {
      const count = seed.int(2, 3)
      const offset = radius * seed.range(0.36, 0.5)
      const shape = seed.chance(0.5) ? 'circle' : 'hexagon'
      for (let index = 0; index < count; index++) {
        const spread = count === 1 ? 0 : (index / (count - 1) - 0.5) * 2
        const cx = centre + spread * offset
        const lift = index % 2 === 0 ? -1 : 1
        const cy = centre + lift * offset * 0.18
        const r = radius * seed.range(0.6, 0.76)
        const d = shape === 'circle' ? discPath(cx, cy, r) : regularPolygonPath(cx, cy, r, 6, -90)
        const fill = resolveRole(VENN_ROLES[index] ?? 'lead', { lead, second, third })
        elements.push(path(d, fill))
      }
      break
    }
    case 'arcs': {
      const bands = seed.int(3, 4)
      const rotation = seed.range(0, 360)
      for (let index = 0; index < bands; index++) {
        const t = bands === 1 ? 0 : index / (bands - 1)
        const r = radius * (0.42 + t * 0.58)
        const weight = radius * (0.2 - t * 0.09)
        // The bands start a third of a circle apart, not a few degrees apart. Clustered starts made
        // every arc leave from the same part of the ring, so the mark read as one lopsided fan and
        // left up to a fifth of the canvas empty on one side. Spread around the circle they read as
        // the concentric arcs they are meant to be, and the composition sits centred.
        const start = rotation + (360 / bands) * index + seed.range(-14, 14)
        const d = arcBandPath(centre, centre, r, r, weight, start, start + seed.range(150, 260))
        const role = ARC_ROLES[index % ARC_ROLES.length] ?? 'lead'
        elements.push(path(d, resolveRole(role, { lead, second, third })))
      }
      break
    }
    case 'burst': {
      const spikes = seed.int(6, 12)
      const innerRatio = seed.range(0.38, 0.6)
      elements.push(
        path(
          burstPath(centre, centre, radius, radius * innerRatio, spikes, seed.range(-90, -70)),
          lead
        ),
        path(
          burstPath(
            centre,
            centre,
            radius * 0.42,
            radius * 0.16,
            Math.max(3, Math.round(spikes / 2)),
            seed.range(0, 60)
          ),
          second
        )
      )
      break
    }
    case 'waves':
    default: {
      if (mode !== 'waves') {
        const build = CENTRED_MODES[mode]
        if (build !== undefined) {
          elements.push(...build(size, seed, [lead, second, third]))
          break
        }
      }
      const lobes = seed.int(3, 5)
      const phase = seed.range(0, 360)
      const layers: SVGElement[] = []
      for (let layer = 0; layer < 2; layer++) {
        const points: Point[] = []
        const count = 72
        const base = radius * (0.98 - layer * 0.26)
        // `depth` is a proportion of the base radius, not an absolute length.
        const depth = 0.18 - layer * 0.06
        for (let index = 0; index < count; index++) {
          const t = (Math.PI * 2 * index) / count
          const wave = Math.sin(t * lobes + (phase * Math.PI) / 180 + layer * 1.1)
          const r = base * (1 - depth + depth * wave)
          points.push(polar(centre, centre, r, (t * 180) / Math.PI))
        }
        layers.push(path(smoothClosedPath(points), layer === 0 ? lead : second))
      }
      elements.push(...layers, path(discPath(centre, centre, radius * 0.16), third))
      break
    }
  }

  input.mood.notes.push(`Abstract "${mode}" mark built from pure geometry; no type, no container.`)

  return centreOnInk(elements, size)
}

export { abstractEngine as abstract }

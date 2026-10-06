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
import { readableOn } from '../resolvers/palette-resolver'
import {
  arcBandPath,
  burstPath,
  discPath,
  polar,
  regularPolygonPath,
  ringPath,
  smoothClosedPath,
  type Point,
} from '../geometry'
import type { Engine, EngineInput, SVGElement } from '../types'

/** Modes available to the engine. */
export const MODES: readonly string[] = ['orbit', 'venn', 'arcs', 'burst', 'waves']

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
  const lead = contrastFill(palette, canvas)
  const second =
    palette.accent === lead ? palette.primary : readableOn(palette.accent, canvas, lead)
  let third = readableOn(palette.secondary, canvas, second)
  if (palette.highlight !== undefined) {
    third = readableOn(palette.highlight, canvas, second)
  }

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

  return elements
}

export { abstractEngine as abstract }

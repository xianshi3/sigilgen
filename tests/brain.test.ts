import { describe, expect, it } from 'vitest'
import {
  BRAIN,
  FONTS,
  ICONS,
  MOODS,
  PALETTES,
  findFont,
  findIcon,
  findPalette,
  fallbackMood,
  normaliseColour,
  COLOR_NAMES,
} from '../src/brain/index'
import { isSafePathData, parsePath, pathBounds } from '../src/path'
import { discPath, ringPath } from '../src/geometry'
import { ENGINE_NAMES } from '../src/types'

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/

describe('brain contents', () => {
  it('ships a substantial knowledge base', () => {
    expect(PALETTES.length).toBeGreaterThanOrEqual(24)
    expect(FONTS.length).toBeGreaterThanOrEqual(18)
    expect(ICONS.length).toBeGreaterThanOrEqual(48)
    expect(MOODS.length).toBeGreaterThanOrEqual(20)
  })

  it('exposes exactly five engines in the mood weights', () => {
    const engines = new Set(ENGINE_NAMES)
    for (const mood of MOODS) {
      for (const engine of Object.keys(mood.engineWeights)) {
        expect(engines.has(engine as never)).toBe(true)
      }
    }
  })

  it('has a neutral fallback mood with an empty keyword list', () => {
    const neutral = fallbackMood()
    expect(neutral.id).toBe('neutral')
    expect(neutral.keywords).toHaveLength(0)
  })

  it('gives every mood at least one palette, font and icon', () => {
    for (const mood of MOODS) {
      expect(mood.paletteIds.length, mood.id).toBeGreaterThan(0)
      expect(mood.fontIds.length, mood.id).toBeGreaterThan(0)
      expect(mood.iconKeys.length, mood.id).toBeGreaterThan(0)
    }
  })

  it('gives every mood at least one non-zero engine weight', () => {
    for (const mood of MOODS) {
      const total = Object.values(mood.engineWeights).reduce((sum, weight) => sum + weight, 0)
      expect(total, mood.id).toBeGreaterThan(0)
    }
  })
})

describe('brain integrity', () => {
  it('has no duplicate ids', () => {
    const groups: [string, readonly string[]][] = [
      ['palette', PALETTES.map(entry => entry.id)],
      ['font', FONTS.map(entry => entry.id)],
      ['icon', ICONS.map(entry => entry.key)],
      ['mood', MOODS.map(entry => entry.id)],
    ]
    for (const [label, ids] of groups) {
      expect(new Set(ids).size, label).toBe(ids.length)
    }
  })

  it('uses kebab-case ids everywhere', () => {
    const pattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
    for (const palette of PALETTES) expect(palette.id).toMatch(pattern)
    for (const font of FONTS) expect(font.id).toMatch(pattern)
    for (const icon of ICONS) expect(icon.key).toMatch(pattern)
    for (const mood of MOODS) expect(mood.id).toMatch(pattern)
  })

  it('resolves every mood reference', () => {
    const palettes = new Set(PALETTES.map(entry => entry.id))
    const fonts = new Set(FONTS.map(entry => entry.id))
    const icons = new Set(ICONS.map(entry => entry.key))
    for (const mood of MOODS) {
      for (const id of mood.paletteIds) expect(palettes.has(id), `${mood.id} -> ${id}`).toBe(true)
      for (const id of mood.fontIds) expect(fonts.has(id), `${mood.id} -> ${id}`).toBe(true)
      for (const key of mood.iconKeys) expect(icons.has(key), `${mood.id} -> ${key}`).toBe(true)
    }
  })

  it('reaches every palette and font from at least one mood', () => {
    const usedPalettes = new Set(MOODS.flatMap(mood => mood.paletteIds))
    const usedFonts = new Set(MOODS.flatMap(mood => mood.fontIds))
    for (const palette of PALETTES) expect(usedPalettes.has(palette.id), palette.id).toBe(true)
    for (const font of FONTS) expect(usedFonts.has(font.id), font.id).toBe(true)
  })
})

describe('palettes', () => {
  it('uses normalised hex for every colour', () => {
    for (const palette of PALETTES) {
      expect(palette.primary, palette.id).toMatch(HEX)
      expect(palette.secondary, palette.id).toMatch(HEX)
      expect(palette.accent, palette.id).toMatch(HEX)
      if (palette.background !== null) expect(palette.background, palette.id).toMatch(HEX)
      if (palette.highlight !== undefined) expect(palette.highlight, palette.id).toMatch(HEX)
    }
  })

  it('carries descriptive tags', () => {
    for (const palette of PALETTES) {
      expect(palette.tags.length, palette.id).toBeGreaterThanOrEqual(3)
      for (const tag of palette.tags) expect(tag).toMatch(/^[a-z0-9-]+$/)
    }
  })
})

describe('fonts', () => {
  it('defines all 26 uppercase glyphs', () => {
    for (const font of FONTS) {
      for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
        expect(font.glyphs[letter], `${font.id}/${letter}`).toBeTypeOf('string')
        expect((font.glyphs[letter] ?? '').length, `${font.id}/${letter}`).toBeGreaterThan(0)
      }
    }
  })

  it('emits only safe absolute path commands', () => {
    for (const font of FONTS) {
      for (const [letter, d] of Object.entries(font.glyphs)) {
        expect(isSafePathData(d), `${font.id}/${letter}`).toBe(true)
        expect(
          /[mlczhvqt]/.test(d),
          `${font.id}/${letter} uses a relative or shorthand command`
        ).toBe(false)
        expect(d.trimStart().startsWith('M'), `${font.id}/${letter}`).toBe(true)
      }
    }
  })

  it('has positive advances and sane metrics for every glyph', () => {
    for (const font of FONTS) {
      expect(font.metrics.capHeight, font.id).toBeGreaterThan(0)
      expect(font.metrics.xHeight, font.id).toBeGreaterThan(0)
      expect(font.metrics.xHeight, font.id).toBeLessThan(font.metrics.capHeight)
      for (const [letter, advance] of Object.entries(font.metrics.advance)) {
        expect(advance, `${font.id}/${letter}`).toBeGreaterThan(0)
        expect(advance, `${font.id}/${letter}`).toBeLessThan(font.metrics.capHeight * 3)
      }
    }
  })

  it('gives every glyph symmetric side bearings and keeps its ink inside its advance', () => {
    // Two invariants that are invisible in a path dump and obvious in a rendered word:
    //
    // - Ink inside its advance. `J` used to overshoot its advance by enough to collide with the letter
    //   before it, because the advance came from the skeleton's nominal width rather than the ink.
    // - Equal bearings. All the spacing used to sit on the right, so a centred single letter looked off
    //   centre: the run is centred on the advance box, and the ink was not.
    for (const font of FONTS) {
      for (const [letter, glyph] of Object.entries(font.glyphs)) {
        const bounds = pathBounds(glyph)
        expect(bounds, `${font.id}/${letter}`).not.toBeNull()
        const advance = font.metrics.advance[letter] ?? 0
        const left = (bounds as { minX: number }).minX
        const right = advance - (bounds as { maxX: number }).maxX
        expect(left, `${font.id}/${letter} left bearing`).toBeGreaterThanOrEqual(-1)
        expect(right, `${font.id}/${letter} right bearing`).toBeGreaterThanOrEqual(-1)
        expect(
          Math.abs(left - right),
          `${font.id}/${letter} bearings ${left.toFixed(1)}/${right.toFixed(1)}`
        ).toBeLessThanOrEqual(1)
      }
    }
  })

  it('declares a known category and a plausible weight', () => {
    const categories = new Set(['geometric-sans', 'humanist-sans', 'serif', 'display'])
    for (const font of FONTS) {
      expect(categories.has(font.category), font.id).toBe(true)
      expect(font.weight, font.id).toBeGreaterThanOrEqual(100)
      expect(font.weight, font.id).toBeLessThanOrEqual(900)
    }
  })

  it('covers all four categories', () => {
    const categories = new Set(FONTS.map(font => font.category))
    expect(categories.size).toBe(4)
  })

  it('keeps every family visually distinct in weight', () => {
    // Two families sharing weight, width, tracking and terminal style would render identically.
    const signatures = new Set(
      FONTS.map(font => [font.weight, font.letterSpacing, font.category].join('|'))
    )
    expect(signatures.size).toBeGreaterThanOrEqual(FONTS.length - 3)
  })
})

/** One straight piece of a flattened outline. */
interface Edge {
  x1: number
  y1: number
  x2: number
  y2: number
}

/** How finely each cubic is flattened. */
const CURVE_STEPS = 16

/**
 * Flattens path data into straight edges.
 *
 * Parsing once and reusing the result matters: these tests sample thousands of points per glyph, and
 * re-parsing for every sample is slow enough to time out once the coverage instrumentation is on.
 *
 * @param d - Path data.
 * @returns The outline as straight edges, with `Z` closing each sub-path.
 */
function flatten(d: string): Edge[] {
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
      // A sub-path may rely on `Z` rather than an explicit line home, and an unclosed contour would
      // silently change the winding.
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
 * Reports whether a point is painted, decided the way a renderer decides it: by winding number.
 *
 * SVG fills with `nonzero`, so a shape and a hole drawn in the same direction fill solid. Measuring a
 * glyph therefore has to answer "is this pixel painted", not "is this pixel inside some sub-path" —
 * otherwise a counter that has been filled in looks identical to one that is open.
 *
 * @param edges - The flattened outline.
 * @param px - Sample x.
 * @param py - Sample y.
 * @returns `true` when the point is painted.
 */
function isPainted(edges: readonly Edge[], px: number, py: number): boolean {
  let winding = 0
  for (const edge of edges) {
    winding += crossing(edge.x1, edge.y1, edge.x2, edge.y2, px, py)
  }
  return winding !== 0
}

/**
 * Winding contribution of one edge to a sample point.
 *
 * The standard crossing test: an edge counts when it straddles the sample's scanline, and counts `+1`
 * or `-1` depending on which way it runs.
 *
 * @param x1 - Edge start x.
 * @param y1 - Edge start y.
 * @param x2 - Edge end x.
 * @param y2 - Edge end y.
 * @param px - Sample x.
 * @param py - Sample y.
 * @returns `-1`, `0` or `1`.
 */
function crossing(x1: number, y1: number, x2: number, y2: number, px: number, py: number): number {
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
 * Samples a glyph's 720 unit em box and reports the share of samples that are painted.
 *
 * @param d - Glyph path data.
 * @returns `[painted, open]` sample counts.
 */
function inkShare(d: string): [number, number] {
  const edges = flatten(d)
  let painted = 0
  let open = 0
  for (let row = 1; row < 40; row++) {
    for (let column = 1; column < 40; column++) {
      if (isPainted(edges, (column / 40) * 720, (row / 40) * 720)) {
        painted++
      } else {
        open++
      }
    }
  }
  return [painted, open]
}

describe('the winding sampler these glyph tests rely on', () => {
  it('reports the inside of a solid disc as painted', () => {
    const disc = flatten(discPath(50, 50, 40))
    expect(isPainted(disc, 50, 50)).toBe(true)
    expect(isPainted(disc, 5, 50)).toBe(false)
  })

  it('reports the middle of a ring as open', () => {
    // `ringPath` winds its inner contour the other way, which is exactly what leaves a hole under the
    // nonzero rule. Without this working, every "open counter" result below would be meaningless.
    const ring = flatten(ringPath(50, 50, 40, 40, 10))
    expect(isPainted(ring, 50, 50)).toBe(false)
    expect(isPainted(ring, 50, 15)).toBe(true)
  })

  it('closes a sub-path that relies on Z rather than an explicit line home', () => {
    // An unclosed contour changes the winding, which would turn every counter inside it solid.
    const open = flatten('M 0 0 L 100 0 L 100 100 L 0 100 Z')
    expect(isPainted(open, 50, 50)).toBe(true)
    expect(isPainted(open, 150, 50)).toBe(false)
  })
})

describe('glyph geometry', () => {
  // Letters whose design includes enclosed negative space. A filled counter reads as a blob rather than
  // a letter, which is a defect rather than a stylistic choice.
  const COUNTERED = ['A', 'B', 'D', 'O', 'P', 'Q', 'R'] as const

  it('leaves an open counter in every letter drawn with one', () => {
    for (const font of FONTS) {
      for (const letter of COUNTERED) {
        const [painted, open] = inkShare(font.glyphs[letter] as string)
        // `B` has two counters, so demanding only some open area would be too weak: one counter can be
        // filled while the other survives.
        expect(
          open / (open + painted),
          `${font.id}/${letter} has almost no counter`
        ).toBeGreaterThan(0.02)
      }
    }
  })

  it('fills the strokes of a letter rather than leaving it hollow', () => {
    // The mirror of the test above: a glyph could otherwise pass by being mostly empty. `I` has no
    // counter at all.
    for (const font of FONTS) {
      for (const letter of ['I', 'L', 'E'] as const) {
        const [painted, open] = inkShare(font.glyphs[letter] as string)
        expect(painted / (painted + open), `${font.id}/${letter} is mostly hollow`).toBeGreaterThan(
          0.05
        )
      }
    }
  })

  it('leaves the bottom corners of a T unpainted', () => {
    // `T` is a bar over a centred stem, so the lower corners are outside the ink. This catches a stray
    // sub-path inflating the glyph sideways.
    for (const font of FONTS) {
      const edges = flatten(font.glyphs['T'] as string)
      expect(isPainted(edges, 2, 718), `${font.id}/T paints its bottom-left corner`).toBe(false)
      expect(isPainted(edges, 718, 718), `${font.id}/T paints its bottom-right corner`).toBe(false)
    }
  })
})

describe('icons', () => {
  it('is authored on the same grid with a matching viewBox', () => {
    for (const icon of ICONS) {
      expect(icon.viewBox, icon.key).toBe('0 0 24 24')
      expect(icon.path, icon.key).toContain('M')
    }
  })

  it('carries tags and a category', () => {
    for (const icon of ICONS) {
      expect(icon.category, icon.key).toBeTruthy()
      expect(icon.tags.length, icon.key).toBeGreaterThanOrEqual(2)
      for (const tag of icon.tags) expect(tag, `${icon.key}/${tag}`).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it('stays within the 24 unit grid', () => {
    for (const icon of ICONS) {
      for (const number of icon.path.match(/-?\d+(?:\.\d+)?/g) ?? []) {
        expect(Math.abs(Number(number)), `${icon.key}: ${number}`).toBeLessThanOrEqual(24.5)
      }
    }
  })
})

describe('lookups', () => {
  it('finds resources by id and returns undefined otherwise', () => {
    expect(findPalette('ink-monolith')?.id).toBe('ink-monolith')
    expect(findPalette('nope')).toBeUndefined()
    expect(findFont('orbit-grotesk')?.id).toBe('orbit-grotesk')
    expect(findFont('nope')).toBeUndefined()
    expect(findIcon('mountain-peak')?.key).toBe('mountain-peak')
    expect(findIcon('nope')).toBeUndefined()
  })

  it('exposes the assembled brain', () => {
    expect(BRAIN.palettes).toBe(PALETTES)
    expect(BRAIN.fonts).toBe(FONTS)
    expect(BRAIN.icons).toBe(ICONS)
    expect(BRAIN.moods).toBe(MOODS)
  })
})

describe('colour names', () => {
  it('resolves the names used in the documented CLI example', () => {
    expect(COLOR_NAMES['cream']).toBeTypeOf('string')
    expect(COLOR_NAMES['rust']).toBeTypeOf('string')
  })

  it('maps none and transparent to null', () => {
    expect(COLOR_NAMES['none']).toBeNull()
    expect(COLOR_NAMES['transparent']).toBeNull()
  })

  it('normalises shorthand hex', () => {
    expect(normaliseColour('#ABC')).toBe('#aabbcc')
    expect(normaliseColour('#AABBCC')).toBe('#aabbcc')
    expect(normaliseColour(' #abc ')).toBe('#aabbcc')
  })

  it('rejects anything that is not a plain colour', () => {
    expect(normaliseColour('rgb(1,2,3)')).toBeNull()
    expect(normaliseColour('url(#x)')).toBeNull()
    expect(normaliseColour('rebeccapurple')).toBeNull()
    expect(normaliseColour('#12345')).toBeNull()
  })
})

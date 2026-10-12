import { describe, expect, it } from 'vitest'
import { generate } from '../src/lib/generate'
import {
  applyEdits,
  emptyEdit,
  parseSvgParts,
  partCentre,
  partTransform,
} from '../src/lib/svgParts'

/**
 * Parsing the generated SVG into editable parts, and applying edits back to it.
 *
 * The parser is the foundation the whole editor rests on: if it misreads a path, every edit lands on the
 * wrong shape. And `applyEdits` has a property worth pinning down exactly — an unedited concept must come
 * out byte-identical to the generator's output, because the studio's contract is that editing is something
 * the reader does, not something that happens by default.
 */

/** A real concept, so the tests run against the same markup the app renders. */
function aConcept(): string {
  return (
    generate({
      name: 'Northwind',
      keywords: 'tech',
      engine: 'abstract',
      variations: 1,
      seed: 3,
    }).concepts[0]?.svg ?? ''
  )
}

/** The path elements of a document, which is what "identical output" has to mean. */
function pathElements(svg: string): string[] {
  return [...svg.matchAll(/<path\b[^>]*\/?>/gi)].map(match => match[0] ?? '')
}

describe('parseSvgParts', () => {
  it('reads the viewBox and every path', () => {
    const { viewBox, parts } = parseSvgParts(aConcept())
    expect(viewBox).toEqual([0, 0, 512, 512])
    expect(parts.length).toBeGreaterThan(0)
    for (const part of parts) {
      expect(part.d, 'a part with no path data').not.toBe('')
    }
  })

  it('keeps the fill colour each path was given', () => {
    const { parts } = parseSvgParts(aConcept())
    // The abstract engine draws in two colours, so both a filled path and the document's own palette are
    // represented. What matters is that the fill is carried through rather than defaulted.
    expect(parts.some(part => part.fill !== null)).toBe(true)
  })

  it('reports a missing fill as null rather than inventing one', () => {
    const { parts } = parseSvgParts('<svg viewBox="0 0 10 10"><path d="M0 0L10 0L10 10Z"/></svg>')
    expect(parts).toHaveLength(1)
    expect(parts[0]?.fill).toBeNull()
  })

  it('finds no parts in a document with no paths', () => {
    const { parts } = parseSvgParts('<svg viewBox="0 0 10 10"></svg>')
    expect(parts).toEqual([])
  })
})

describe('partCentre', () => {
  it('takes the centre of the ink, not of the construction', () => {
    // A square from 10,10 to 30,30. The centre is 20,20 — the middle of what a reader sees, which is
    // what a rotation has to turn about.
    expect(partCentre('M10 10L30 10L30 30L10 30Z')).toEqual({ x: 20, y: 20 })
  })

  it('is the origin for a path with no bounds', () => {
    expect(partCentre('')).toEqual({ x: 0, y: 0 })
  })
})

describe('partTransform', () => {
  it('is null when nothing changed', () => {
    expect(partTransform('M0 0L10 0L10 10Z', emptyEdit())).toBeNull()
  })

  it('writes a translation in the SVG user units it was given', () => {
    expect(partTransform('M0 0L10 0L10 10Z', { ...emptyEdit(), dx: 5, dy: -3 })).toBe(
      'translate(5 -3)'
    )
  })

  it('turns rotation about the part, not the origin', () => {
    // A bare `rotate(90)` turns about (0,0), which would fling a part at 20,20 to -20,20. The centre has
    // to be named.
    const transform = partTransform('M10 10L30 10L30 30L10 30Z', { ...emptyEdit(), rotate: 90 })
    expect(transform).toContain('rotate(90 20 20)')
  })

  it('scales about the part rather than the origin', () => {
    const transform = partTransform('M10 10L30 10L30 30L10 30Z', { ...emptyEdit(), scale: 2 })
    // A bare `scale(2)` would double the distance from the origin and move the part. The translate pair
    // keeps it in place.
    expect(transform).toBe('translate(20 20) scale(2) translate(-20 -20)')
  })
})

describe('applyEdits', () => {
  it('leaves an unedited concept byte-identical to the generator', () => {
    // The contract that makes editing safe: a reader who never touches a part gets exactly what the
    // generator made, so the studio cannot quietly change the output by existing.
    const original = aConcept()
    expect(applyEdits(original, [])).toBe(original)
  })

  it('drops a hidden part rather than emitting it invisible', () => {
    const svg = aConcept()
    const { parts } = parseSvgParts(svg)
    const hidden = applyEdits(
      svg,
      parts.map((_, index) => ({ ...emptyEdit(), hidden: index === 0 }))
    )
    expect(pathElements(hidden)).toHaveLength(parts.length - 1)
    // And the surviving paths are untouched.
    expect(pathElements(hidden)[0]).toBe(pathElements(svg)[1])
  })

  it('moves a part without disturbing the others', () => {
    const svg = aConcept()
    const { parts } = parseSvgParts(svg)
    const moved = applyEdits(svg, [{ ...emptyEdit(), dx: 40, dy: -20 }])
    // The transform goes on a `<g>` wrapper, not on the path itself, so the path's own geometry is
    // untouched and only its placement changes.
    expect(moved).toContain('<g transform="translate(40 -20)">')
    // The rest are emitted exactly as they were.
    for (let index = 1; index < parts.length; index++) {
      expect(pathElements(moved)[index]).toBe(pathElements(svg)[index])
    }
  })

  it('overrides a fill and can be told to stop', () => {
    const svg = aConcept()
    const recoloured = applyEdits(svg, [{ ...emptyEdit(), fill: '#ff0000' }])
    expect(pathElements(recoloured)[0]).toContain('fill="#ff0000"')
    // `null` means "keep the generator's colour", so the original attribute comes back.
    const restored = applyEdits(svg, [{ ...emptyEdit(), fill: null }])
    expect(pathElements(restored)[0]).toBe(pathElements(svg)[0])
  })

  it('applies each edit to its own part', () => {
    const svg = aConcept()
    const { parts } = parseSvgParts(svg)
    if (parts.length < 2) {
      return
    }
    // Non-zero offsets, because a zero translation is the identity and produces no wrapper at all — which
    // is correct, and would make this assertion pass for the wrong reason.
    const edits = parts.map((_, index) => ({ ...emptyEdit(), dx: (index + 1) * 10 }))
    const result = applyEdits(svg, edits)
    // Each part gets its own wrapper, so the transforms are per-part rather than shared.
    expect(result).toContain('<g transform="translate(10 ')
    expect(result).toContain('<g transform="translate(20 ')
  })
})

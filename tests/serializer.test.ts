import { describe, expect, it } from 'vitest'
import { serialiseDocument, group } from '../src/serializer'
import type { SVGElement } from '../src/types'

/**
 * Builds a minimal valid element.
 *
 * @param overrides - Attributes to merge over the defaults.
 * @returns The element.
 */
function el(overrides: Partial<SVGElement> = {}): SVGElement {
  return { tag: 'path', attrs: { d: 'M 0 0 L 10 10 Z', fill: '#123456' }, ...overrides }
}

describe('serialiseDocument', () => {
  it('emits a scalable document with a viewBox', () => {
    const svg = serialiseDocument([], { size: 256, background: null })
    expect(svg).toContain('viewBox="0 0 256 256"')
    expect(svg).toContain('width="256"')
    expect(svg).toContain('height="256"')
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg.startsWith('<svg ')).toBe(true)
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
  })

  it('omits the background rectangle when the canvas is transparent', () => {
    expect(serialiseDocument([], { size: 100, background: null })).not.toContain('<rect')
  })

  it('emits the background rectangle when asked', () => {
    const svg = serialiseDocument([], { size: 100, background: '#ffffff' })
    expect(svg).toContain('<rect x="0" y="0" width="100" height="100" fill="#ffffff"/>')
  })

  it('ends with a trailing newline so the file is well formed', () => {
    expect(serialiseDocument([], { size: 10, background: null }).endsWith('\n')).toBe(true)
  })

  it('is byte-identical for identical input', () => {
    const build = (): string =>
      serialiseDocument([el(), el({ attrs: { d: 'M 1 1 L 2 2 Z', fill: 'none' } })], {
        size: 512,
        background: '#fff',
      })
    expect(build()).toBe(build())
  })

  it('serialises nested groups', () => {
    const svg = serialiseDocument([group([el()], { opacity: 0.5 })], { size: 10, background: null })
    expect(svg).toContain('<g opacity="0.5"><path')
    expect(svg).toContain('</g>')
  })

  it('preserves attribute insertion order', () => {
    const svg = serialiseDocument([{ tag: 'path', attrs: { fill: '#fff', d: 'M 0 0 Z' } }], {
      size: 10,
      background: null,
    })
    expect(svg).toContain('fill="#fff" d="M 0 0 Z"')
  })

  it('stringifies numeric attribute values', () => {
    const svg = serialiseDocument([{ tag: 'circle', attrs: { cx: 1.5, cy: 2, r: 3 } }], {
      size: 10,
      background: null,
    })
    expect(svg).toContain('cx="1.5" cy="2" r="3"')
  })
})

describe('serializer safety', () => {
  it('refuses script elements', () => {
    expect(() =>
      serialiseDocument([{ tag: 'script', attrs: {} }], { size: 10, background: null })
    ).toThrow(/forbidden element/)
  })

  it('refuses foreignObject, image, use and text', () => {
    for (const tag of ['foreignObject', 'image', 'use', 'text', 'animate']) {
      expect(() =>
        serialiseDocument([{ tag, attrs: {} }], { size: 10, background: null })
      ).toThrow()
    }
  })

  it('refuses event handler attributes', () => {
    expect(() =>
      serialiseDocument([{ tag: 'path', attrs: { onload: 'alert(1)' } }], {
        size: 10,
        background: null,
      })
    ).toThrow(/onload/)
  })

  it('refuses href and style attributes', () => {
    for (const name of ['href', 'xlink:href', 'style']) {
      expect(() =>
        serialiseDocument([{ tag: 'path', attrs: { [name]: '#x' } }], {
          size: 10,
          background: null,
        })
      ).toThrow()
    }
  })

  it('refuses unknown attributes', () => {
    expect(() =>
      serialiseDocument([{ tag: 'path', attrs: { 'data-evil': '1' } }], {
        size: 10,
        background: null,
      })
    ).toThrow(/unknown attribute/)
  })

  it('refuses unknown elements', () => {
    expect(() =>
      serialiseDocument([{ tag: 'marquee', attrs: {} }], { size: 10, background: null })
    ).toThrow(/unknown element/)
  })

  it('refuses attribute values containing quotes', () => {
    expect(() =>
      serialiseDocument([{ tag: 'path', attrs: { fill: '" onload="alert(1)' } }], {
        size: 10,
        background: null,
      })
    ).toThrow(/unsafe value/)
  })

  it('accepts only numbers, commas and spaces in stroke-dasharray', () => {
    // `stroke-dasharray` is allow-listed, so it carries its own rule rather than the generic numeric
    // one. A unit suffix or a `url(#…)` reference would otherwise pass a naive "looks numeric" check
    // and reach the renderer, where it can pull in a paint server.
    const svg = serialiseDocument(
      [{ tag: 'path', attrs: { d: 'M 0 0 L 10 10 Z', fill: '#000', 'stroke-dasharray': '4 2' } }],
      { size: 10, background: null }
    )
    expect(svg).toContain('stroke-dasharray="4 2"')

    for (const value of ['4px', '4 2;stroke:url(#x)', 'url(#gradient)', '4,2;fill:red']) {
      expect(
        () =>
          serialiseDocument(
            [
              {
                tag: 'path',
                attrs: { d: 'M 0 0 L 10 10 Z', fill: '#000', 'stroke-dasharray': value },
              },
            ],
            { size: 10, background: null }
          ),
        value
      ).toThrow(/unsafe value/)
    }
  })

  it('refuses path data containing angle brackets or quotes', () => {
    for (const d of ['M 0 0"><script>', "M 0 0'"] as unknown as string) {
      expect(() =>
        serialiseDocument([{ tag: 'path', attrs: { d, fill: '#000' } }], {
          size: 10,
          background: null,
        })
      ).toThrow()
    }
  })

  it('refuses colour values that are not plain colours', () => {
    for (const fill of ['url(#gradient)', '#000000; stroke:url(#x)', 'javascript:alert(1)']) {
      expect(() =>
        serialiseDocument([{ tag: 'path', attrs: { d: 'M 0 0 Z', fill } }], {
          size: 10,
          background: null,
        })
      ).toThrow(/unsafe value/)
    }
  })

  it('refuses numeric attributes with non-numeric values', () => {
    expect(() =>
      serialiseDocument([{ tag: 'circle', attrs: { cx: '1e999; evil', r: 5 } }], {
        size: 10,
        background: null,
      })
    ).toThrow(/unsafe value/)
  })

  it('refuses a gradient reference smuggled through a transform', () => {
    expect(() =>
      serialiseDocument([{ tag: 'path', attrs: { d: 'M 0 0 Z', transform: 'url(#x)' } }], {
        size: 10,
        background: null,
      })
    ).toThrow(/unsafe value/)
  })

  it('accepts every value a generated document can legitimately contain', () => {
    const document: SVGElement[] = [
      { tag: 'path', attrs: { d: 'M0 0L10 10Z', fill: '#abc' } },
      { tag: 'path', attrs: { d: 'M0 0C1 2 3 4 5 6Z', fill: 'none', 'fill-rule': 'evenodd' } },
      { tag: 'circle', attrs: { cx: 5.5, cy: 6, r: 2.25, fill: 'currentColor', opacity: 0.4 } },
      { tag: 'rect', attrs: { x: 0, y: 0, width: 10, height: 10, rx: 2, fill: '#123456' } },
      { tag: 'polygon', attrs: { points: '0,0 4,0 2,3', fill: '#fff' } },
      { tag: 'g', attrs: { transform: 'translate(1 2)' }, children: [] },
    ]
    expect(() => serialiseDocument(document, { size: 10, background: null })).not.toThrow()
  })
})

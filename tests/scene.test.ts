import { describe, expect, it } from 'vitest'
import { generateLogo } from '../src/generate'
import {
  SCENE_MAX_ELEMENTS,
  SceneError,
  duplicateSceneElement,
  normaliseScene,
  renderScene,
  sceneElementBounds,
  sceneFromLogo,
  sceneToSvgElements,
} from '../src/scene'

/**
 * The scene document.
 *
 * These cases pin the contract the studio and the MCP server both depend on: positional defaults,
 * palette roles, path safety, text compiled from real outlines, and a scene that can be imported from
 * a generated concept without changing the mark.
 */

/** Elements the flat-SVG contract forbids. */
const FORBIDDEN = [
  /<linearGradient/i,
  /<radialGradient/i,
  /<filter/i,
  /<mask/i,
  /<clipPath/i,
  /<pattern/i,
  /<image/i,
  /<foreignObject/i,
  /<script/i,
  /<text/i,
]

/** A small, valid scene. */
function scene() {
  return normaliseScene({
    size: 512,
    palette: 'ink-monolith',
    font: 'inter-regular',
    background: '#ffffff',
    elements: [
      { type: 'rect', x: 40, y: 40, width: 200, height: 120, rx: 12, fill: 'primary' },
      { type: 'circle', cx: 380, cy: 160, r: 60, fill: 'accent' },
      { type: 'text', text: 'Acme', x: 40, y: 320, width: 250, height: 80, fill: 'secondary' },
      { type: 'icon', key: 'rocket', x: 360, y: 320, size: 96, fill: 'primary' },
    ],
  })
}

describe('normaliseScene', () => {
  it('assigns ids, defaults and a version', () => {
    const normal = normaliseScene({ elements: [{ type: 'circle', cx: 10, cy: 10, r: 5 }] })
    expect(normal.version).toBe(1)
    expect(normal.size).toBe(512)
    expect(normal.palette).toBeNull()
    expect(normal.elements[0]?.id).toBe('element-1')
  })

  it('keeps the supplied ids and makes duplicates unique', () => {
    const normal = normaliseScene({
      elements: [
        { id: 'ring', type: 'circle', cx: 10, cy: 10, r: 5 },
        { id: 'ring', type: 'circle', cx: 20, cy: 20, r: 5 },
      ],
    })
    expect(normal.elements.map(element => element.id)).toEqual(['ring', 'ring-2'])
  })

  it('rejects unknown types and missing dimensions', () => {
    expect(() => normaliseScene({ elements: [{ type: 'triangle' }] })).toThrow(SceneError)
    expect(() =>
      normaliseScene({ elements: [{ type: 'rect', x: 0, y: 0, width: 0, height: 10 }] })
    ).toThrow(/greater than zero/)
  })

  it('rejects a scene with too many elements', () => {
    const elements = Array.from({ length: SCENE_MAX_ELEMENTS + 1 }, (_, index) => ({
      type: 'circle',
      cx: index,
      cy: 0,
      r: 1,
    }))
    expect(() => normaliseScene({ elements })).toThrow(/limit/)
  })

  it('truncates long text and removes characters the brain cannot draw', () => {
    const normal = normaliseScene({
      elements: [
        {
          type: 'text',
          text: 'a1b-2c',
          x: 0,
          y: 0,
          width: 100,
          height: 40,
        },
      ],
    })
    expect(normal.elements[0]).toMatchObject({ type: 'text', text: 'ABC' })
  })
})

describe('renderScene', () => {
  it('is deterministic', () => {
    expect(renderScene(scene())).toBe(renderScene(scene()))
  })

  it('emits a flat document with no paint servers or images', () => {
    const svg = renderScene(scene())
    for (const pattern of FORBIDDEN) {
      expect(svg, `forbidden ${pattern}`).not.toMatch(pattern)
    }
    expect(svg).toContain('<path')
    expect(svg).toContain('<circle')
  })

  it('resolves palette roles and recolours when the palette changes', () => {
    const first = renderScene({
      palette: 'ink-monolith',
      elements: [{ type: 'circle', cx: 50, cy: 50, r: 20, fill: 'accent' }],
    })
    const second = renderScene({
      palette: 'paper-ledger',
      elements: [{ type: 'circle', cx: 50, cy: 50, r: 20, fill: 'accent' }],
    })
    expect(first).not.toBe(second)
    expect(first).toMatch(/fill="#[0-9a-f]{6}"/i)
  })

  it('refuses a palette role without a palette', () => {
    expect(() =>
      renderScene({ elements: [{ type: 'circle', cx: 50, cy: 50, r: 20, fill: 'accent' }] })
    ).toThrow(/needs a palette/)
  })

  it('refuses unsafe paint and path data', () => {
    expect(() =>
      renderScene({
        elements: [{ type: 'circle', cx: 50, cy: 50, r: 20, fill: 'url(#gradient)' }],
      })
    ).toThrow(/unsafe colour/)

    expect(() =>
      renderScene({
        elements: [
          {
            type: 'path',
            d: 'M 0 0 L 10 10" onclick="alert(1)',
          },
        ],
      })
    ).toThrow(/path data/)
  })

  it('compiles text from outlines rather than a text element', () => {
    const svg = renderScene({
      palette: 'ink-monolith',
      font: 'inter-bold',
      elements: [
        { type: 'text', text: 'SIGIL', x: 40, y: 40, width: 400, height: 120, fill: 'primary' },
      ],
    })
    expect(svg).toContain('<path')
    expect(svg).not.toContain('<text')
    expect(svg).not.toContain('SIGIL')
  })

  it('fits an icon into its box', () => {
    const svg = renderScene({
      elements: [{ type: 'icon', key: 'rocket', x: 100, y: 100, size: 200 }],
    })
    expect(svg).toContain('<path')
    expect(svg).toMatch(/d="M[^"]+"/)
  })

  it('wraps transformed elements in a group', () => {
    const svg = renderScene({
      elements: [
        {
          type: 'rect',
          x: 100,
          y: 100,
          width: 100,
          height: 100,
          translate: [10, 20],
          rotate: 15,
          scale: 1.5,
        },
      ],
    })
    expect(svg).toContain('<g transform="translate(10 20) rotate(15 150 150)')
  })

  it('hides elements without dropping them from the document model', () => {
    const normal = normaliseScene({
      elements: [
        { type: 'circle', cx: 50, cy: 50, r: 20, hidden: true },
        { type: 'circle', cx: 100, cy: 100, r: 20 },
      ],
    })
    expect(normal.elements).toHaveLength(2)
    expect(sceneToSvgElements(normal)).toHaveLength(1)
  })
})

describe('sceneElementBounds', () => {
  it('reports the untransformed box', () => {
    const [rect] = normaliseScene({
      elements: [{ type: 'rect', x: 100, y: 200, width: 80, height: 40 }],
    }).elements
    expect(rect === undefined ? null : sceneElementBounds(rect)).toEqual({
      x: 100,
      y: 200,
      width: 80,
      height: 40,
    })
  })

  it('accounts for translate, rotation and scale', () => {
    const [rect] = normaliseScene({
      elements: [
        {
          type: 'rect',
          x: 100,
          y: 100,
          width: 100,
          height: 100,
          translate: [10, 20],
          rotate: 90,
          scale: 2,
        },
      ],
    }).elements
    // A square rotated by 90° is still its own bounding box; scaling about (150, 150) doubles it and
    // the translation moves it afterwards.
    expect(rect === undefined ? null : sceneElementBounds(rect)).toEqual({
      x: 60,
      y: 70,
      width: 200,
      height: 200,
    })
  })
})

describe('sceneFromLogo', () => {
  it('turns a generated concept into an editable scene with the same mark', () => {
    const logo = generateLogo({ name: 'Northwind', keywords: 'tech', seed: 2 })
    const imported = sceneFromLogo(logo, 'Northwind')
    expect(imported.title).toBe('Northwind')
    expect(imported.palette).toBe(logo.palette.id)
    expect(imported.font).toBe(logo.font.id)
    expect(imported.elements.length).toBeGreaterThan(0)
    expect(imported.elements.every(element => element.id !== '')).toBe(true)

    const svg = renderScene(imported)
    expect(svg).toContain('<svg')
    for (const pattern of FORBIDDEN) {
      expect(svg).not.toMatch(pattern)
    }
  })

  it('keeps an opaque background from the generated document', () => {
    const logo = generateLogo({ name: 'Northwind', background: true, seed: 2 })
    const imported = sceneFromLogo(logo)
    expect(imported.background).toBe(logo.palette.background)
    expect(renderScene(imported)).toContain('<rect x="0" y="0"')
  })
})

describe('duplicateSceneElement', () => {
  it('offsets the copy and leaves the original alone', () => {
    const [circle] = normaliseScene({
      elements: [{ type: 'circle', cx: 50, cy: 50, r: 10, translate: [2, 3] }],
    }).elements
    if (circle === undefined) {
      throw new Error('missing circle')
    }
    const copy = duplicateSceneElement(circle, 'copy')
    expect(copy.id).toBe('copy')
    expect(copy.translate).toEqual([14, 15])
    expect(circle.translate).toEqual([2, 3])
  })
})

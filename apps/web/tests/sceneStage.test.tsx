import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import { normaliseScene } from '@sigilgen/scene'
import { I18nProvider } from '../src/i18n/I18nProvider'
import { SceneStage } from '../src/components/stage/SceneStage'
import { useStudio } from '../src/store/useStudio'

/** A DOMRect from its edges, because jsdom reports every layout box as zero. */
function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  }
}

/** The stubbed layout: a 500px sheet and, for each scene group, a 100px box at 200,200. */
function stageRect(this: Element): DOMRect {
  if (this.tagName.toLowerCase() === 'svg') {
    return rect(0, 0, 500, 500)
  }
  if (this.matches('[data-scene-id]')) {
    return rect(200, 200, 100, 100)
  }
  return rect(0, 0, 0, 0)
}

/** Gives the sheet and each scene group a real layout. */
function stubGeometry(): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(stageRect)
  SVGSVGElement.prototype.setPointerCapture = () => {}
}

/** A scene whose only element is already centred on the sheet. */
function centredScene() {
  return normaliseScene({
    version: 1,
    size: 512,
    palette: 'ink-monolith',
    elements: [
      {
        id: 'rect-1',
        type: 'rect',
        x: 200,
        y: 200,
        width: 100,
        height: 100,
        fill: 'primary',
      },
    ],
  })
}

beforeEach(() => {
  localStorage.clear()
  act(() => {
    useStudio.setState({
      name: 'Acme',
      snap: true,
      mode: 'draw',
      scene: centredScene(),
      sceneSelection: null,
      sceneTool: 'select',
      past: [],
      future: [],
      zoom: 'fit',
      backdrop: 'light',
    })
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(SVGSVGElement.prototype, 'setPointerCapture')
})

describe('SceneStage', () => {
  it('snaps to the sheet centre, shows guides and records no edit', () => {
    stubGeometry()
    const { container } = render(
      <I18nProvider initialLocale="en">
        <SceneStage />
      </I18nProvider>
    )
    const svg = container.querySelector('svg') as SVGSVGElement
    const part = container.querySelector('[data-scene-id="rect-1"]') as SVGGElement

    fireEvent.pointerDown(part, { pointerId: 1, clientX: 250, clientY: 250 })
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 255, clientY: 255 })

    const lines = [...container.querySelectorAll('line')]
    expect(lines).toHaveLength(2)
    expect(useStudio.getState().scene?.elements[0]?.translate).toBeUndefined()
    expect(useStudio.getState().past).toHaveLength(0)

    fireEvent.pointerUp(svg, { pointerId: 1 })
    expect(container.querySelectorAll('line')).toHaveLength(0)
  })

  it('moves an element and applies the transform to the live document', () => {
    stubGeometry()
    const { container } = render(
      <I18nProvider initialLocale="en">
        <SceneStage />
      </I18nProvider>
    )
    const svg = container.querySelector('svg') as SVGSVGElement
    const part = container.querySelector('[data-scene-id="rect-1"]') as SVGGElement

    fireEvent.pointerDown(part, { pointerId: 1, clientX: 250, clientY: 250 })
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 270, clientY: 250 })

    const element = useStudio.getState().scene?.elements[0]
    expect(element?.translate?.[0]).toBeGreaterThan(0)
    const transform = container.querySelector('[data-scene-id] g')?.getAttribute('transform')
    expect(transform).toContain('translate(')
  })

  it('places a shape with the armed tool and returns to the pointer', () => {
    act(() => {
      useStudio.setState({
        scene: normaliseScene({ size: 512, palette: 'ink-monolith', elements: [] }),
        sceneTool: 'rect',
        sceneSelection: null,
      })
    })
    stubGeometry()
    const { container } = render(
      <I18nProvider initialLocale="en">
        <SceneStage />
      </I18nProvider>
    )
    const svg = container.querySelector('svg') as SVGSVGElement

    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 300, clientY: 300 })

    const state = useStudio.getState()
    expect(state.scene?.elements).toHaveLength(1)
    expect(state.scene?.elements[0]?.type).toBe('rect')
    expect(state.sceneSelection).toBe(state.scene?.elements[0]?.id)
    expect(state.sceneTool).toBe('select')
    expect(container.querySelector('[data-scene-id]')).not.toBeNull()
  })
})

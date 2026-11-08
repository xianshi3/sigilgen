import { beforeEach, describe, expect, it } from 'vitest'
import { act } from '@testing-library/react'
import { normaliseScene, renderScene, type SceneElement } from '@sigilgen/scene'
import { resizeScene } from '../src/lib/sceneEdit'
import { useStudio } from '../src/store/useStudio'
import { generate, type StudioConfig } from '../src/lib/generate'

/**
 * The drawing store.
 *
 * The scene is a document and the undo history covers it, so these cases are about the contract between
 * a canvas gesture, the immutable document and what survives a reload. Rendering itself is tested in
 * the library; here the question is whether the store hands the renderer the document it thinks it did.
 */

const CONFIG: StudioConfig = {
  name: 'Northwind Coffee',
  keywords: '',
  brief: '',
  engine: 'auto',
  palette: '',
  font: '',
  icon: '',
  size: 512,
  variations: 1,
  background: false,
  seed: 0,
  preferences: {},
}

function reset(): void {
  localStorage.clear()
  act(() => {
    useStudio.setState({
      ...CONFIG,
      activeConcept: 0,
      backdrop: 'light',
      theme: 'auto',
      zoom: 'fit',
      leftPanelOpen: true,
      rightPanelOpen: true,
      snap: true,
      mode: 'generate',
      scene: null,
      sceneSelection: null,
      sceneTool: 'select',
      edits: {},
      past: [],
      future: [],
      selectedPart: null,
      editMode: false,
    })
  })
}

function rect(id = 'rect-1'): SceneElement {
  return {
    id,
    type: 'rect',
    x: 100,
    y: 100,
    width: 120,
    height: 80,
    fill: 'primary',
  }
}

beforeEach(reset)

describe('scene document', () => {
  it('creates a blank scene on the chosen palette and switches workspace', () => {
    act(() => {
      useStudio.getState().createScene('ink-monolith')
    })
    const state = useStudio.getState()
    expect(state.mode).toBe('draw')
    expect(state.scene?.palette).toBe('ink-monolith')
    expect(state.scene?.elements).toEqual([])
  })

  it('adds an element, selects it, and returns the tool to the pointer', () => {
    act(() => {
      useStudio.getState().createScene('ink-monolith')
      useStudio.getState().setSceneTool('rect')
      useStudio.getState().addSceneElement(rect())
    })
    const state = useStudio.getState()
    expect(state.scene?.elements).toHaveLength(1)
    expect(state.sceneSelection).toBe('rect-1')
    expect(state.sceneTool).toBe('select')
  })

  it('updates an element without replacing its identity', () => {
    act(() => {
      useStudio.getState().createScene('ink-monolith')
      useStudio.getState().addSceneElement(rect())
      useStudio.getState().updateSceneElement('rect-1', { translate: [20, -10] })
    })
    expect(useStudio.getState().scene?.elements[0]).toMatchObject({
      id: 'rect-1',
      translate: [20, -10],
    })
  })

  it('duplicates, reorders and deletes elements', () => {
    act(() => {
      useStudio.getState().createScene('ink-monolith')
      useStudio.getState().addSceneElement(rect('rect-1'))
      useStudio.getState().addSceneElement(rect('rect-2'))
      useStudio.getState().moveSceneElement('rect-2', -1)
    })
    expect(useStudio.getState().scene?.elements.map(element => element.id)).toEqual([
      'rect-2',
      'rect-1',
    ])
    act(() => {
      useStudio.getState().duplicateSceneElementById('rect-1')
    })
    expect(useStudio.getState().scene?.elements).toHaveLength(3)
    expect(useStudio.getState().sceneSelection).toBe('rect-3')
    act(() => {
      useStudio.getState().removeSceneElement('rect-2')
    })
    expect(useStudio.getState().scene?.elements.map(element => element.id)).toEqual([
      'rect-1',
      'rect-3',
    ])
  })

  it('undoes and redoes scene edits together with the generated part edits', () => {
    act(() => {
      useStudio.getState().createScene('ink-monolith')
      useStudio.getState().addSceneElement(rect())
    })
    expect(useStudio.getState().scene?.elements).toHaveLength(1)
    act(() => useStudio.getState().undo())
    expect(useStudio.getState().scene?.elements).toHaveLength(0)
    act(() => useStudio.getState().redo())
    expect(useStudio.getState().scene?.elements).toHaveLength(1)
  })

  it('records one snapshot for a scene gesture', () => {
    act(() => {
      useStudio.getState().createScene('ink-monolith')
      useStudio.getState().addSceneElement(rect())
    })
    const before = useStudio.getState().past.length
    act(() => {
      useStudio.getState().beginEdit()
      useStudio.getState().updateSceneElement('rect-1', { translate: [10, 10] })
    })
    expect(useStudio.getState().past.length).toBe(before + 1)
  })

  it('imports a generated concept as editable paths', () => {
    const concept = generate(CONFIG).concepts[0]
    if (concept === undefined) {
      throw new Error('the test config produced no concept')
    }
    act(() => {
      useStudio.getState().importScene(concept, 'Northwind Coffee')
    })
    const state = useStudio.getState()
    expect(state.mode).toBe('draw')
    expect(state.scene?.title).toBe('Northwind Coffee')
    expect(state.scene?.palette).toBe(concept?.palette.id)
    expect(state.scene?.elements.length).toBeGreaterThan(0)
    expect(
      state.scene?.elements.every(element => element.type === 'path' || element.type === 'rect')
    ).toBe(true)
  })

  it('recolours roles when the scene palette changes', () => {
    act(() => {
      useStudio.getState().createScene('ink-monolith')
      useStudio.getState().addSceneElement({
        id: 'dot',
        type: 'circle',
        cx: 100,
        cy: 100,
        r: 20,
        fill: 'accent',
      })
    })
    const before = renderScene(useStudio.getState().scene)
    act(() => {
      useStudio.getState().setScenePalette('paper-ledger')
    })
    const after = renderScene(useStudio.getState().scene)
    expect(after).not.toBe(before)
    expect(after).toContain('fill="')
  })

  it('scales the drawing when the canvas size changes', () => {
    act(() => {
      useStudio.getState().createScene('ink-monolith')
      useStudio.getState().addSceneElement({
        id: 'dot',
        type: 'circle',
        cx: 100,
        cy: 100,
        r: 20,
      })
      useStudio.getState().setSceneSize(1024)
    })
    const scene = useStudio.getState().scene
    expect(scene?.size).toBe(1024)
    expect(scene?.elements[0]).toMatchObject({ cx: 200, cy: 200, r: 40 })
  })

  it('scales path data with the canvas', () => {
    const scene = normaliseScene({
      size: 512,
      elements: [{ type: 'path', d: 'M 0 0 L 10 10 Z', fill: '#000' }],
    })
    const resized = resizeScene(scene, 1024)
    expect(resized.size).toBe(1024)
    const element = resized.elements[0]
    expect(element?.type).toBe('path')
    if (element?.type === 'path') {
      expect(element.d).toContain('20')
    }
  })

  it('persists the workspace and the scene', () => {
    act(() => {
      useStudio.getState().createScene('ink-monolith')
      useStudio.getState().addSceneElement(rect())
      useStudio.getState().setMode('draw')
    })
    const stored = JSON.parse(localStorage.getItem('sigilgen.studio') as string).state
    expect(stored.mode).toBe('draw')
    expect(stored.scene.palette).toBe('ink-monolith')
    expect(stored.scene.elements).toHaveLength(1)
  })

  it('drops a persisted scene that is not a valid document', async () => {
    localStorage.setItem(
      'sigilgen.studio',
      JSON.stringify({ state: { scene: { elements: [{ type: 'triangle' }] }, mode: 'draw' } })
    )
    await act(async () => {
      await useStudio.persist.rehydrate()
    })
    expect(useStudio.getState().scene).toBeNull()
    expect(useStudio.getState().mode).toBe('draw')
  })
})

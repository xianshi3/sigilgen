import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from '@testing-library/react'
import { useStudio } from '../src/store/useStudio'
import { fileStem } from '../src/lib/export'
import { generate, type StudioConfig } from '../src/lib/generate'

/**
 * The store, the persistence contract and the browser-only helpers.
 *
 * This is the surface that had no tests at all: everything here touches `localStorage`, the clipboard or
 * the DOM, none of which the library's `node`-environment suite can reach. Each assertion below was
 * written because the behaviour is easy to get wrong and impossible to notice by reading.
 */

const CONFIG: StudioConfig = {
  name: 'Acme',
  keywords: 'tech, minimal',
  brief: '',
  engine: 'auto',
  palette: '',
  font: '',
  icon: '',
  size: 512,
  variations: 3,
  background: false,
  seed: 0,
  preferences: {},
}

/** Resets the store to a known state and clears storage between tests. */
beforeEach(() => {
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
    })
  })
})

describe('preferences', () => {
  it('stores absence rather than a sentinel when a dimension is released', () => {
    act(() => useStudio.getState().setPreference('container', 'circle'))
    expect(useStudio.getState().preferences.container).toBe('circle')

    act(() => useStudio.getState().setPreference('container', 'random'))
    // The generator's contract is absence, so a released control has to be indistinguishable from one
    // that was never touched. Storing `'random'` would be passed to the engine as a request for a
    // container called "random", which it silently ignores — so the result would be right by accident.
    expect('container' in useStudio.getState().preferences).toBe(false)
  })

  it('releases only the dimension it was asked to', () => {
    act(() => {
      useStudio.getState().setPreference('container', 'circle')
      useStudio.getState().setPreference('frame', 'hexagon')
    })
    act(() => useStudio.getState().setPreference('container', 'random'))
    expect(useStudio.getState().preferences).toEqual({ frame: 'hexagon' })
  })

  it('replaces a pinned value rather than accumulating one per dimension', () => {
    act(() => useStudio.getState().setPreference('container', 'circle'))
    act(() => useStudio.getState().setPreference('container', 'shield'))
    expect(useStudio.getState().preferences.container).toBe('shield')
    expect(Object.keys(useStudio.getState().preferences)).toHaveLength(1)
  })

  it('reaches the generator as a preference rather than being dropped', () => {
    act(() => useStudio.getState().setPreference('mode', 'aperture'))
    const result = generate({
      ...CONFIG,
      engine: 'abstract',
      preferences: useStudio.getState().preferences,
    })
    expect(result.errorKey).toBeNull()
    expect(result.concepts[0]?.conceptNotes.join(' ')).toContain('Abstract "aperture"')
  })
})

describe('reroll', () => {
  it('lands on a different set of concepts every press', () => {
    // The seed feeds the hash rather than a counter, so an increment has to move somewhere unrelated.
    // A counter would walk the space in order, which a reader would notice as a pattern.
    const first = generate(useStudio.getState())
    act(() => useStudio.getState().reroll())
    const second = generate(useStudio.getState())
    expect(second.concepts.map(c => c.svg)).not.toEqual(first.concepts.map(c => c.svg))
  })

  it('returns to the first concept, because the strip is showing a different one', () => {
    act(() => useStudio.setState({ activeConcept: 2 }))
    act(() => useStudio.getState().reroll())
    expect(useStudio.getState().activeConcept).toBe(0)
  })

  it("leaves the reader's own decisions alone", () => {
    act(() => useStudio.getState().setPreference('container', 'circle'))
    act(() => useStudio.getState().reroll())
    expect(useStudio.getState().preferences.container).toBe('circle')
    expect(useStudio.getState().name).toBe('Acme')
  })
})

describe('zoom', () => {
  it('steps away from fit at actual size', () => {
    // Scaling the invisible fit result would produce steps that mean nothing to the reader; 1× is the
    // only zoom a person can reason about.
    act(() => useStudio.getState().zoomBy(1))
    expect(useStudio.getState().zoom).toBe(2)
  })

  it('never leaves the supported range', () => {
    // Stepping from `fit` lands on 1× first, because actual size is the only zoom a reader can reason
    // about; the clamp is what stops a held-down key running off the end.
    act(() => useStudio.getState().zoomBy(0))
    expect(useStudio.getState().zoom).toBe(1)
    act(() => useStudio.getState().zoomBy(99))
    expect(useStudio.getState().zoom).toBe(4)
    act(() => useStudio.getState().zoomBy(-99))
    expect(useStudio.getState().zoom).toBe(0.25)
  })

  it('keeps a fractional zoom rather than rounding it away', () => {
    act(() => useStudio.getState().setZoom(1.37))
    act(() => useStudio.getState().zoomBy(0.13))
    expect(useStudio.getState().zoom).toBe(1.5)
  })
})

describe('persistence', () => {
  it('keeps the design and the two viewing preferences across a reload', () => {
    act(() => {
      useStudio.getState().setField('name', 'Northwind')
      useStudio.getState().setTheme('dark')
      useStudio.getState().setBackdrop('board')
      useStudio.getState().setPreference('frame', 'shield')
    })
    const raw = localStorage.getItem('sigilgen.studio')
    expect(raw).not.toBeNull()
    const stored = JSON.parse(raw as string).state
    expect(stored.name).toBe('Northwind')
    expect(stored.theme).toBe('dark')
    expect(stored.backdrop).toBe('board')
    expect(stored.preferences.frame).toBe('shield')
  })

  it('does not persist transient interface state', () => {
    // Which panel is open, which concept is selected and the zoom are deliberately left out, so the app
    // always opens the way it is meant to be used rather than the way it happened to be left.
    act(() => {
      useStudio.getState().setActiveConcept(2)
      useStudio.getState().setZoom(3)
      useStudio.getState().toggleLeftPanel()
    })
    const stored = JSON.parse(localStorage.getItem('sigilgen.studio') as string).state
    expect(stored.activeConcept).toBeUndefined()
    expect(stored.zoom).toBeUndefined()
    expect(stored.leftPanelOpen).toBeUndefined()
  })

  it('does not persist the actions themselves', () => {
    // Zustand's `persist` serialises the whole state object by default. Leaving the setters in storage
    // would mean JSON.parse produced function-shaped garbage, and a stale closure would be revived.
    const stored = JSON.parse(localStorage.getItem('sigilgen.studio') as string).state
    for (const key of Object.keys(stored)) {
      expect([
        'setField',
        'setActiveConcept',
        'setBackdrop',
        'setTheme',
        'setZoom',
        'zoomBy',
        'toggleLeftPanel',
        'toggleRightPanel',
        'setPreference',
        'reroll',
      ]).not.toContain(key)
    }
  })

  it('survives storage that holds something unrecognisable', () => {
    // A reader with an older build's data, or a hand-edited one, must not stop the app from opening.
    localStorage.setItem(
      'sigilgen.studio',
      '{"state":{"name":42,"preferences":"nonsense"},"version":0}'
    )
    expect(() => useStudio.persist.rehydrate()).not.toThrow()
  })
})

describe('generation', () => {
  it('shows nothing rather than an error for an empty name', () => {
    // An empty field is the state the app opens in as the reader types; it is not an error condition.
    const result = generate({ ...CONFIG, name: '   ' })
    expect(result.concepts).toEqual([])
    expect(result.errorKey).toBeNull()
    expect(result.errorDetail).toBeNull()
  })

  it('translates the errors a reader can actually cause', () => {
    expect(generate({ ...CONFIG, name: '!!!' }).errorKey).toBe('error.noLetters')
    expect(generate({ ...CONFIG, name: 'a'.repeat(200) }).errorKey).toBe('error.tooLong')
  })

  it('never leaves the reader looking at a raw English sentence', () => {
    // `classify` returns null for anything it does not recognise, and the interface then shows the
    // library's own wording. Better that than a blank stage, but it should be a rare path.
    const result = generate({ ...CONFIG, name: 'x'.repeat(20), engine: 'abstract' })
    expect(result.errorKey).toBeNull()
    for (const config of [CONFIG, { ...CONFIG, name: '!' }, { ...CONFIG, name: 'a'.repeat(200) }]) {
      const outcome = generate(config)
      expect(outcome.errorDetail ?? '').not.toMatch(/TypeError/)
    }
  })

  it('produces the number of concepts asked for', () => {
    expect(generate({ ...CONFIG, variations: 1 }).concepts).toHaveLength(1)
    expect(generate({ ...CONFIG, variations: 6 }).concepts).toHaveLength(6)
  })
})

describe('file names', () => {
  it('makes a stem that is safe on every platform', () => {
    expect(fileStem('Northwind Labs')).toBe('northwind-labs')
    expect(fileStem('  Café  Über  ')).toBe('cafe-uber')
    expect(fileStem('a//b\\c')).toBe('a-b-c')
  })

  it('does not collapse two different names onto one file', () => {
    // Folding a diacritic deliberately converges the accented and unaccented spellings of the *same*
    // word — "Café" and "Cafe" are one brand to a reader. What must not happen is losing the letter the
    // accent was on: that turned "Café Über" into `caf-ber`, and would let two different names collide.
    expect(fileStem('Café')).toBe('cafe')
    expect(fileStem('Café')).not.toBe(fileStem('Bär'))
    expect(fileStem('Émile Zola')).toBe('emile-zola')
  })

  it('falls back rather than producing a nameless file', () => {
    // An empty stem gives the browser its own default name, so the download lands as `download.svg` or
    // worse, with the extension attached to nothing.
    expect(fileStem('')).toBe('logo')
    expect(fileStem('!!!')).toBe('logo')
    expect(fileStem('   ')).toBe('logo')
  })

  it('does not leave a leading or trailing hyphen', () => {
    expect(fileStem('-lead')).toBe('lead')
    expect(fileStem('trail-')).toBe('trail')
  })
})

describe('clipboard', () => {
  it('reports failure honestly instead of pretending', async () => {
    // The legacy fallback needs a document; without one both paths must fail, and the interface has to
    // be able to say so rather than showing a success message that did not happen.
    const { copyText } = await import('../src/lib/export')
    const original = navigator.clipboard
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    try {
      await expect(copyText('hello')).resolves.toBe(false)
    } finally {
      Object.defineProperty(navigator, 'clipboard', { value: original, configurable: true })
    }
  })

  it('uses the modern API when it is available', async () => {
    const { copyText } = await import('../src/lib/export')
    const writeText = vi.fn().mockResolvedValue(null)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await expect(copyText('hello')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('hello')
  })
})

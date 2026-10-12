import { beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '../src/i18n/I18nProvider'
import { useHotkeys } from '../src/hooks/useHotkeys'
import { useStudio } from '../src/store/useStudio'
import { generate } from '../src/lib/generate'

/**
 * Keyboard shortcuts.
 *
 * The risk in a shortcut layer is not that a chord does nothing — it is that a chord does something the
 * reader did not ask for. Both of those failure modes are asserted here: the shortcuts fire when the
 * stage has focus, and stay silent inside a text field, where the same key means something else entirely.
 */

/** Mounts the hook over a state seeded for each case. */
function withHotkeys(count: number): void {
  function Harness(): null {
    useHotkeys(count)
    return null
  }
  render(
    <I18nProvider initialLocale="en">
      <Harness />
    </I18nProvider>
  )
}

/** A fresh studio, so no case inherits another's seed, history or selection. */
function resetStudio(): void {
  act(() => {
    useStudio.setState({
      activeConcept: 0,
      zoom: 'fit',
      editMode: false,
      selectedPart: null,
      leftPanelOpen: false,
      rightPanelOpen: false,
      past: [],
      future: [],
      seed: 0,
    })
  })
}

beforeEach(() => {
  localStorage.clear()
  resetStudio()
})

describe('shortcuts', () => {
  it('picks a concept by number', async () => {
    withHotkeys(3)
    const user = userEvent.setup()
    await user.keyboard('3')
    expect(useStudio.getState().activeConcept).toBe(2)
  })

  it('ignores a number that names a concept which does not exist', async () => {
    // Silently selecting nothing is better than wrapping round to an index the reader did not ask for.
    withHotkeys(3)
    const user = userEvent.setup()
    await user.keyboard('5')
    expect(useStudio.getState().activeConcept).toBe(0)
  })

  it('steps between concepts and stops at the ends', async () => {
    withHotkeys(3)
    const user = userEvent.setup()
    await user.keyboard('.')
    expect(useStudio.getState().activeConcept).toBe(1)
    await user.keyboard('.')
    expect(useStudio.getState().activeConcept).toBe(2)
    // Already on the last one: stays there rather than wrapping.
    await user.keyboard('.')
    expect(useStudio.getState().activeConcept).toBe(2)
    await user.keyboard(',')
    expect(useStudio.getState().activeConcept).toBe(1)
    await user.keyboard(',')
    await user.keyboard(',')
    expect(useStudio.getState().activeConcept).toBe(0)
  })

  it('zooms in and out, and returns to fitting the window', async () => {
    withHotkeys(3)
    const user = userEvent.setup()
    await user.keyboard('=')
    expect(useStudio.getState().zoom).toBeCloseTo(1.25)
    await user.keyboard('-')
    expect(useStudio.getState().zoom).toBeCloseTo(1)
    await user.keyboard('0')
    expect(useStudio.getState().zoom).toBe('fit')
  })

  it('steps down from fit rather than from a value that does not exist yet', async () => {
    // `fit` is not a multiplier, so the first press has to read it as the sheet it is showing.
    withHotkeys(3)
    const user = userEvent.setup()
    await user.keyboard('-')
    expect(useStudio.getState().zoom).toBeCloseTo(0.75)
  })

  it('rerolls and toggles edit mode', async () => {
    withHotkeys(3)
    const user = userEvent.setup()
    const before = useStudio.getState().seed
    await user.keyboard('r')
    expect(useStudio.getState().seed).not.toBe(before)
    await user.keyboard('e')
    expect(useStudio.getState().editMode).toBe(true)
    await user.keyboard('e')
    expect(useStudio.getState().editMode).toBe(false)
  })

  it('undoes and redoes an edit', async () => {
    const concept = generate({ name: 'Northwind', variations: 1, seed: 1 }).concepts[0]
    if (concept === undefined) {
      throw new Error('expected a concept')
    }
    act(() => {
      useStudio.setState({
        past: [
          { seed: concept.seed, edits: {} },
          { seed: concept.seed, edits: { 0: { dx: 10 } } },
        ],
        future: [],
      })
    })
    withHotkeys(1)
    const user = userEvent.setup()
    await user.keyboard('{Control>}z{/Control}')
    expect(useStudio.getState().edits).toEqual({ 0: { dx: 10 } })
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
    expect(useStudio.getState().edits).toEqual({})
  })

  it('closes a drawer on Escape, and clears a selection only once nothing covers the mark', async () => {
    // A drawer is covering the artwork, so it is the thing Escape should dismiss. A selection behind it
    // is not visible, and dismissing it first would leave the reader with no way back to the drawer.
    withHotkeys(3)
    const user = userEvent.setup()
    act(() => {
      useStudio.setState({ leftPanelOpen: true, selectedPart: 0 })
    })
    await user.keyboard('{Escape}')
    expect(useStudio.getState().leftPanelOpen).toBe(false)
    expect(useStudio.getState().selectedPart).toBe(0)

    await user.keyboard('{Escape}')
    expect(useStudio.getState().selectedPart).toBeNull()
  })
})

describe('shortcuts stay out of the way', () => {
  it('does not fire while a field has focus', async () => {
    // The whole point of the guard: `Cmd/Ctrl+Z` in the brand-name box is "undo my typing", and a bare
    // digit typed into a field is a digit, not a concept index.
    withHotkeys(3)
    render(
      <I18nProvider initialLocale="en">
        <label htmlFor="probe">
          Brand name
          <input id="probe" defaultValue="Acme" />
        </label>
      </I18nProvider>
    )
    const user = userEvent.setup()
    const field = screen.getByLabelText('Brand name')
    await user.click(field)
    await user.keyboard('2')
    expect(useStudio.getState().activeConcept).toBe(0)
    expect((field as HTMLInputElement).value).toBe('Acme2')
  })

  it('leaves the browser its own chords', async () => {
    // `Cmd/Ctrl+R` is reload and `Cmd/Ctrl+C` is copy. Intercepting either would be the app deciding it
    // knows better than the reader.
    withHotkeys(3)
    const user = userEvent.setup()
    const before = useStudio.getState().seed
    await user.keyboard('{Control>}r{/Control}')
    expect(useStudio.getState().seed).toBe(before)
  })
})

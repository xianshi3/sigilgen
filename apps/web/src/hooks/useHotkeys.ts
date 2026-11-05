import { useEffect } from 'react'
import { isTypingTarget } from '../lib/typing'
import { useStudio } from '../store/useStudio'

/**
 * Keyboard shortcuts for the things a reader reaches for repeatedly.
 *
 * Every one of these is also reachable by pointer, so nothing here is the only route to a capability —
 * that matters, because a shortcut nobody can discover is not an affordance, it is a secret. The set is
 * the one a design tool is expected to have: undo and redo, pick a concept by number, step between
 * concepts, zoom, reroll, and leave edit mode.
 *
 * Two guards do the real work, and both are about not stealing keys from whatever the reader is actually
 * doing:
 *
 *   - Keys pressed inside a field belong to the field. `Cmd/Ctrl+Z` in the brand-name box is "undo my
 *     typing", not "undo my last edit to a path". Without this a single keystroke would silently rewrite
 *     the design.
 *   - `Escape` is handled at the window rather than on a control, because the thing to dismiss may be a
 *     drawer, a selection, or a focused control, and which one is a question about the whole app.
 *
 * @param conceptCount - How many concepts currently exist. A digit only selects a concept that is really
 * there, so `4` on a three-concept run does nothing rather than selecting nothing silently.
 */
export function useHotkeys(conceptCount: number): void {
  useEffect(() => {
    /**
     * @param event - The key press.
     */
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isTypingTarget(event.target)) {
        return
      }

      const mod = event.metaKey || event.ctrlKey
      const key = event.key

      // Undo and redo come first: they are the two that carry a modifier, and the two whose chord a
      // reader will already know. Both no-op when there is nothing to undo, so there is nothing to
      // disable and no reason to intercept the browser's own undo for the page.
      if (mod && key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          useStudio.getState().redo()
        } else {
          useStudio.getState().undo()
        }
        return
      }
      if (mod) {
        // Any other chord belongs to the browser: refresh, copy, devtools and the rest.
        return
      }

      // Escape is a dismissal, so it is answered before anything else can claim it.
      if (key === 'Escape') {
        const state = useStudio.getState()
        if (state.leftPanelOpen || state.rightPanelOpen) {
          state.setLeftPanelOpen(false)
          state.setRightPanelOpen(false)
        } else if (state.selectedPart !== null) {
          state.selectPart(null)
        }
        return
      }

      if (key >= '1' && key <= '9') {
        const index = Number(key) - 1
        if (index < conceptCount) {
          event.preventDefault()
          useStudio.getState().setActiveConcept(index)
        }
        return
      }

      const state = useStudio.getState()

      switch (key) {
        case ',':
          if (state.activeConcept > 0) {
            event.preventDefault()
            state.setActiveConcept(state.activeConcept - 1)
          }
          return
        case '.':
          if (state.activeConcept < conceptCount - 1) {
            event.preventDefault()
            state.setActiveConcept(state.activeConcept + 1)
          }
          return
        case '-':
        case '_':
          // `zoomBy` already reads `fit` as 100%, so the first press steps down from the sheet rather
          // than from a value that does not exist yet.
          event.preventDefault()
          state.zoomBy(-0.25)
          return
        case '=':
        case '+':
          event.preventDefault()
          state.zoomBy(0.25)
          return
        case '0':
          event.preventDefault()
          state.setZoom('fit')
          return
        case 'r':
        case 'R':
          event.preventDefault()
          state.reroll()
          return
        case 'e':
        case 'E':
          event.preventDefault()
          state.setEditMode(!state.editMode)
          return
        default:
          return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [conceptCount])
}

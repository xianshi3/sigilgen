import { useEffect } from 'react'
import type { LogoResult } from '@sigilgen/types'
import { renderScene } from '@sigilgen/scene'
import { desktopBridge } from '../lib/desktop'
import { downloadSvg, fileStem, saveSvg } from '../lib/export'
import { applyEdits } from '../lib/svgParts'
import { isTypingTarget } from '../lib/typing'
import { useStudio } from '../store/useStudio'

/**
 * Connects the native menu to the studio.
 *
 * The menu's Save item has to export the concept that is on screen, edits included, and its Undo/Redo
 * items have to respect the same rule the keyboard shortcut does: inside a field they mean "undo my
 * typing", everywhere else they mean "undo my edit". Keeping that decision here rather than in the main
 * process means the menu and the shortcut cannot disagree.
 *
 * @param concept - The concept currently on screen, if any.
 * @param name - The brand name, used for the suggested file name.
 */
export function useDesktopCommands(concept: LogoResult | undefined, name: string): void {
  useEffect(() => {
    const bridge = desktopBridge()
    if (bridge === null) {
      return
    }
    return bridge.onMenuAction(action => {
      const state = useStudio.getState()
      if (action === 'save') {
        if (state.mode === 'draw') {
          if (state.scene === null) {
            return
          }
          void saveSvg(
            `${fileStem(state.scene.title?.trim() || name || 'scene')}.svg`,
            renderScene(state.scene)
          )
          return
        }
        if (concept === undefined) {
          return
        }
        const edits = state.edits[concept.seed] ?? []
        void downloadSvg(concept, fileStem(name), applyEdits(concept.svg, edits))
        return
      }

      if (isTypingTarget(document.activeElement)) {
        // Chromium still implements the editing commands for focused fields, and the menu item has
        // already swallowed the shortcut before the page sees it.
        document.execCommand(action === 'undo' ? 'undo' : 'redo')
        return
      }

      if (action === 'undo') {
        state.undo()
      } else {
        state.redo()
      }
    })
  }, [concept, name])
}

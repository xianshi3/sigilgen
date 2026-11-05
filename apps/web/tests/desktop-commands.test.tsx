import type { LogoResult } from '@sigilgen/types'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDesktopCommands } from '../src/hooks/useDesktopCommands'
import type { DesktopBridge, MenuAction } from '../src/lib/desktop'
import { useStudio } from '../src/store/useStudio'

/**
 * The native menu's route into the studio.
 *
 * The menu lives in the main process, but the decisions it carries are the renderer's: Save must export
 * the concept on screen with its edits, and Undo in a text field must stay a text undo. These tests pin
 * that split without launching Electron.
 */

/**
 * A complete bridge stub with the menu subscription captured.
 *
 * @returns The bridge and a way to dispatch a menu action.
 */
function menuBridge(): { bridge: DesktopBridge; dispatch: (action: MenuAction) => void } {
  let listener: ((action: MenuAction) => void) | undefined
  const bridge: DesktopBridge = {
    platform: 'win32',
    saveSvg: vi.fn(async () => ({ saved: true, filePath: 'C:/acme.svg' })),
    copyText: vi.fn(async () => true),
    onFullScreenChange: vi.fn(() => () => {}),
    onMenuAction: vi.fn(callback => {
      listener = callback
      return () => {}
    }),
    setTitlebarTheme: vi.fn(),
  }
  return {
    bridge,
    dispatch: action => {
      listener?.(action)
    },
  }
}

/** The smallest concept the save path needs: a seed and some bytes. */
const CONCEPT = {
  seed: 'test-seed',
  svg: '<svg><rect width="10" height="10"/></svg>',
} as LogoResult

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  delete window.sigilgenDesktop
  vi.restoreAllMocks()
})

describe('useDesktopCommands', () => {
  it('saves the active concept through the native dialog', async () => {
    const { bridge, dispatch } = menuBridge()
    window.sigilgenDesktop = bridge
    render(<Harness />)

    await act(async () => {
      dispatch('save')
    })

    expect(bridge.saveSvg).toHaveBeenCalledTimes(1)
    const [name, contents] = vi.mocked(bridge.saveSvg).mock.calls[0] ?? []
    expect(name).toBe('acme.svg')
    expect(contents).toContain('<svg')
  })

  it('routes undo to the studio when the page has focus', () => {
    const { bridge, dispatch } = menuBridge()
    window.sigilgenDesktop = bridge
    const undo = vi.spyOn(useStudio.getState(), 'undo').mockImplementation(() => {})
    render(<Harness />)

    act(() => {
      dispatch('undo')
    })

    expect(undo).toHaveBeenCalledTimes(1)
  })

  it('leaves undo to a focused field, so typing is not rewritten as a design edit', () => {
    const { bridge, dispatch } = menuBridge()
    window.sigilgenDesktop = bridge
    const execCommand = vi.fn(() => true)
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand })
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    render(<Harness />)

    act(() => {
      dispatch('undo')
    })

    expect(execCommand).toHaveBeenCalledWith('undo')
    input.remove()
  })
})

/** A component whose only job is to install the hook. */
function Harness() {
  useDesktopCommands(CONCEPT, 'Acme')
  return null
}

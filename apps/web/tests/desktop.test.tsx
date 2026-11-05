import type { LogoResult } from '@sigilgen/types'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WindowChrome } from '../src/components/chrome/WindowChrome'
import type { DesktopBridge } from '../src/lib/desktop'
import { copyText, downloadSvg } from '../src/lib/export'

/**
 * The desktop contract as the studio sees it.
 *
 * These assertions are about the boundary rather than the pixels: a browser with no bridge must keep
 * working, a Linux window must not show a strip that has no native buttons behind it, and Save must go
 * through the native dialog instead of the browser's download folder.
 */

/**
 * Builds a complete bridge stub, so a test only states the member it cares about.
 *
 * @param overrides - Members to replace.
 * @returns A bridge whose remaining calls succeed quietly.
 */
function createBridge(overrides: Partial<DesktopBridge> = {}): DesktopBridge {
  return {
    platform: 'win32',
    saveSvg: vi.fn(async () => ({ saved: true, filePath: 'C:/acme.svg' })),
    copyText: vi.fn(async () => true),
    onFullScreenChange: vi.fn(() => () => {}),
    onMenuAction: vi.fn(() => () => {}),
    setTitlebarTheme: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  // jsdom has no canvas implementation; the colour helper falls back to black, and the fallback is
  // what these tests want to exercise anyway.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

afterEach(() => {
  delete window.sigilgenDesktop
  vi.restoreAllMocks()
})

describe('WindowChrome', () => {
  it('paints a drag strip on Windows and themes the native caption buttons', () => {
    window.sigilgenDesktop = createBridge()
    render(<WindowChrome />)

    expect(screen.getByTestId('window-chrome')).toBeInTheDocument()
    expect(window.sigilgenDesktop.setTitlebarTheme).toHaveBeenCalled()
  })

  it('keeps the strip on macOS, where traffic lights occupy the left edge', () => {
    window.sigilgenDesktop = createBridge({ platform: 'darwin' })
    render(<WindowChrome />)

    expect(screen.getByTestId('window-chrome')).toBeInTheDocument()
  })

  it('renders nothing on Linux, which keeps its ordinary window frame', () => {
    window.sigilgenDesktop = createBridge({ platform: 'linux' })
    render(<WindowChrome />)

    expect(screen.queryByTestId('window-chrome')).toBeNull()
  })

  it('hides itself while the window is full screen', () => {
    let notify: ((fullscreen: boolean) => void) | undefined
    const bridge = createBridge({
      onFullScreenChange: listener => {
        notify = listener
        return () => {}
      },
    })
    window.sigilgenDesktop = bridge
    render(<WindowChrome />)

    act(() => {
      notify?.(true)
    })

    expect(screen.queryByTestId('window-chrome')).toBeNull()
  })

  it('stays absent in a browser', () => {
    render(<WindowChrome />)
    expect(screen.queryByTestId('window-chrome')).toBeNull()
  })
})

describe('native export', () => {
  it('saves through the bridge instead of the browser download path', async () => {
    const bridge = createBridge()
    window.sigilgenDesktop = bridge

    await expect(
      downloadSvg({ svg: '<svg/>' } as LogoResult, 'acme', '<svg>edited</svg>')
    ).resolves.toBe(true)
    expect(bridge.saveSvg).toHaveBeenCalledWith('acme.svg', '<svg>edited</svg>')
  })

  it('reports a cancelled dialog without claiming success', async () => {
    window.sigilgenDesktop = createBridge({ saveSvg: vi.fn(async () => ({ saved: false })) })

    await expect(downloadSvg({ svg: '<svg/>' } as LogoResult, 'acme')).resolves.toBe(false)
  })

  it('uses the native clipboard when one is available', async () => {
    const bridge = createBridge()
    window.sigilgenDesktop = bridge

    await expect(copyText('<svg/>')).resolves.toBe(true)
    expect(bridge.copyText).toHaveBeenCalledWith('<svg/>')
  })
})

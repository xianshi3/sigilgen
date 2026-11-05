import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  restoreWindowState,
  type DisplayArea,
  type Rect,
} from '../src/main/window-state'

/**
 * The rules that stop a saved window from opening somewhere the reader cannot reach it.
 *
 * Each case is a machine the window can plausibly be carried between: a laptop after a 4K monitor, a
 * second display that is no longer plugged in, a state file edited by hand.
 */

/** The primary display used by most cases: 1920 × 1080 with no taskbar. */
const PRIMARY: Rect = { x: 0, y: 0, width: 1920, height: 1080 }

/**
 * Builds a display entry from its work area.
 *
 * @param x - Left edge.
 * @param y - Top edge.
 * @param width - Width.
 * @param height - Height.
 * @returns A display area.
 */
function display(x: number, y: number, width: number, height: number): DisplayArea {
  return { workArea: { x, y, width, height } }
}

describe('restoreWindowState', () => {
  it('centres the default window when there is no saved state', () => {
    expect(restoreWindowState(null, [display(0, 0, 1920, 1080)], PRIMARY)).toEqual({
      bounds: {
        x: (1920 - DEFAULT_WINDOW_WIDTH) / 2,
        y: (1080 - DEFAULT_WINDOW_HEIGHT) / 2,
        width: DEFAULT_WINDOW_WIDTH,
        height: DEFAULT_WINDOW_HEIGHT,
      },
      maximized: false,
    })
  })

  it('clamps a window smaller than the studio can use', () => {
    const restored = restoreWindowState(
      { width: 400, height: 300, maximized: false },
      [display(0, 0, 1920, 1080)],
      PRIMARY
    )

    expect(restored.bounds.width).toBe(MIN_WINDOW_WIDTH)
    expect(restored.bounds.height).toBe(MIN_WINDOW_HEIGHT)
    expect(restored.bounds.x).toBe((1920 - MIN_WINDOW_WIDTH) / 2)
    expect(restored.bounds.y).toBe((1080 - MIN_WINDOW_HEIGHT) / 2)
  })

  it('keeps a position that is still on a connected display', () => {
    const restored = restoreWindowState(
      { x: 100, y: 80, width: 1200, height: 800, maximized: false },
      [display(0, 0, 1920, 1080)],
      PRIMARY
    )

    expect(restored.bounds).toEqual({ x: 100, y: 80, width: 1200, height: 800 })
  })

  it('recentres a window saved on a display that is gone', () => {
    const restored = restoreWindowState(
      { x: 5000, y: 3000, width: 1200, height: 800, maximized: false },
      [display(0, 0, 1920, 1080)],
      PRIMARY
    )

    expect(restored.bounds.x).toBe((1920 - 1200) / 2)
    expect(restored.bounds.y).toBe((1080 - 800) / 2)
  })

  it('recentres when only a sliver would remain reachable', () => {
    const restored = restoreWindowState(
      { x: 1850, y: 100, width: 1200, height: 800, maximized: false },
      [display(0, 0, 1920, 1080)],
      PRIMARY
    )

    expect(restored.bounds.x).toBe((1920 - 1200) / 2)
  })

  it('keeps a title bar that is barely but genuinely reachable', () => {
    const restored = restoreWindowState(
      { x: 1800, y: 1000, width: 1200, height: 800, maximized: true },
      [display(0, 0, 1920, 1080)],
      PRIMARY
    )

    expect(restored.bounds).toEqual({ x: 1800, y: 1000, width: 1200, height: 800 })
    expect(restored.maximized).toBe(true)
  })

  it('shrinks a window saved on a larger display', () => {
    const restored = restoreWindowState(
      { width: 3000, height: 2000, maximized: false },
      [display(0, 0, 1920, 1080)],
      PRIMARY
    )

    expect(restored.bounds.width).toBe(1920)
    expect(restored.bounds.height).toBe(1080)
  })

  it('can use a second display as its reference for the size ceiling', () => {
    const restored = restoreWindowState(
      { width: 3000, height: 2000, maximized: false },
      [display(0, 0, 1920, 1080), display(1920, 0, 2560, 1440)],
      PRIMARY
    )

    expect(restored.bounds.width).toBe(2560)
    expect(restored.bounds.height).toBe(1440)
  })

  it('treats hand-edited rubbish as a first run', () => {
    const restored = restoreWindowState(
      { x: 'left', y: null, width: Number.NaN, height: 'tall', maximized: 'yes' },
      [display(0, 0, 1920, 1080)],
      PRIMARY
    )

    expect(restored.bounds.width).toBe(DEFAULT_WINDOW_WIDTH)
    expect(restored.bounds.height).toBe(DEFAULT_WINDOW_HEIGHT)
    expect(restored.maximized).toBe(false)
  })
})

import { useEffect, useState } from 'react'
import { desktopBridge } from '../../lib/desktop'

/**
 * The strip the operating system's caption buttons live in.
 *
 * It is only painted on Windows and macOS. Windows keeps its native minimize/maximize/close buttons in
 * the overlay, which is what preserves Snap Layouts and double-click-to-maximize; macOS keeps its
 * traffic lights. Linux gets the ordinary window frame and therefore no strip at all.
 *
 * The strip's real job is to be a drag handle: without a `-webkit-app-region: drag` surface the studio
 * would have no way to move a window whose native title bar is hidden.
 */

/** Height of the strip, mirrored by the main process's `titleBarOverlay.height`. */
const CHROME_HEIGHT = 38

/**
 * Formats one colour channel as two lowercase hex digits.
 *
 * @param value - A channel from `ImageData`, expected in 0–255.
 * @returns Two hex digits.
 */
function channel(value: number | undefined): string {
  return (value ?? 0).toString(16).padStart(2, '0')
}

/**
 * Resolves any CSS colour to `#rrggbb`.
 *
 * The design tokens are authored in `oklch()`, which Electron's native overlay cannot parse. Painting
 * one pixel through a canvas is the browser's own colour parser and therefore stays correct when a
 * token changes.
 *
 * @param color - A CSS colour string.
 * @returns A six-digit hex colour, falling back to black when the value cannot be parsed.
 */
function toHex(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return color
  }
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d')
  if (context === null) {
    return '#000000'
  }
  context.fillStyle = color
  context.fillRect(0, 0, 1, 1)
  const data = context.getImageData(0, 0, 1, 1).data
  return `#${channel(data[0])}${channel(data[1])}${channel(data[2])}`
}

/**
 * The desktop window's title strip.
 *
 * @returns The strip, or `null` in a browser, on Linux, or while full screen.
 */
export function WindowChrome() {
  const bridge = desktopBridge()
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    if (bridge === null) {
      return
    }
    return bridge.onFullScreenChange(setFullscreen)
  }, [bridge])

  // Keep the native caption buttons the same colour as the strip. `data-theme` is written by the
  // studio's theme effect, so observing the attribute catches both a manual choice and a system change
  // while the preference is "auto".
  useEffect(() => {
    if (bridge === null || bridge.platform !== 'win32') {
      return
    }
    const apply = (): void => {
      const styles = getComputedStyle(document.documentElement)
      bridge.setTitlebarTheme({
        color: toHex(styles.getPropertyValue('--stage').trim()),
        symbolColor: toHex(styles.getPropertyValue('--ink').trim()),
      })
    }
    apply()
    const observer = new MutationObserver(apply)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => {
      observer.disconnect()
    }
  }, [bridge])

  if (bridge === null || bridge.platform === 'linux' || fullscreen) {
    return null
  }

  const mac = bridge.platform === 'darwin'

  return (
    <div
      className={`desktop-chrome relative z-50 flex shrink-0 select-none items-center border-b
        border-[var(--hairline)] bg-[var(--stage)] ${mac ? 'pl-20' : 'pl-3.5'}
        ${mac ? 'pr-3.5' : 'pr-[140px]'}`}
      style={{ height: CHROME_HEIGHT }}
      data-testid="window-chrome"
    >
      <span aria-hidden="true" className="mr-2 text-ink">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
          <path d="M8 1.4 14.6 8 8 14.6 1.4 8Z" fill="currentColor" />
          <path d="M8 5.15 10.85 8 8 10.85 5.15 8Z" fill="var(--stage)" />
        </svg>
      </span>
      <span className="text-[0.75rem] leading-none font-semibold tracking-[0.01em] text-ink">
        Sigilgen
      </span>
      <span aria-hidden="true" className="mx-2.5 h-3.5 w-px bg-[var(--hairline-strong)]" />
      <span className="type-caps leading-none text-ink-faint">Studio</span>
    </div>
  )
}

/**
 * The rendered side of the desktop contract.
 *
 * The browser build has no bridge, so every helper here is written to be absent-safe: the same studio
 * bundle runs in a tab and in the Electron shell, and only the shell gets a native title bar, native
 * file dialogs and the application menu.
 */

/** The platforms the shell distinguishes. Anything unusual is treated as Linux. */
export type DesktopPlatform = 'win32' | 'darwin' | 'linux'

/** Commands the native menu can send to the studio. */
export type MenuAction = 'save' | 'undo' | 'redo'

/** Colours the Windows title-bar overlay should be repainted with. */
export interface TitlebarTheme {
  /** The bar's background, as `#rrggbb`. */
  color: string
  /** The caption glyphs, as `#rrggbb`. */
  symbolColor: string
}

/** The outcome of a native save dialog. */
export interface SaveResult {
  saved: boolean
  filePath?: string
  error?: string
}

/**
 * The API the preload script places on `window.sigilgenDesktop`.
 *
 * Every member is fire-and-forget or returns a promise; none of them expose Node or Electron objects to
 * page code, which is what keeps `contextIsolation` meaningful.
 */
export interface DesktopBridge {
  /** The host platform, available synchronously so the first paint can choose its chrome. */
  readonly platform: DesktopPlatform
  /** Opens a native Save dialog and writes the SVG. */
  saveSvg(suggestedName: string, contents: string): Promise<SaveResult>
  /** Writes text through Electron's clipboard rather than the web API. */
  copyText(text: string): Promise<boolean>
  /** Subscribes to full-screen transitions; returns the unsubscribe function. */
  onFullScreenChange(listener: (fullscreen: boolean) => void): () => void
  /** Subscribes to native menu commands; returns the unsubscribe function. */
  onMenuAction(listener: (action: MenuAction) => void): () => void
  /** Repaints the Windows caption buttons so they match the studio's theme. */
  setTitlebarTheme(theme: TitlebarTheme): void
}

declare global {
  interface Window {
    /** Present only when the page is hosted by the desktop shell. */
    sigilgenDesktop?: DesktopBridge
  }
}

/**
 * The desktop bridge, when there is one.
 *
 * @returns The bridge, or `null` in a browser.
 */
export function desktopBridge(): DesktopBridge | null {
  if (typeof window === 'undefined') {
    return null
  }
  return window.sigilgenDesktop ?? null
}

/**
 * Whether the page is running inside the desktop shell.
 *
 * @returns `true` when the preload bridge is present.
 */
export function isDesktop(): boolean {
  return desktopBridge() !== null
}

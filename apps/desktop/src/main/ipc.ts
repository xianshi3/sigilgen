import { app, clipboard, dialog, ipcMain, type BrowserWindow, type WebContents } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SaveResult, TitlebarTheme } from '../../../web/src/lib/desktop'
import { safeSvgName } from './validation'

/**
 * The main-process half of the desktop bridge.
 *
 * Everything crossing IPC is untrusted even when it comes from our own renderer: a compromised page is
 * exactly the case this boundary exists for. The handlers therefore validate types, sizes and file
 * names before touching the file system or the clipboard.
 */

/** Height of the Windows caption-button strip, matching `WindowChrome`'s CSS. */
const TITLEBAR_HEIGHT = 38

/** Largest SVG the save dialog will write, in bytes. */
const MAX_SVG_BYTES = 8 * 1024 * 1024

/** Largest string the clipboard handler will accept, in characters. */
const MAX_CLIPBOARD_CHARS = 2 * 1024 * 1024

/**
 * Whether an IPC message came from the window this app owns.
 *
 * @param sender - The event's sender web contents.
 * @param window - The window the app created.
 * @returns `true` when the sender is that window's web contents.
 */
function isTrusted(sender: WebContents, window: BrowserWindow | null): window is BrowserWindow {
  return window !== null && !window.isDestroyed() && sender === window.webContents
}

/**
 * Installs the bridge handlers.
 *
 * The window is read through a getter because macOS can close and recreate it while the app stays
 * alive; handlers registered against the first window would go dead after that.
 *
 * @param getWindow - Returns the current main window, if one exists.
 */
export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(
    'desktop:save-svg',
    async (event, suggested: unknown, contents: unknown): Promise<SaveResult> => {
      const window = getWindow()
      if (!isTrusted(event.sender, window)) {
        return { saved: false, error: 'Untrusted sender.' }
      }
      const name = safeSvgName(suggested)
      if (name === null) {
        return { saved: false, error: 'Invalid file name.' }
      }
      if (
        typeof contents !== 'string' ||
        contents.length === 0 ||
        Buffer.byteLength(contents, 'utf8') > MAX_SVG_BYTES ||
        !contents.trimStart().startsWith('<svg')
      ) {
        return { saved: false, error: 'Invalid SVG contents.' }
      }

      const result = await dialog.showSaveDialog(window, {
        title: 'Save SVG',
        defaultPath: join(app.getPath('documents'), name),
        filters: [{ name: 'SVG image', extensions: ['svg'] }],
        properties: ['createDirectory', 'showOverwriteConfirmation'],
      })
      if (result.canceled || result.filePath === undefined) {
        return { saved: false }
      }
      try {
        await writeFile(result.filePath, contents, 'utf8')
        return { saved: true, filePath: result.filePath }
      } catch (error) {
        return {
          saved: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }
  )

  ipcMain.handle('desktop:copy-text', (event, text: unknown): boolean => {
    if (!isTrusted(event.sender, getWindow()) || typeof text !== 'string') {
      return false
    }
    if (text.length > MAX_CLIPBOARD_CHARS) {
      return false
    }
    clipboard.writeText(text)
    return true
  })

  ipcMain.on('desktop:titlebar-theme', (event, theme: unknown) => {
    const window = getWindow()
    if (process.platform !== 'win32' || !isTrusted(event.sender, window)) {
      return
    }
    if (typeof theme !== 'object' || theme === null) {
      return
    }
    const { color, symbolColor } = theme as TitlebarTheme
    if (!/^#[0-9a-f]{6}$/i.test(color) || !/^#[0-9a-f]{6}$/i.test(symbolColor)) {
      return
    }
    window.setTitleBarOverlay({ color, symbolColor, height: TITLEBAR_HEIGHT })
  })
}

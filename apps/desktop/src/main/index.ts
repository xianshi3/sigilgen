import { app, BrowserWindow, nativeTheme, screen, session, shell } from 'electron'
import { writeFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { registerIpcHandlers } from './ipc'
import { installApplicationMenu } from './menu'
import { isExternalUrl } from './validation'
import {
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  restoreWindowState,
  type SavedWindowState,
} from './window-state'

/**
 * The desktop shell's entry point.
 *
 * The window is frameless-looking but not frameless: on Windows and macOS the operating system still
 * owns the caption buttons, so snapping, maximize-on-double-click and the accessibility of the system
 * menu all keep working. The renderer paints a strip behind them and lets the native controls sit on
 * top. Linux keeps its ordinary window frame, which is the version that behaves best across window
 * managers.
 */

const isMac = process.platform === 'darwin'
const isWindows = process.platform === 'win32'

/** Name of the state file inside Electron's per-user data directory. */
const STATE_FILE = 'window-state.json'

// Set before Electron resolves `userData`: the scoped package name would otherwise create a folder
// called `@sigilgen/desktop`, and the macOS application menu would read that name too.
app.setName('Sigilgen')

/** How long resize/move events are allowed to settle before the state file is rewritten. */
const PERSIST_DELAY = 400

// A second launch should focus the window that is already open instead of starting a rival instance
// with its own copy of the studio state.
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

/** The current window. macOS can close and recreate it without quitting the app. */
let mainWindow: BrowserWindow | null = null

/** Pending debounce timer for window-state writes. */
let persistTimer: NodeJS.Timeout | undefined

/**
 * The path of the window-state file.
 *
 * @returns An absolute path inside Electron's userData directory.
 */
function statePath(): string {
  return join(app.getPath('userData'), STATE_FILE)
}

/**
 * Reads the last window state, tolerating a missing or corrupt file.
 *
 * @returns The parsed value, or `null`.
 */
async function readWindowState(): Promise<unknown> {
  try {
    const raw = await readFile(statePath(), 'utf8')
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

/**
 * Writes the window's normal bounds and maximized flag.
 *
 * @param window - The window to record.
 * @param synchronously - Use a blocking write, for the close path where the process may exit first.
 */
function persistWindowState(window: BrowserWindow, synchronously: boolean): void {
  if (window.isDestroyed()) {
    return
  }
  const bounds = window.getNormalBounds()
  const state: SavedWindowState = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    maximized: window.isMaximized(),
  }
  const text = `${JSON.stringify(state, null, 2)}\n`
  if (synchronously) {
    try {
      writeFileSync(statePath(), text, 'utf8')
    } catch (error) {
      console.error('Could not write the window state:', error)
    }
    return
  }
  void writeFile(statePath(), text, 'utf8').catch((error: unknown) => {
    console.error('Could not write the window state:', error)
  })
}

/**
 * Schedules a state write after a resize or move has settled.
 *
 * @param window - The window being recorded.
 */
function schedulePersist(window: BrowserWindow): void {
  if (persistTimer !== undefined) {
    clearTimeout(persistTimer)
  }
  persistTimer = setTimeout(() => {
    persistTimer = undefined
    persistWindowState(window, false)
  }, PERSIST_DELAY)
}

/**
 * Sends a message to the studio, when there is one to send it to.
 *
 * @param channel - IPC channel.
 * @param value - Payload.
 */
function sendToRenderer(channel: string, value: unknown): void {
  if (mainWindow === null || mainWindow.isDestroyed()) {
    return
  }
  mainWindow.webContents.send(channel, value)
}

/**
 * Opens an http(s) URL in the user's default browser.
 *
 * Anything else is ignored: a page that can navigate the shell is a page that can launch arbitrary
 * protocol handlers.
 *
 * @param value - Candidate URL.
 */
function openExternalUrl(value: string): void {
  if (!isExternalUrl(value)) {
    return
  }
  void shell.openExternal(value)
}

/**
 * Creates the studio window, restoring its last geometry.
 */
async function createWindow(): Promise<void> {
  const saved = await readWindowState()
  const displays = screen.getAllDisplays().map(display => ({ workArea: display.workArea }))
  const primary = screen.getPrimaryDisplay().workArea
  const restored = restoreWindowState(saved, displays, primary)
  const dark = nativeTheme.shouldUseDarkColors
  const background = dark ? '#252320' : '#e9e6df'
  const symbol = dark ? '#ece8e0' : '#2a2722'

  const window = new BrowserWindow({
    ...restored.bounds,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    show: false,
    title: 'Sigilgen',
    backgroundColor: background,
    autoHideMenuBar: !isMac,
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 14, y: 11 },
        }
      : isWindows
        ? {
            titleBarStyle: 'hidden' as const,
            titleBarOverlay: {
              color: background,
              symbolColor: symbol,
              height: 38,
            },
          }
        : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: false,
    },
  })

  mainWindow = window
  if (!isMac) {
    window.setMenuBarVisibility(false)
  }

  window.once('ready-to-show', () => {
    window.show()
    if (restored.maximized) {
      window.maximize()
    }
  })

  // The studio is the only page the window may ever show. Everything else belongs to the browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) {
      event.preventDefault()
      openExternalUrl(url)
    }
  })

  window.on('enter-full-screen', () => {
    sendToRenderer('desktop:full-screen', true)
  })
  window.on('leave-full-screen', () => {
    sendToRenderer('desktop:full-screen', false)
  })
  window.on('resize', () => {
    schedulePersist(window)
  })
  window.on('move', () => {
    schedulePersist(window)
  })
  window.on('close', () => {
    if (persistTimer !== undefined) {
      clearTimeout(persistTimer)
      persistTimer = undefined
    }
    persistWindowState(window, true)
  })
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null
    }
  })

  // Electron otherwise shows a white flash between the native frame and the first paint.
  window.on('show', () => {
    window.setBackgroundColor(background)
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl !== undefined) {
    await window.loadURL(rendererUrl)
  } else {
    await window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.on('second-instance', () => {
  if (mainWindow === null) {
    return
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.show()
  mainWindow.focus()
})

app.on('window-all-closed', () => {
  // macOS apps conventionally stay alive with no windows and reopen from the dock.
  if (!isMac) {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow()
  }
})

void app.whenReady().then(async () => {
  if (isWindows) {
    app.setAppUserModelId('dev.sigilgen.desktop')
  }

  // No page in this app needs camera, microphone, location or notifications. Denying by default keeps a
  // future dependency from silently acquiring one of them.
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false)
  })
  session.defaultSession.setPermissionCheckHandler(() => false)

  registerIpcHandlers(() => mainWindow)

  app.setAboutPanelOptions({
    applicationName: 'Sigilgen',
    applicationVersion: app.getVersion(),
    copyright: 'Deterministic, flat geometric SVG logos.',
  })

  installApplicationMenu({
    locale: app.getLocale(),
    development: !app.isPackaged,
    onAction: action => {
      sendToRenderer('desktop:menu-action', action)
    },
  })

  await createWindow()
})

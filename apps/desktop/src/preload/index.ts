import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  DesktopBridge,
  DesktopPlatform,
  MenuAction,
  TitlebarTheme,
} from '../../../web/src/lib/desktop'

/**
 * The sandboxed bridge.
 *
 * The page gets four verbs and three subscriptions — never `ipcRenderer`, never `require`, never a
 * filesystem path. `contextIsolation` is only worth having if the surface behind it is narrow.
 */

const platform: DesktopPlatform =
  process.platform === 'win32' || process.platform === 'darwin' ? process.platform : 'linux'

/**
 * Wraps a channel subscription and returns its unsubscribe function.
 *
 * @param channel - IPC channel to listen on.
 * @param listener - Receives the payload.
 * @returns A function that removes the listener.
 */
function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, value: T): void => {
    listener(value)
  }
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const bridge: DesktopBridge = {
  platform,
  saveSvg: (suggestedName, contents) =>
    ipcRenderer.invoke('desktop:save-svg', suggestedName, contents),
  copyText: text => ipcRenderer.invoke('desktop:copy-text', text),
  onFullScreenChange: listener => subscribe('desktop:full-screen', listener),
  onMenuAction: listener => subscribe<MenuAction>('desktop:menu-action', listener),
  setTitlebarTheme: (theme: TitlebarTheme) => {
    ipcRenderer.send('desktop:titlebar-theme', theme)
  },
}

contextBridge.exposeInMainWorld('sigilgenDesktop', bridge)

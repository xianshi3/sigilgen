import { app, BrowserWindow, dialog, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import type { MenuAction } from '../../../web/src/lib/desktop'
import { menuLabels, PROJECT_URL } from './menu-labels'

/**
 * The application menu.
 *
 * Two decisions shape it:
 *
 * - **It is localized from the OS locale**, because a native menu that stays English inside a Chinese
 *   interface reads as a half-translated build.
 * - **Undo and redo are routed through the renderer.** The studio keeps its own history, and a native
 *   `undo` role would edit the focused text field instead of the design. The renderer decides which one
 *   the reader meant from the focused element, the same rule its keyboard shortcut already uses.
 */

/**
 * Builds the application menu and installs it.
 *
 * @param options - The locale, the action sink for renderer-owned commands, and whether development
 *   entries should be shown.
 */
export function installApplicationMenu(options: {
  locale: string
  onAction: (action: MenuAction) => void
  development: boolean
}): void {
  const labels = menuLabels(options.locale)
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = []

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about', label: labels.about },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: labels.quit },
      ],
    })
  }

  template.push({
    label: labels.file,
    submenu: [
      {
        label: labels.saveSvg,
        accelerator: 'CmdOrCtrl+S',
        click: () => options.onAction('save'),
      },
      { type: 'separator' },
      isMac ? { role: 'close', label: labels.close } : { role: 'quit', label: labels.quit },
    ],
  })

  template.push({
    label: labels.edit,
    submenu: [
      {
        label: labels.undo,
        accelerator: 'CmdOrCtrl+Z',
        // Displayed but not registered: the page's own shortcut handler distinguishes a focused field
        // (text undo) from the canvas (design undo), and it should keep receiving the chord. The menu
        // click still routes through the renderer below.
        registerAccelerator: false,
        click: () => options.onAction('undo'),
      },
      {
        label: labels.redo,
        accelerator: 'Shift+CmdOrCtrl+Z',
        registerAccelerator: false,
        click: () => options.onAction('redo'),
      },
      { type: 'separator' },
      { role: 'cut', label: labels.cut },
      { role: 'copy', label: labels.copy },
      { role: 'paste', label: labels.paste },
      { role: 'selectAll', label: labels.selectAll },
    ],
  })

  const viewItems: MenuItemConstructorOptions[] = [
    { role: 'resetZoom', label: labels.actualSize },
    { role: 'zoomIn', label: labels.zoomIn },
    { role: 'zoomOut', label: labels.zoomOut },
    { type: 'separator' },
    {
      role: 'togglefullscreen',
      label: labels.fullScreen,
      accelerator: isMac ? 'Ctrl+Cmd+F' : 'F11',
    },
  ]
  if (options.development) {
    viewItems.push(
      { type: 'separator' },
      { role: 'reload', label: labels.reload },
      { role: 'toggleDevTools', label: labels.developerTools }
    )
  }
  template.push({ label: labels.view, submenu: viewItems })

  template.push({
    label: labels.window,
    submenu: [
      { role: 'minimize', label: labels.minimize },
      ...(isMac ? [{ role: 'zoom' as const, label: labels.zoom }] : []),
      { role: 'close', label: labels.close },
    ],
  })

  template.push({
    label: labels.help,
    submenu: [
      {
        label: labels.learnMore,
        click: () => {
          void shell.openExternal(PROJECT_URL)
        },
      },
      ...(isMac
        ? []
        : [
            {
              label: labels.about,
              click: () => {
                const window = BrowserWindow.getFocusedWindow()
                const message = {
                  type: 'info' as const,
                  title: labels.about,
                  message: 'Sigilgen',
                  detail: `Version ${app.getVersion()}\nDeterministic, flat geometric SVG logos.\n\nPictograms: Material Design Icons (Apache-2.0).`,
                }
                if (window === null) {
                  void dialog.showMessageBox(message)
                } else {
                  void dialog.showMessageBox(window, message)
                }
              },
            },
          ]),
    ],
  })

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

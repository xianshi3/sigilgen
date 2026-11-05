/**
 * The strings the native application menu is built from.
 *
 * Kept separate from the menu itself so they can be tested in a plain Node environment: importing
 * Electron's `Menu` launches nothing, but it does need Electron's runtime to be meaningful, and the
 * label table does not.
 */

/** The localized strings the menu is built from. */
export interface MenuLabels {
  file: string
  saveSvg: string
  close: string
  quit: string
  edit: string
  undo: string
  redo: string
  cut: string
  copy: string
  paste: string
  selectAll: string
  view: string
  actualSize: string
  zoomIn: string
  zoomOut: string
  fullScreen: string
  reload: string
  developerTools: string
  window: string
  minimize: string
  zoom: string
  help: string
  learnMore: string
  about: string
}

const EN: MenuLabels = {
  file: 'File',
  saveSvg: 'Save SVG…',
  close: 'Close Window',
  quit: 'Quit',
  edit: 'Edit',
  undo: 'Undo',
  redo: 'Redo',
  cut: 'Cut',
  copy: 'Copy',
  paste: 'Paste',
  selectAll: 'Select All',
  view: 'View',
  actualSize: 'Actual Size',
  zoomIn: 'Zoom In',
  zoomOut: 'Zoom Out',
  fullScreen: 'Toggle Full Screen',
  reload: 'Reload',
  developerTools: 'Developer Tools',
  window: 'Window',
  minimize: 'Minimize',
  zoom: 'Zoom',
  help: 'Help',
  learnMore: 'Sigilgen on GitHub',
  about: 'About Sigilgen',
}

const ZH: MenuLabels = {
  file: '文件',
  saveSvg: '保存 SVG…',
  close: '关闭窗口',
  quit: '退出',
  edit: '编辑',
  undo: '撤销',
  redo: '重做',
  cut: '剪切',
  copy: '复制',
  paste: '粘贴',
  selectAll: '全选',
  view: '视图',
  actualSize: '实际大小',
  zoomIn: '放大',
  zoomOut: '缩小',
  fullScreen: '切换全屏',
  reload: '重新加载',
  developerTools: '开发者工具',
  window: '窗口',
  minimize: '最小化',
  zoom: '缩放',
  help: '帮助',
  learnMore: 'GitHub 上的 Sigilgen',
  about: '关于 Sigilgen',
}

/** Where the Learn More item points. */
export const PROJECT_URL = 'https://github.com/xianshi3/sigilgen'

/**
 * Picks the menu language from a locale tag.
 *
 * @param locale - A locale such as `zh-CN` or `en-US`.
 * @returns The matching label table.
 */
export function menuLabels(locale: string): MenuLabels {
  return locale.toLowerCase().startsWith('zh') ? ZH : EN
}

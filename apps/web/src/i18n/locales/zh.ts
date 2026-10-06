/**
 * Chinese messages — the source of truth for the dictionary's shape.
 *
 * Keys are flat and dotted so that `t()` can be typed against `keyof typeof zh`: a typo in a key is a
 * compile error rather than a string that renders as itself at runtime. `en.ts` is declared as
 * `Record<MessageKey, string>`, so a missing translation is a compile error too.
 *
 * Only user-facing chrome belongs here. Generator output — concept notes, resource names, ids — is
 * English by design and is translated separately where it is worth translating.
 */
export const zh = {
  'app.title': 'Sigilgen',
  'app.tagline': '确定性几何标志生成器',

  'locale.label': '语言',
  'locale.zh': '中文',
  'locale.en': 'English',

  'theme.label': '外观',
  'theme.light': '浅色',
  'theme.dark': '深色',
  'theme.auto': '跟随系统',

  'panel.input': '输入',
  'panel.design': '设计',
  'panel.inspector': '检查器',
  'panel.collapseLeft': '收起左侧栏',
  'panel.expandLeft': '展开左侧栏',
  'panel.collapseRight': '收起右侧栏',
  'panel.expandRight': '展开右侧栏',

  'field.name': '品牌名',
  'field.nameHint': '仅使用 A–Z 字母，其他字符会被忽略',
  'field.keywords': '关键词',
  'field.keywordsHint': '用逗号分隔，例如「科技、极简」',
  'field.brief': '简述',
  'field.briefHint': '自由文本，其中的词也会参与匹配',
  'field.engine': '引擎',
  'field.engineAuto': '自动',
  'field.engineAutoHint': '由品牌名长度与关键词决定',
  'field.size': '尺寸',
  'field.variations': '概念数量',
  'field.background': '不透明背景',

  'engine.monogram': '字母组合',
  'engine.wordmark': '文字标',
  'engine.lettermark': '字母标',
  'engine.abstract': '抽象',
  'engine.emblem': '徽章',
  'engine.monogramHint': '一到两个字母放进容器里',
  'engine.wordmarkHint': '完整品牌名，配图标',
  'engine.lettermarkHint': '只保留字母，不加图标',
  'engine.abstractHint': '不含任何字母的纯几何构图',
  'engine.emblemHint': '图标与名称同处一个边框内',

  'action.reroll': '换一批',
  'action.rerollHint': '换一个种子重新生成',
  'action.export': '导出',
  'action.copySvg': '复制 SVG',
  'action.downloadSvg': '下载 SVG',
  'action.downloadPng': '下载 PNG',
  'action.copied': '已复制',

  'stage.zoom': '缩放',
  'stage.zoomOut': '缩小',
  'stage.zoomIn': '放大',
  'stage.zoomFit': '适应窗口',
  'stage.zoomActual': '实际大小',
  'stage.backdrop': '底色',
  'stage.backdropLight': '浅色',
  'stage.backdropDark': '深色',
  'stage.backdropBoard': '棋盘格',

  'concept.title': '概念',
  'concept.position': '第 {index} 个，共 {total} 个',
  'concept.engine': '引擎',
  'concept.palette': '配色',
  'concept.font': '字体',
  'concept.icon': '图标',
  'concept.none': '无',
  'concept.seed': '种子指纹',

  'notes.title': '设计说明',
  'notes.empty': '选择概念后显示',

  'resource.palette': '配色',
  'resource.font': '字体',
  'resource.icon': '图标',
  'resource.auto': '自动',
  'resource.autoHint': '由情绪规则决定',
  'resource.search': '搜索图标',
  'resource.noMatch': '没有匹配的图标',
  'resource.usesIcon': '所选引擎不使用图标',
  'resource.custom': '自定义颜色',
  'resource.customHint': '至少两种颜色，用逗号分隔；也可用名称，如「ink, copper」',
  'resource.customInvalid': '至少需要两种能识别的颜色',
  'resource.iconCount': '{count} 个图标',

  'fontCategory.geometric-sans': '几何无衬线',
  'fontCategory.humanist-sans': '人文无衬线',
  'fontCategory.serif': '衬线',
  'fontCategory.display': '展示体',

  'dimension.title': '设计选项',
  'dimension.random': '随机',
  'dimension.hint': '锁定的选项在所有概念中保持不变，其余仍然变化。',
  'dimension.container': '容器',
  'dimension.layout': '排布',
  'dimension.treatment': '处理',
  'dimension.accent': '装饰',
  'dimension.frame': '边框',
  'dimension.mode': '构成',

  'empty.title': '输入品牌名开始',
  'empty.body': '相同输入永远得到完全相同的标志。',
  'empty.suggestion': '试试「咖啡」或「金融」',

  'error.title': '无法生成',
  'error.noLetters': '品牌名至少要包含一个 A–Z 字母',
  'error.tooLong': '品牌名最多 64 个字符',
  'error.unknownEngine': '未知的引擎',
} as const

/** Every key the dictionary can be asked for. */
export type MessageKey = keyof typeof zh

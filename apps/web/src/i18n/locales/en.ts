import type { MessageKey } from './zh'

/**
 * English messages.
 *
 * Typed as `Record<MessageKey, string>` against the Chinese dictionary, so a key that exists only in
 * one language is a build failure rather than a hole found in review. Order matches `zh.ts` to make a
 * missing line obvious in a diff.
 */
export const en: Record<MessageKey, string> = {
  'app.title': 'Sigilgen',
  'app.tagline': 'Deterministic geometric logo generator',

  'locale.label': 'Language',
  'locale.zh': '中文',
  'locale.en': 'English',

  'theme.label': 'Appearance',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.auto': 'System',

  'panel.input': 'Input',
  'panel.design': 'Design',
  'panel.inspector': 'Inspector',
  'panel.collapseLeft': 'Collapse sidebar',
  'panel.expandLeft': 'Expand sidebar',
  'panel.collapseRight': 'Collapse inspector',
  'panel.expandRight': 'Expand inspector',

  'field.name': 'Brand name',
  'field.nameHint': 'Only A–Z are used; other characters are ignored',
  'field.keywords': 'Keywords',
  'field.keywordsHint': 'Comma separated, e.g. "tech, minimal"',
  'field.brief': 'Brief',
  'field.briefHint': 'Free text; its words are matched too',
  'field.engine': 'Engine',
  'field.engineAuto': 'Auto',
  'field.engineAutoHint': 'Chosen from name length and keywords',
  'field.size': 'Size',
  'field.variations': 'Concepts',
  'field.background': 'Opaque background',

  'engine.monogram': 'Monogram',
  'engine.wordmark': 'Wordmark',
  'engine.lettermark': 'Lettermark',
  'engine.abstract': 'Abstract',
  'engine.emblem': 'Emblem',
  'engine.monogramHint': 'One or two letters set in a container',
  'engine.wordmarkHint': 'The full name, paired with a pictogram',
  'engine.lettermarkHint': 'Letters only, no pictogram',
  'engine.abstractHint': 'Pure geometry, no letterforms at all',
  'engine.emblemHint': 'Pictogram and name inside one frame',

  'action.reroll': 'Reroll',
  'action.rerollHint': 'Generate again from a different seed',
  'action.export': 'Export',
  'action.copySvg': 'Copy SVG',
  'action.downloadSvg': 'Download SVG',
  'action.downloadPng': 'Download PNG',
  'action.copied': 'Copied',

  'stage.zoom': 'Zoom',
  'stage.zoomOut': 'Zoom out',
  'stage.zoomIn': 'Zoom in',
  'stage.zoomFit': 'Fit to window',
  'stage.zoomActual': 'Actual size',
  'stage.backdrop': 'Backdrop',
  'stage.backdropLight': 'Light',
  'stage.backdropDark': 'Dark',
  'stage.backdropBoard': 'Checkerboard',

  'concept.title': 'Concepts',
  'concept.position': '{index} of {total}',
  'concept.engine': 'Engine',
  'concept.palette': 'Palette',
  'concept.font': 'Typeface',
  'concept.icon': 'Pictogram',
  'concept.none': 'None',
  'concept.seed': 'Seed fingerprint',

  'notes.title': 'Design notes',
  'notes.empty': 'Select a concept to see its notes',

  'resource.palette': 'Palette',
  'resource.font': 'Typeface',
  'resource.icon': 'Pictogram',
  'resource.auto': 'Auto',
  'resource.autoHint': 'Chosen by the mood rules',
  'resource.search': 'Search pictograms',
  'resource.noMatch': 'No pictogram matches',
  'resource.usesIcon': 'The selected engine draws no pictogram',
  'resource.custom': 'Custom colours',
  'resource.customHint': 'Two or more, comma separated; names work too, e.g. "ink, copper"',
  'resource.customInvalid': 'Needs at least two recognisable colours',
  'resource.iconCount': '{count} pictograms',

  'fontCategory.geometric-sans': 'Geometric sans',
  'fontCategory.humanist-sans': 'Humanist sans',
  'fontCategory.serif': 'Serif',
  'fontCategory.display': 'Display',

  'dimension.title': 'Design options',
  'dimension.random': 'Random',
  'dimension.hint':
    'A pinned choice stays the same across every concept; everything else keeps varying.',
  'dimension.container': 'Container',
  'dimension.layout': 'Layout',
  'dimension.treatment': 'Treatment',
  'dimension.accent': 'Accent',
  'dimension.frame': 'Frame',
  'dimension.mode': 'Composition',

  'empty.title': 'Enter a brand name to begin',
  'empty.body': 'The same input always yields exactly the same logo.',
  'empty.suggestion': 'Try "coffee" or "fintech"',

  'error.title': 'Cannot generate',
  'error.noLetters': 'The brand name needs at least one A–Z letter',
  'error.tooLong': 'The brand name is limited to 64 characters',
  'error.unknownEngine': 'Unknown engine',
}

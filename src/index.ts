/**
 * Sigilgen — deterministic, flat geometric SVG logos from a brand name and a few keywords.
 *
 * ```ts
 * import { generateLogo } from 'sigilgen'
 *
 * const logo = generateLogo({ name: 'Acme', keywords: 'tech, minimal' })
 * console.log(logo.svg)
 * console.log(logo.conceptNotes)
 * ```
 *
 * The same input always produces byte-identical output. Nothing here calls a model or the network:
 * every design decision comes from the curated JSON brain in `src/brain/`.
 *
 * @packageDocumentation
 */

export { generateLogo, generateLogos, normaliseConfig } from './generate'

export { SeedResolver, seeded } from './seed-resolver'

export { MoodResolver, extractWords, moodResolver, scoreMood } from './mood-resolver'

export { ENGINES, engineWeights, explainRoute, route } from './engine-router'

export { serialiseDocument, group } from './serializer'
export type { SerialiseOptions } from './serializer'

export { rasterise, hasRasterSupport, RasterSupportError } from './rasterize'
export type { RasteriseOptions, RasterResult } from './rasterize'

export {
  BRAIN,
  FONTS,
  ICONS,
  MOODS,
  PALETTES,
  COLOR_NAMES,
  findFont,
  findIcon,
  findPalette,
  fallbackMood,
} from './brain/index'

export { sha256, toHex } from './sha256'
export { fmt, round, clamp } from './format'
export { parsePath, transformPath, isSafePathData, arcPath } from './path'
export { measureText, textPath } from './text'
export { fitText, capHeightForWidth, naturalWidth } from './engines/metrics'

export { ENGINE_NAMES } from './types'
export type {
  Brain,
  Engine,
  EngineInput,
  EngineName,
  FontCategory,
  FontEntry,
  FontMetrics,
  GenerateOptions,
  GenerateLogoOptions,
  IconEntry,
  LogoConfig,
  LogoResult,
  MoodMatch,
  MoodRule,
  PaletteEntry,
  ResolvedRequest,
  SVGElement,
} from './types'

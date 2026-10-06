/**
 * The generation pipeline.
 *
 * ```text
 * LogoConfig
 *   → normalise        validate, clamp and derive letters and words
 *   → MoodResolver     keywords + brief → mood, engine weights, notes
 *   → EngineRouter     mood weights + name structure → engine
 *   → Resolvers        palette, font, icon
 *   → Engine           SVGElement[]
 *   → serialiseDocument → SVG string
 * ```
 *
 * Every stage is a pure function of its inputs, so the pipeline as a whole is deterministic:
 * identical input always produces byte-identical output.
 */

import { ENGINES, explainRoute, route } from './engine-router'
import { MoodResolver } from './mood-resolver'
import { SeedResolver } from './seed-resolver'
import { serialiseDocument } from './serializer'
import { explainFont, resolveFont } from './resolvers/font-resolver'
import { explainIcon, resolveIcon } from './resolvers/icon-resolver'
import { explainPalette, resolvePalette } from './resolvers/palette-resolver'
import { clamp } from './format'
import { normaliseLetters } from './text'
import {
  ENGINE_NAMES,
  type DesignDimension,
  type DesignPreferences,
  type Engine,
  type EngineName,
  type EngineInput,
  type GenerateOptions,
  type LogoConfig,
  type LogoResult,
  type MoodMatch,
  type ResolvedRequest,
} from './types'

/** Default square canvas size in user units. */
const DEFAULT_SIZE = 512

/** Smallest canvas the generator will emit. */
const MIN_SIZE = 16

/** Largest canvas the generator will emit, to bound path precision. */
const MAX_SIZE = 4096

/** Bounds on the number of concepts per call. */
const MIN_VARIATIONS = 1
const MAX_VARIATIONS = 6

/** Concepts returned when the requested count is unusable. */
const DEFAULT_VARIATIONS = 3

/** Longest accepted brand name. */
const MAX_NAME = 64

/** Longest accepted keyword string. */
const MAX_KEYWORDS = 240

/** Longest accepted brief. */
const MAX_BRIEF = 600

/**
 * Validates and normalises a user configuration.
 *
 * Out-of-range numbers are clamped rather than rejected: `--size 99999` should still produce a logo.
 * Values that cannot be repaired — an empty name, a name with no letters, an unknown engine — are
 * rejected with a message that says what to do.
 *
 * @param config - The user configuration.
 * @returns The normalised request.
 * @throws {TypeError} When the name is missing or unusable, or an enum value is unknown.
 */
export function normaliseConfig(config: GenerateOptions): ResolvedRequest {
  if (config === null || typeof config !== 'object') {
    throw new TypeError('generateLogo() requires a configuration object with a "name"')
  }

  const name = typeof config.name === 'string' ? config.name.trim() : ''
  if (name === '') {
    throw new TypeError('generateLogo() requires a non-empty "name"')
  }
  if (name.length > MAX_NAME) {
    throw new TypeError(`"name" must be at most ${MAX_NAME} characters`)
  }

  const letters = normaliseLetters(name)
  if (letters === '') {
    throw new TypeError(
      `"name" must contain at least one letter; received ${JSON.stringify(config.name)}`
    )
  }

  const keywords =
    typeof config.keywords === 'string' ? config.keywords.trim().slice(0, MAX_KEYWORDS) : ''
  const brief = typeof config.brief === 'string' ? config.brief.trim().slice(0, MAX_BRIEF) : ''

  const { engine: requestedEngine } = config
  let engine: EngineName | null = null
  if (requestedEngine !== undefined) {
    if (!ENGINE_NAMES.includes(requestedEngine)) {
      throw new TypeError(
        `"engine" must be one of ${ENGINE_NAMES.join(', ')}; received ${JSON.stringify(requestedEngine)}`
      )
    }
    engine = requestedEngine
  }

  const { seed: explicitSeed, randomSeed } = config
  const seedValue = Number.isFinite(explicitSeed) ? Number(explicitSeed) : 0
  const seed =
    Number.isFinite(randomSeed) && explicitSeed === undefined ? Number(randomSeed) : seedValue

  // Below one, a variation count is a mistake rather than an intention, so fall back to the default
  // instead of silently clamping to a single concept.
  const rawVariations = Number(config.variations)
  let variations = DEFAULT_VARIATIONS
  if (Number.isFinite(rawVariations) && rawVariations >= MIN_VARIATIONS) {
    variations = Math.round(clamp(rawVariations, MIN_VARIATIONS, MAX_VARIATIONS))
  }

  return {
    name,
    letters,
    nameWords: buildWords(name, '', ''),
    words: buildWords(name, keywords, brief),
    keywords,
    brief,
    engine,
    palette:
      typeof config.palette === 'string' && config.palette.trim() !== ''
        ? config.palette.trim()
        : null,
    font: typeof config.font === 'string' && config.font.trim() !== '' ? config.font.trim() : null,
    icon: typeof config.icon === 'string' && config.icon.trim() !== '' ? config.icon.trim() : null,
    seed: Math.trunc(seed) || 0,
    size: Math.round(clamp(Number(config.size) || DEFAULT_SIZE, MIN_SIZE, MAX_SIZE)),
    variations,
    background: config.background === true,
    preferences: readPreferences(config.preferences),
  }
}

/** Every dimension a caller is allowed to pin. Anything else is dropped. */
const DIMENSIONS = [
  'container',
  'layout',
  'treatment',
  'accent',
  'frame',
  'mode',
] as const satisfies readonly DesignDimension[]

/**
 * Copies the recognised preferences out of a caller-supplied object.
 *
 * Unknown dimensions are dropped here rather than reaching the engines, and values are trimmed but not
 * otherwise interpreted: whether a value names a real candidate is the engine's answer to give, because
 * only the engine knows its own list.
 *
 * @param value - The caller's preferences, of any shape.
 * @returns A fresh object containing only recognised, non-empty string values.
 */
function readPreferences(value: unknown): DesignPreferences {
  if (value === null || typeof value !== 'object') {
    return {}
  }
  const source = value as Record<string, unknown>
  const preferences: DesignPreferences = {}
  for (const dimension of DIMENSIONS) {
    const entry = source[dimension]
    if (typeof entry === 'string' && entry.trim() !== '') {
      preferences[dimension] = entry.trim()
    }
  }
  return preferences
}

/**
 * Collects the words the mood resolver considers.
 *
 * @param name - The brand name.
 * @param keywords - The keyword string.
 * @param brief - The brief string.
 * @returns Lowercase words, in first-seen order.
 */
function buildWords(name: string, keywords: string, brief: string): string[] {
  const source = `${name} ${keywords} ${brief}`.toLowerCase()
  const words: string[] = []
  const seen = new Set<string>()
  for (const token of source.split(/[^a-z0-9]+/)) {
    if (token.length === 0 || token.length > 32 || seen.has(token)) {
      continue
    }
    seen.add(token)
    words.push(token)
  }
  return words
}

/**
 * Generates one concept.
 *
 * @param request - The normalised request.
 * @param mood - The resolved mood.
 * @param index - Zero-based concept index.
 * @returns The generated logo.
 */
function generateConcept(request: ResolvedRequest, mood: MoodMatch, index: number): LogoResult {
  // Each concept gets its own root stream, so concept 2 never depends on how many values concept 1
  // consumed. That is what makes `variations: 3` stable when the engine changes.
  const root = new SeedResolver(
    request.name,
    request.keywords,
    request.brief,
    request.seed,
    request.engine ?? 'auto',
    index
  )

  const engine = route(request, mood, root.derive('engine'))
  const font = resolveFont(engine, mood, root.derive('font'), request.font)
  const palette = resolvePalette(request, mood, root.derive('palette'), index)
  const icon = resolveIcon(engine, mood, root.derive('icon'), request.icon)

  // Engines append to the notes, so each concept gets its own copy rather than mutating the shared mood.
  const conceptMood: MoodMatch = { ...mood, notes: [] }
  const draw: Engine = ENGINES[engine]

  const input: EngineInput = {
    request,
    mood: conceptMood,
    palette,
    font,
    icon,
    engine,
    seed: root.derive('draw'),
    index,
    size: request.size,
    letters: request.letters,
  }

  const elements = draw(input)

  const conceptNotes = [
    ...mood.notes,
    explainRoute(request, mood, engine),
    explainFont(font, engine, request.font),
    explainPalette(palette, request),
    explainIcon(icon, request.icon),
    ...conceptMood.notes,
  ]

  return {
    svg: serialiseDocument(elements, { size: request.size, background: palette.background }),
    palette,
    font,
    icon,
    engine,
    conceptNotes,
    seed: root.hex().slice(0, 12),
  }
}

/**
 * Generates between one and six logo concepts for a brand.
 *
 * Every concept is a different, deterministic interpretation of the same input: a different engine, a
 * different colourway, a different typographic voice, depending on what the mood allows.
 *
 * ```ts
 * const concepts = generateLogos({ name: 'Acme', keywords: 'tech, minimal', variations: 3 })
 * for (const concept of concepts) {
 *   console.log(concept.engine, concept.palette.id)
 * }
 * ```
 *
 * @param config - The user configuration.
 * @returns Between one and six concepts, in a stable order.
 * @throws {TypeError} When the configuration cannot be normalised.
 */
export function generateLogos(config: GenerateOptions): LogoResult[] {
  const request = normaliseConfig(config)
  const mood = new MoodResolver().resolve(request.keywords, request.brief)
  const results: LogoResult[] = []
  for (let index = 0; index < request.variations; index++) {
    results.push(generateConcept(request, mood, index))
  }
  return results
}

/**
 * Generates a single logo concept.
 *
 * When `variations` is omitted or greater than one, only the first concept is returned; use
 * {@link generateLogos} to see the alternatives.
 *
 * @param config - The user configuration.
 * @returns The first concept.
 * @throws {TypeError} When the configuration cannot be normalised.
 */
export function generateLogo(config: LogoConfig): LogoResult {
  const [result] = generateLogos({ ...config, variations: 1 })
  if (result === undefined) {
    throw new TypeError('generateLogo() produced no output')
  }
  return result
}

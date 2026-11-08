/**
 * A drawing document for logos.
 *
 * The generator answers "what mark should this brand have" from the curated brain. This module answers
 * a different question: "what did the reader or a model actually draw". A scene is an explicit,
 * ordered list of flat shapes, text runs and pictograms; the same scene always serialises to the same
 * SVG bytes, and it never contains a paint server, filter, mask or image.
 *
 * Scenes are deliberately separate from the engines. An engine is a design decision maker, while a
 * scene is a document. That separation is what lets a generated mark be imported into an editor and
 * changed without changing the generator's output, and it is what lets an MCP client compose a mark
 * from primitives without claiming to have guessed a mood.
 */

import { FONTS, findFont, findIcon, findPalette } from './brain/index'
import type { LogoResult, PaletteEntry, SVGElement } from './types'
import { fmt, clamp, round } from './format'
import { isSafePathData, parsePath, pathBounds, transformPath } from './path'
import { polygonPath, ringPath, starPath } from './geometry'
import { fitText, opticalTracking } from './engines/metrics'
import { textPath } from './text'
import { serialiseDocument } from './serializer'

/** Largest canvas a scene may declare, in user units. */
export const SCENE_MIN_SIZE = 16

/** Largest canvas a scene may declare, in user units. */
export const SCENE_MAX_SIZE = 4096

/** Default canvas size for a new scene. */
export const SCENE_DEFAULT_SIZE = 512

/** Most elements one scene may hold. */
export const SCENE_MAX_ELEMENTS = 256

/** Most characters one text run may hold. */
export const SCENE_MAX_TEXT = 80

/** Most vertices one polygon may hold. */
export const SCENE_MAX_POINTS = 256

/** Most characters one path's data may hold. */
export const SCENE_MAX_PATH = 20_000

/** Palette roles a scene colour may name instead of a literal. */
export const SCENE_COLOUR_ROLES = [
  'primary',
  'secondary',
  'accent',
  'highlight',
  'background',
] as const

/** A palette role. */
export type SceneColourRole = (typeof SCENE_COLOUR_ROLES)[number]

/** A colour literal or palette role. */
export type SceneColour = string

/**
 * A problem in a scene document.
 *
 * Scenes come from storage and from language models, so every failure has to name the element it
 * belongs to. A generic `Error` would make a bad coordinate indistinguishable from a bad font id.
 */
export class SceneError extends Error {
  /**
   * @param message - Human-readable explanation, including the element index when known.
   */
  constructor(message: string) {
    super(message)
    this.name = 'SceneError'
  }
}

/** Fields shared by every scene element. */
export interface SceneElementBase {
  /** Stable identifier, unique inside the scene. */
  id: string
  /** Human-readable layer name, shown in the studio. */
  name?: string
  /** Hidden elements stay in the document and are skipped when drawing. */
  hidden?: boolean
  /** Translation applied after the element's own geometry, in user units. */
  translate?: [number, number]
  /** Clockwise rotation around the element's own centre, in degrees. */
  rotate?: number
  /** Uniform scale around the element's own centre. */
  scale?: number
  /** Opacity from 0 to 1. */
  opacity?: number
  /** Fill colour or palette role. Defaults to `primary` when the scene has a palette. */
  fill?: SceneColour
  /** Stroke colour or palette role, or `none`. */
  stroke?: SceneColour
  /** Stroke width in user units. Defaults to 2 when a stroke is present. */
  strokeWidth?: number
  /** Fill rule for paths that cut holes with sub-paths. */
  fillRule?: 'nonzero' | 'evenodd'
}

/** A rectangle. */
export interface SceneRect extends SceneElementBase {
  type: 'rect'
  x: number
  y: number
  width: number
  height: number
  /** Corner radius. */
  rx?: number
}

/** A circle. */
export interface SceneCircle extends SceneElementBase {
  type: 'circle'
  cx: number
  cy: number
  r: number
}

/** An ellipse. */
export interface SceneEllipse extends SceneElementBase {
  type: 'ellipse'
  cx: number
  cy: number
  rx: number
  ry: number
}

/** A closed polygon. */
export interface ScenePolygon extends SceneElementBase {
  type: 'polygon'
  /** Vertices in drawing order, in user units. */
  points: [number, number][]
}

/** A star with alternating outer and inner radii. */
export interface SceneStar extends SceneElementBase {
  type: 'star'
  cx: number
  cy: number
  outer: number
  inner: number
  /** Number of points. */
  points: number
  /** Rotation of the first point, in degrees; `-90` points up. */
  rotation?: number
}

/** A ring: an outline with a concentric hole. */
export interface SceneRing extends SceneElementBase {
  type: 'ring'
  cx: number
  cy: number
  rx: number
  ry: number
  /** Ring thickness. */
  weight: number
}

/** Arbitrary path data, validated before it is emitted. */
export interface ScenePath extends SceneElementBase {
  type: 'path'
  d: string
}

/** A text run set from the brain's own outlines. */
export interface SceneText extends SceneElementBase {
  type: 'text'
  /** Letters A–Z and spaces; other characters are removed. */
  text: string
  /** A brain font id. Defaults to the scene's font, then `inter-regular`. */
  font?: string
  /** Left edge of the text box. */
  x: number
  /** Top edge of the text box. */
  y: number
  /** Box width the run is fitted into. */
  width: number
  /** Box height the run is fitted into. */
  height: number
  /** Tracking as a fraction of cap height; positive opens the letters. */
  tracking?: number
}

/** A pictogram from the brain, fitted into a square box. */
export interface SceneIcon extends SceneElementBase {
  type: 'icon'
  /** A brain icon key. */
  key: string
  /** Left edge of the icon box. */
  x: number
  /** Top edge of the icon box. */
  y: number
  /** Box width and height. */
  size: number
}

/** One drawable element. */
export type SceneElement =
  | SceneRect
  | SceneCircle
  | SceneEllipse
  | ScenePolygon
  | SceneStar
  | SceneRing
  | ScenePath
  | SceneText
  | SceneIcon

/**
 * An element as a caller supplies it, before ids have been assigned.
 *
 * The helper distributes over the union, so each variant keeps its own discriminator and only `id`
 * becomes optional.
 */
type WithOptionalId<T> = T extends unknown ? Omit<T, 'id'> & { id?: string } : never

/** An element as a caller supplies it, before ids have been assigned. */
export type SceneElementSpec = WithOptionalId<SceneElement>

/** A complete drawing document. */
export interface LogoScene {
  /** Schema version. Only `1` is understood. */
  version: 1
  /** Optional document name, used for file names and layer panels. */
  title?: string
  /** Square canvas size in user units. */
  size: number
  /** Palette id used to resolve roles, or `null` for literal colours only. */
  palette: string | null
  /** Default font id for text runs, or `null`. */
  font: string | null
  /** Background colour or palette role, or `null` for transparency. */
  background: SceneColour | null
  /** Elements in paint order, first at the bottom. */
  elements: SceneElement[]
}

/** A scene as a caller supplies it, before normalisation. */
export interface LogoSceneSpec {
  version?: 1
  title?: string
  size?: number
  palette?: string | null
  font?: string | null
  background?: SceneColour | null
  elements?: SceneElementSpec[]
}

/** A rectangle in user units. */
export interface SceneBounds {
  x: number
  y: number
  width: number
  height: number
}

/** True when the value is a plain object rather than an array or `null`. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Reads a finite number, or throws a scene error. */
function numberField(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SceneError(`${label} must be a finite number`)
  }
  return value
}

/** Reads an optional finite number. */
function optionalNumber(value: unknown, label: string, fallback: number): number {
  return value === undefined || value === null ? fallback : numberField(value, label)
}

/** Reads an optional string. */
function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value !== 'string') {
    throw new SceneError(`${label} must be a string`)
  }
  return value.trim() === '' ? undefined : value.trim()
}

/** Limits a coordinate to a generous band around the canvas. */
function clampCoordinate(value: number, size: number): number {
  return round(clamp(value, -size * 4, size * 5))
}

/** Requires a positive size and clamps it to a drawable band. */
function positiveSize(value: unknown, label: string, size: number): number {
  const number = numberField(value, label)
  if (number <= 0) {
    throw new SceneError(`${label} must be greater than zero`)
  }
  return round(clamp(number, 0.01, size * 4))
}

/** Resolves a colour role or validates a literal. */
function resolvePaint(
  value: string | null | undefined,
  palette: PaletteEntry | null,
  fallback: string
): string {
  if (value === undefined || value === null) {
    return fallback
  }
  const trimmed = value.trim()
  const lowered = trimmed.toLowerCase()
  if (lowered === 'none' || lowered === 'transparent') {
    return 'none'
  }
  if ((SCENE_COLOUR_ROLES as readonly string[]).includes(lowered)) {
    if (palette === null) {
      throw new SceneError(`colour role "${lowered}" needs a palette`)
    }
    switch (lowered) {
      case 'primary':
        return palette.primary
      case 'secondary':
        return palette.secondary
      case 'accent':
        return palette.accent
      case 'highlight':
        return palette.highlight ?? palette.accent
      case 'background':
        return palette.background ?? 'none'
    }
  }
  if (!/^(#[0-9a-f]{3,8}|[a-zA-Z]+|currentColor)$/i.test(trimmed)) {
    throw new SceneError(`unsafe colour value ${JSON.stringify(trimmed)}`)
  }
  return trimmed
}

/** Validates a colour now and keeps the original role for later palette changes. */
function validatePaint(
  value: unknown,
  palette: PaletteEntry | null,
  label: string
): SceneColour | undefined {
  const text = optionalString(value, label)
  if (text === undefined) {
    return undefined
  }
  resolvePaint(text, palette, 'none')
  return text
}

/** Makes an id unique, deterministically. */
function uniqueId(base: string, used: Set<string>): string {
  const clean = base.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  const stem = clean === '' ? 'element' : clean
  let candidate = stem
  let counter = 2
  while (used.has(candidate)) {
    candidate = `${stem}-${counter}`
    counter += 1
  }
  used.add(candidate)
  return candidate
}

/** Reads the shared fields of an element. */
function commonFields(
  raw: Record<string, unknown>,
  index: number,
  size: number,
  palette: PaletteEntry | null,
  used: Set<string>
): SceneElementBase {
  const id = uniqueId(
    optionalString(raw['id'], `element ${index + 1} id`) ?? `element-${index + 1}`,
    used
  )
  const translateRaw = raw['translate']
  let translate: [number, number] | undefined
  if (translateRaw !== undefined && translateRaw !== null) {
    if (!Array.isArray(translateRaw) || translateRaw.length !== 2) {
      throw new SceneError(`element ${index + 1}: translate must be [x, y]`)
    }
    translate = [
      clampCoordinate(numberField(translateRaw[0], `element ${index + 1} translate x`), size),
      clampCoordinate(numberField(translateRaw[1], `element ${index + 1} translate y`), size),
    ]
  }
  const rotate = optionalNumber(raw['rotate'], `element ${index + 1} rotate`, 0)
  const scale = optionalNumber(raw['scale'], `element ${index + 1} scale`, 1)
  const opacity = optionalNumber(raw['opacity'], `element ${index + 1} opacity`, 1)
  const strokeWidth = optionalNumber(raw['strokeWidth'], `element ${index + 1} strokeWidth`, 2)
  const fillRule = raw['fillRule']
  if (fillRule !== undefined && fillRule !== 'nonzero' && fillRule !== 'evenodd') {
    throw new SceneError(`element ${index + 1}: fillRule must be "nonzero" or "evenodd"`)
  }
  return {
    id,
    name: optionalString(raw['name'], `element ${index + 1} name`),
    hidden: raw['hidden'] === true,
    translate,
    rotate: round(clamp(rotate, -3600, 3600)),
    scale: round(clamp(scale, 0.05, 20)),
    opacity: round(clamp(opacity, 0, 1)),
    fill: validatePaint(raw['fill'], palette, `element ${index + 1} fill`),
    stroke: validatePaint(raw['stroke'], palette, `element ${index + 1} stroke`),
    strokeWidth: round(clamp(strokeWidth, 0, size / 2)),
    fillRule: fillRule as 'nonzero' | 'evenodd' | undefined,
  }
}

/** Reads a point list. */
function readPoints(value: unknown, index: number, size: number): [number, number][] {
  if (!Array.isArray(value) || value.length < 3 || value.length > SCENE_MAX_POINTS) {
    throw new SceneError(`element ${index + 1}: polygon needs 3 to ${SCENE_MAX_POINTS} points`)
  }
  const points: [number, number][] = []
  for (const [pointIndex, point] of value.entries()) {
    if (!Array.isArray(point) || point.length !== 2) {
      throw new SceneError(`element ${index + 1}: point ${pointIndex + 1} must be [x, y]`)
    }
    points.push([
      clampCoordinate(
        numberField(point[0], `element ${index + 1} point ${pointIndex + 1} x`),
        size
      ),
      clampCoordinate(
        numberField(point[1], `element ${index + 1} point ${pointIndex + 1} y`),
        size
      ),
    ])
  }
  return points
}

/** Normalises one raw element. */
function normaliseElement(
  raw: unknown,
  index: number,
  size: number,
  palette: PaletteEntry | null,
  defaultFont: string | null,
  used: Set<string>
): SceneElement {
  if (!isRecord(raw)) {
    throw new SceneError(`element ${index + 1} must be an object`)
  }
  const common = commonFields(raw, index, size, palette, used)
  const type = raw['type']
  switch (type) {
    case 'rect': {
      const x = clampCoordinate(numberField(raw['x'], `element ${index + 1} x`), size)
      const y = clampCoordinate(numberField(raw['y'], `element ${index + 1} y`), size)
      const width = positiveSize(raw['width'], `element ${index + 1} width`, size)
      const height = positiveSize(raw['height'], `element ${index + 1} height`, size)
      const rx = optionalNumber(raw['rx'], `element ${index + 1} rx`, 0)
      return {
        ...common,
        type,
        x,
        y,
        width,
        height,
        rx: round(clamp(rx, 0, Math.min(width, height) / 2)),
      }
    }
    case 'circle': {
      const r = positiveSize(raw['r'], `element ${index + 1} r`, size)
      return {
        ...common,
        type,
        cx: clampCoordinate(numberField(raw['cx'], `element ${index + 1} cx`), size),
        cy: clampCoordinate(numberField(raw['cy'], `element ${index + 1} cy`), size),
        r,
      }
    }
    case 'ellipse': {
      return {
        ...common,
        type,
        cx: clampCoordinate(numberField(raw['cx'], `element ${index + 1} cx`), size),
        cy: clampCoordinate(numberField(raw['cy'], `element ${index + 1} cy`), size),
        rx: positiveSize(raw['rx'], `element ${index + 1} rx`, size),
        ry: positiveSize(raw['ry'], `element ${index + 1} ry`, size),
      }
    }
    case 'polygon': {
      return {
        ...common,
        type,
        points: readPoints(raw['points'], index, size),
      }
    }
    case 'star': {
      const outer = positiveSize(raw['outer'], `element ${index + 1} outer`, size)
      const inner = positiveSize(raw['inner'], `element ${index + 1} inner`, size)
      const points = numberField(raw['points'], `element ${index + 1} points`)
      return {
        ...common,
        type,
        cx: clampCoordinate(numberField(raw['cx'], `element ${index + 1} cx`), size),
        cy: clampCoordinate(numberField(raw['cy'], `element ${index + 1} cy`), size),
        outer,
        inner: round(clamp(inner, 0.01, outer * 0.99)),
        points: Math.round(clamp(points, 3, 24)),
        rotation: round(optionalNumber(raw['rotation'], `element ${index + 1} rotation`, -90)),
      }
    }
    case 'ring': {
      const rx = positiveSize(raw['rx'], `element ${index + 1} rx`, size)
      const ry = positiveSize(raw['ry'], `element ${index + 1} ry`, size)
      const weight = positiveSize(raw['weight'], `element ${index + 1} weight`, size)
      return {
        ...common,
        type,
        cx: clampCoordinate(numberField(raw['cx'], `element ${index + 1} cx`), size),
        cy: clampCoordinate(numberField(raw['cy'], `element ${index + 1} cy`), size),
        rx,
        ry,
        weight: round(clamp(weight, 0.01, Math.min(rx, ry) - 0.01)),
      }
    }
    case 'path': {
      if (typeof raw['d'] !== 'string' || raw['d'].trim() === '') {
        throw new SceneError(`element ${index + 1}: path needs non-empty d`)
      }
      const d = raw['d'].trim()
      if (d.length > SCENE_MAX_PATH || !isSafePathData(d) || parsePath(d).length === 0) {
        throw new SceneError(`element ${index + 1}: path data is not safe or cannot be parsed`)
      }
      if (pathBounds(d) === null) {
        throw new SceneError(`element ${index + 1}: path data has no drawable bounds`)
      }
      return { ...common, type, d }
    }
    case 'text': {
      if (typeof raw['text'] !== 'string') {
        throw new SceneError(`element ${index + 1}: text must be a string`)
      }
      const text = raw['text']
        .toUpperCase()
        .replace(/[^A-Z ]+/g, '')
        .trim()
        .slice(0, SCENE_MAX_TEXT)
      if (text === '' || !/[A-Z]/.test(text)) {
        throw new SceneError(`element ${index + 1}: text needs at least one letter A–Z`)
      }
      const fontId = optionalString(raw['font'], `element ${index + 1} font`) ?? defaultFont
      if (fontId !== null && fontId !== undefined && findFont(fontId) === undefined) {
        throw new SceneError(`element ${index + 1}: unknown font "${fontId}"`)
      }
      return {
        ...common,
        type,
        text,
        font: fontId ?? undefined,
        x: clampCoordinate(numberField(raw['x'], `element ${index + 1} x`), size),
        y: clampCoordinate(numberField(raw['y'], `element ${index + 1} y`), size),
        width: positiveSize(raw['width'], `element ${index + 1} width`, size),
        height: positiveSize(raw['height'], `element ${index + 1} height`, size),
        tracking: round(
          clamp(optionalNumber(raw['tracking'], `element ${index + 1} tracking`, 0), -0.2, 0.5)
        ),
      }
    }
    case 'icon': {
      const key = optionalString(raw['key'], `element ${index + 1} key`)
      if (key === undefined || findIcon(key) === undefined) {
        throw new SceneError(`element ${index + 1}: unknown icon key "${key ?? ''}"`)
      }
      return {
        ...common,
        type,
        key,
        x: clampCoordinate(numberField(raw['x'], `element ${index + 1} x`), size),
        y: clampCoordinate(numberField(raw['y'], `element ${index + 1} y`), size),
        size: positiveSize(raw['size'], `element ${index + 1} size`, size),
      }
    }
    default:
      throw new SceneError(
        `element ${index + 1}: unknown type ${JSON.stringify(type)}; expected rect, circle, ellipse, polygon, star, ring, path, text or icon`
      )
  }
}

/**
 * Validates a scene and fills in its defaults.
 *
 * Positions and sizes are clamped into a band around the canvas rather than rejected, because a model
 * that places a shape four units outside the edge has still made a usable drawing. Structural mistakes
 * — an unknown type, a missing width, an unsafe path — are rejected, because silently dropping those
 * would leave the caller looking at a blank canvas with no explanation.
 *
 * @param input - A scene from storage, a model or the studio, of unknown shape.
 * @returns A complete scene with ids, defaults and normalised numbers.
 * @throws {SceneError} When the document is not a scene.
 */
export function normaliseScene(input: unknown): LogoScene {
  if (!isRecord(input)) {
    throw new SceneError('scene must be an object')
  }
  const version = input['version'] ?? 1
  if (version !== 1) {
    throw new SceneError(`unsupported scene version ${JSON.stringify(version)}`)
  }
  const size = Math.round(
    clamp(
      optionalNumber(input['size'], 'scene size', SCENE_DEFAULT_SIZE),
      SCENE_MIN_SIZE,
      SCENE_MAX_SIZE
    )
  )
  const paletteId = optionalString(input['palette'], 'scene palette')
  const palette = paletteId === undefined ? null : (findPalette(paletteId) ?? null)
  if (paletteId !== undefined && palette === null) {
    throw new SceneError(`unknown palette "${paletteId}"`)
  }
  const fontId = optionalString(input['font'], 'scene font')
  if (fontId !== undefined && findFont(fontId) === undefined) {
    throw new SceneError(`unknown font "${fontId}"`)
  }
  const backgroundValue = optionalString(input['background'], 'scene background')
  if (backgroundValue !== undefined) {
    resolvePaint(backgroundValue, palette, 'none')
  }
  const rawElements = input['elements']
  if (!Array.isArray(rawElements)) {
    throw new SceneError('scene elements must be an array')
  }
  if (rawElements.length > SCENE_MAX_ELEMENTS) {
    throw new SceneError(
      `scene has ${rawElements.length} elements; the limit is ${SCENE_MAX_ELEMENTS}`
    )
  }
  const used = new Set<string>()
  const elements = rawElements.map((raw, index) =>
    normaliseElement(raw, index, size, palette, fontId ?? null, used)
  )
  return {
    version: 1,
    title: optionalString(input['title'], 'scene title'),
    size,
    palette: palette?.id ?? null,
    font: fontId ?? null,
    background: backgroundValue ?? null,
    elements,
  }
}

/** Converts the path toolkit's bounds into the scene's rectangle. */
function toSceneBounds(bounds: {
  minX: number
  minY: number
  maxX: number
  maxY: number
}): SceneBounds {
  return {
    x: round(bounds.minX),
    y: round(bounds.minY),
    width: round(bounds.maxX - bounds.minX),
    height: round(bounds.maxY - bounds.minY),
  }
}

/** Reads the centre of an element's untransformed geometry. */
function baseCentre(element: SceneElement): { x: number; y: number } {
  switch (element.type) {
    case 'rect':
      return { x: element.x + element.width / 2, y: element.y + element.height / 2 }
    case 'circle':
      return { x: element.cx, y: element.cy }
    case 'ellipse':
      return { x: element.cx, y: element.cy }
    case 'polygon': {
      const xs = element.points.map(point => point[0])
      const ys = element.points.map(point => point[1])
      return {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
      }
    }
    case 'star':
      return { x: element.cx, y: element.cy }
    case 'ring':
      return { x: element.cx, y: element.cy }
    case 'path': {
      const bounds = pathBounds(element.d)
      if (bounds === null) {
        return { x: 0, y: 0 }
      }
      const box = toSceneBounds(bounds)
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    }
    case 'text':
      return { x: element.x + element.width / 2, y: element.y + element.height / 2 }
    case 'icon':
      return { x: element.x + element.size / 2, y: element.y + element.size / 2 }
  }
}

/** Reads an element's untransformed bounds. */
function baseBounds(element: SceneElement): SceneBounds | null {
  switch (element.type) {
    case 'rect':
      return { x: element.x, y: element.y, width: element.width, height: element.height }
    case 'circle':
      return {
        x: element.cx - element.r,
        y: element.cy - element.r,
        width: element.r * 2,
        height: element.r * 2,
      }
    case 'ellipse':
      return {
        x: element.cx - element.rx,
        y: element.cy - element.ry,
        width: element.rx * 2,
        height: element.ry * 2,
      }
    case 'polygon': {
      const xs = element.points.map(point => point[0])
      const ys = element.points.map(point => point[1])
      const minX = Math.min(...xs)
      const minY = Math.min(...ys)
      return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY }
    }
    case 'star':
      return {
        x: element.cx - element.outer,
        y: element.cy - element.outer,
        width: element.outer * 2,
        height: element.outer * 2,
      }
    case 'ring':
      return {
        x: element.cx - element.rx,
        y: element.cy - element.ry,
        width: element.rx * 2,
        height: element.ry * 2,
      }
    case 'path': {
      const bounds = pathBounds(element.d)
      return bounds === null ? null : toSceneBounds(bounds)
    }
    case 'text':
      return { x: element.x, y: element.y, width: element.width, height: element.height }
    case 'icon':
      return { x: element.x, y: element.y, width: element.size, height: element.size }
  }
}

/** The transform that places an element, or `null` when it is already in place. */
export function sceneElementTransform(element: SceneElement): string | null {
  const translateX = element.translate?.[0] ?? 0
  const translateY = element.translate?.[1] ?? 0
  const rotate = element.rotate ?? 0
  const scale = element.scale ?? 1
  if (translateX === 0 && translateY === 0 && rotate === 0 && scale === 1) {
    return null
  }
  const centre = baseCentre(element)
  const parts: string[] = []
  if (translateX !== 0 || translateY !== 0) {
    parts.push(`translate(${fmt(translateX)} ${fmt(translateY)})`)
  }
  if (rotate !== 0) {
    parts.push(`rotate(${fmt(rotate)} ${fmt(centre.x)} ${fmt(centre.y)})`)
  }
  if (scale !== 1) {
    parts.push(
      `translate(${fmt(centre.x)} ${fmt(centre.y)}) scale(${fmt(scale)}) translate(${fmt(-centre.x)} ${fmt(-centre.y)})`
    )
  }
  return parts.join(' ')
}

/**
 * The axis-aligned bounds of an element after its transform.
 *
 * Used by the studio to draw the selection outline around rotated and scaled elements without reading
 * the DOM. The result is the box the reader sees, not the untransformed geometry.
 *
 * @param element - The element.
 * @returns Bounds in user units, or `null` when the geometry has no area.
 */
export function sceneElementBounds(element: SceneElement): SceneBounds | null {
  const bounds = baseBounds(element)
  if (bounds === null) {
    return null
  }
  const centre = baseCentre(element)
  const scale = element.scale ?? 1
  const radians = ((element.rotate ?? 0) * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const corners: [number, number][] = [
    [bounds.x, bounds.y],
    [bounds.x + bounds.width, bounds.y],
    [bounds.x + bounds.width, bounds.y + bounds.height],
    [bounds.x, bounds.y + bounds.height],
  ]
  const transformed = corners.map(([x, y]) => {
    const scaledX = centre.x + (x - centre.x) * scale
    const scaledY = centre.y + (y - centre.y) * scale
    const rotatedX = centre.x + (scaledX - centre.x) * cos - (scaledY - centre.y) * sin
    const rotatedY = centre.y + (scaledX - centre.x) * sin + (scaledY - centre.y) * cos
    return [
      rotatedX + (element.translate?.[0] ?? 0),
      rotatedY + (element.translate?.[1] ?? 0),
    ] as const
  })
  const xs = transformed.map(point => point[0])
  const ys = transformed.map(point => point[1])
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return {
    x: round(minX),
    y: round(minY),
    width: round(Math.max(...xs) - minX),
    height: round(Math.max(...ys) - minY),
  }
}

/** The common paint attributes for one element. */
function paintAttributes(
  element: SceneElement,
  palette: PaletteEntry | null
): Record<string, string | number> {
  const attributes: Record<string, string | number> = {}
  const fill = resolvePaint(element.fill, palette, palette === null ? '#111111' : 'primary')
  attributes['fill'] = fill === 'none' ? 'none' : fill
  const stroke = resolvePaint(element.stroke, palette, 'none')
  if (stroke !== 'none') {
    attributes['stroke'] = stroke
    attributes['stroke-width'] = element.strokeWidth ?? 2
    attributes['stroke-linecap'] = 'round'
    attributes['stroke-linejoin'] = 'round'
  }
  if ((element.opacity ?? 1) < 1) {
    attributes['opacity'] = element.opacity ?? 1
  }
  if (element.fillRule === 'evenodd') {
    attributes['fill-rule'] = 'evenodd'
  }
  return attributes
}

/**
 * Builds one element's SVG tree.
 *
 * Exported because the studio renders the same tree through React for live selection; keeping one
 * compiler for both the file and the screen is what stops the preview from drifting from the export.
 *
 * @param element - A normalised element.
 * @param scene - The scene that supplies the palette and default font.
 * @returns The element's SVG node.
 */
export function sceneElementToSvg(element: SceneElement, scene: LogoScene): SVGElement {
  const palette = scene.palette === null ? null : (findPalette(scene.palette) ?? null)
  const paint = paintAttributes(element, palette)
  switch (element.type) {
    case 'rect': {
      const attrs: Record<string, string | number> = {
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        ...paint,
      }
      if ((element.rx ?? 0) > 0) {
        attrs['rx'] = element.rx ?? 0
      }
      return { tag: 'rect', attrs }
    }
    case 'circle':
      return {
        tag: 'circle',
        attrs: { cx: element.cx, cy: element.cy, r: element.r, ...paint },
      }
    case 'ellipse':
      return {
        tag: 'ellipse',
        attrs: { cx: element.cx, cy: element.cy, rx: element.rx, ry: element.ry, ...paint },
      }
    case 'polygon':
      return {
        tag: 'path',
        attrs: {
          d: polygonPath(element.points.map(([x, y]) => ({ x, y }))),
          ...paint,
        },
      }
    case 'star':
      return {
        tag: 'path',
        attrs: {
          d: starPath(
            element.cx,
            element.cy,
            element.outer,
            element.inner,
            element.points,
            element.rotation
          ),
          ...paint,
        },
      }
    case 'ring':
      return {
        tag: 'path',
        attrs: {
          d: ringPath(element.cx, element.cy, element.rx, element.ry, element.weight),
          ...paint,
        },
      }
    case 'path':
      return { tag: 'path', attrs: { d: element.d, ...paint } }
    case 'text': {
      const font =
        findFont(element.font ?? scene.font ?? 'inter-regular') ??
        findFont('inter-regular') ??
        FONTS[0]
      if (font === undefined) {
        throw new SceneError('the brain has no typeface to set text with')
      }
      const tracking = opticalTracking(font, element.tracking ?? 0)
      const fitted = fitText(
        font,
        element.text,
        element.x + element.width / 2,
        element.y,
        element.width,
        element.height,
        tracking
      )
      const d = textPath(font, element.text, fitted.left, fitted.top, fitted.scale, tracking)
      if (d === '') {
        throw new SceneError(`text "${element.text}" has no drawable letters`)
      }
      return { tag: 'path', attrs: { d, ...paint } }
    }
    case 'icon': {
      const icon = findIcon(element.key)
      if (icon === undefined) {
        throw new SceneError(`unknown icon "${element.key}"`)
      }
      const numbers = icon.viewBox
        .split(/[\s,]+/)
        .filter(part => part !== '')
        .map(Number)
      const gridX = numbers[0] ?? 0
      const gridY = numbers[1] ?? 0
      const gridWidth = numbers[2] ?? 24
      const scale = element.size / (gridWidth > 0 ? gridWidth : 24)
      const d = transformPath(
        icon.path,
        scale,
        element.x - gridX * scale,
        element.y - gridY * scale
      )
      return { tag: 'path', attrs: { d, ...paint } }
    }
  }
}

/**
 * Builds every visible element in paint order.
 *
 * @param scene - A normalised scene.
 * @returns SVG nodes, wrapped in groups only where a transform is present.
 */
export function sceneToSvgElements(scene: LogoScene): SVGElement[] {
  const nodes: SVGElement[] = []
  for (const element of scene.elements) {
    if (element.hidden === true) {
      continue
    }
    const node = sceneElementToSvg(element, scene)
    const transform = sceneElementTransform(element)
    nodes.push(transform === null ? node : { tag: 'g', attrs: { transform }, children: [node] })
  }
  return nodes
}

/**
 * Renders a scene to a flat SVG document.
 *
 * @param input - A scene from storage, a model or the studio.
 * @returns A complete SVG document, byte-identical for identical input.
 * @throws {SceneError} When the scene is structurally invalid.
 */
export function renderScene(input: unknown): string {
  const scene = normaliseScene(input)
  const palette = scene.palette === null ? null : (findPalette(scene.palette) ?? null)
  const resolvedBackground =
    scene.background === null || scene.background === undefined
      ? 'none'
      : resolvePaint(scene.background, palette, 'none')
  const background = resolvedBackground === 'none' ? null : resolvedBackground
  return serialiseDocument(sceneToSvgElements(scene), { size: scene.size, background })
}

/** Reads one attribute out of an opening tag's attribute text. */
function attr(attributes: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(attributes)
  return match?.[1] ?? null
}

/**
 * Turns a generated concept into an editable scene.
 *
 * The generated document is a fixed shape — an optional full-canvas background rect followed by
 * top-level paths — so it can be read without a general XML parser. The palette and typeface ids come
 * from the result rather than from the markup, which keeps the scene independent of the generator's
 * current seed.
 *
 * @param logo - A generated concept.
 * @param title - Optional document title, usually the brand name.
 * @returns A scene whose paths paint the same mark.
 * @throws {SceneError} When the concept contains no drawable path.
 */
export function sceneFromLogo(logo: LogoResult, title?: string): LogoScene {
  const tag = logo.svg.match(/<svg\b[^>]*>/i)?.[0] ?? ''
  const viewBox = tag.match(/viewBox\s*=\s*"([^"]*)"/i)?.[1] ?? ''
  const numbers = viewBox
    .split(/[\s,]+/)
    .filter(part => part !== '')
    .map(Number)
  const size = numbers[2] !== undefined && numbers[2] > 0 ? numbers[2] : SCENE_DEFAULT_SIZE
  const raw: Record<string, unknown>[] = []
  let background: string | null = null

  for (const match of logo.svg.matchAll(/<rect\b([^>]*?)\/?>/gi)) {
    const attributes = match[1] ?? ''
    const x = Number(attr(attributes, 'x') ?? '0')
    const y = Number(attr(attributes, 'y') ?? '0')
    const width = Number(attr(attributes, 'width') ?? '0')
    const height = Number(attr(attributes, 'height') ?? '0')
    const fill = attr(attributes, 'fill') ?? null
    if (x === 0 && y === 0 && width === size && height === size && fill !== null) {
      background = fill
      continue
    }
    raw.push({
      type: 'rect',
      x,
      y,
      width,
      height,
      fill: fill ?? undefined,
      name: `Rectangle ${raw.length + 1}`,
    })
  }

  for (const match of logo.svg.matchAll(/<path\b([^>]*?)\/?>/gi)) {
    const attributes = match[1] ?? ''
    const d = attr(attributes, 'd')
    if (d === null || d === '' || !isSafePathData(d) || pathBounds(d) === null) {
      continue
    }
    raw.push({
      type: 'path',
      d,
      fill: attr(attributes, 'fill') ?? undefined,
      name: `Path ${raw.length + 1}`,
    })
  }

  if (raw.length === 0) {
    throw new SceneError('the generated concept has no drawable paths')
  }

  return normaliseScene({
    version: 1,
    title,
    size,
    palette: logo.palette.id,
    font: logo.font.id,
    background,
    elements: raw,
  })
}

/**
 * Copies an element with a fresh id, offset slightly so it is visible against the original.
 *
 * @param element - The element to copy.
 * @param id - The id for the copy.
 * @returns A new element.
 */
export function duplicateSceneElement(element: SceneElement, id: string): SceneElement {
  const copy: SceneElement = { ...element, id }
  const [x, y] = element.translate ?? [0, 0]
  copy.translate = [round(x + 12), round(y + 12)]
  return copy
}

/**
 * The CSS colour a role resolves to in a scene, for swatches and previews.
 *
 * @param value - A colour role or literal.
 * @param scene - The scene supplying the palette.
 * @returns The resolved colour, or `none` for transparent.
 */
export function resolveSceneColour(value: SceneColour, scene: LogoScene): string {
  const palette = scene.palette === null ? null : (findPalette(scene.palette) ?? null)
  return resolvePaint(value, palette, 'none')
}

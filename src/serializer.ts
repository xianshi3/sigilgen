/**
 * Serialises SVG elements into a flat SVG document.
 *
 * This is the trust boundary. Everything above it produces `SVGElement` trees that may have been
 * influenced by a brand name, a keyword or a CLI flag, so the serializer:
 *
 * - emits a fixed, allow-listed set of elements;
 * - emits a fixed, allow-listed set of attributes per element;
 * - rejects any attribute value that contains a character outside a conservative pattern, and
 *   escapes the three characters that could break out of a quoted attribute;
 * - never emits `<script>`, `on*` handlers, external references, or any paint server.
 *
 * ## Flatness contract
 *
 * Output contains no `<linearGradient>`, `<radialGradient>`, `<filter>`, `<mask>`, `<clipPath>`,
 * `<pattern>`, `<image>`, `<foreignObject>`, `<script>` or `<use>`. Only `fill`, `stroke`,
 * `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `opacity`, `fill-rule`, `d`, `x`, `y`, `width`,
 * `height`, `cx`, `cy`, `r`, `rx`, `ry`, `x1`, `y1`, `x2`, `y2`, `points` and `viewBox` survive.
 *
 * A `viewBox` is always used instead of fixed pixel dimensions, so the output scales.
 */

import type { SVGElement } from './types'

/** Elements the serializer will emit. */
const ALLOWED_TAGS: ReadonlySet<string> = new Set([
  'svg',
  'g',
  'path',
  'circle',
  'ellipse',
  'rect',
  'polygon',
  'line',
  'polyline',
])

/** Attributes allowed on any element. */
const GLOBAL_ATTRS: ReadonlySet<string> = new Set([
  'd',
  'fill',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'opacity',
  'x',
  'y',
  'width',
  'height',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x1',
  'y1',
  'x2',
  'y2',
  'points',
  'transform',
])

/** Attribute value patterns. Anything that fails is rejected, not escaped. */
const VALUE_RULES: Record<string, RegExp> = {
  d: /^[MLCZmlcz0-9.,\-+eE\s]*$/,
  points: /^[0-9.,\-+eE\s]+$/,
  fill: /^(none|currentColor|#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/,
  stroke: /^(none|currentColor|#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/,
  'fill-rule': /^(nonzero|evenodd)$/,
  'stroke-linecap': /^(butt|round|square)$/,
  'stroke-linejoin': /^(miter|round|bevel)$/,
  transform: /^[a-zA-Z0-9(),.\-+eE\s]*$/,
  numbers: /^-?[0-9]+(?:\.[0-9]+)?(?:e[-+]?[0-9]+)?$/i,
}

/** Elements that must never be emitted, named explicitly so the intent survives refactors. */
const FORBIDDEN_TAGS: ReadonlySet<string> = new Set([
  'script',
  'foreignObject',
  'image',
  'use',
  'animate',
  'animateTransform',
  'set',
  'style',
  'filter',
  'mask',
  'clipPath',
  'linearGradient',
  'radialGradient',
  'pattern',
  'marker',
  'text',
  'tspan',
  'a',
  'iframe',
  'audio',
  'video',
  'embed',
  'object',
])

/**
 * Escapes the characters that could terminate a quoted attribute value.
 *
 * @param value - The raw value.
 * @returns The value with `&`, `<` and `>` replaced by entities.
 */
function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Validates one attribute value.
 *
 * @param name - The attribute name.
 * @param value - The attribute value.
 * @returns `true` when the value is safe to emit.
 */
function isSafeValue(name: string, value: string): boolean {
  if (value.includes('"') || value.includes('<') || value.includes('>') || value.includes('&')) {
    return false
  }
  if (name === 'stroke-dasharray') {
    return /^[0-9.,\s]+$/.test(value)
  }
  const rule = VALUE_RULES[name]
  if (rule !== undefined) {
    return rule.test(value)
  }
  return VALUE_RULES['numbers']?.test(value) ?? false
}

/**
 * Serialises one element and its children.
 *
 * @param element - The element to serialise.
 * @returns SVG markup, or an empty string when nothing is safe to emit.
 * @throws {Error} When the element uses a forbidden or unknown tag.
 */
function serialise(element: SVGElement): string {
  const { tag } = element
  if (FORBIDDEN_TAGS.has(tag)) {
    throw new Error(`refusing to emit forbidden element <${tag}>`)
  }
  if (!ALLOWED_TAGS.has(tag)) {
    throw new Error(`refusing to emit unknown element <${tag}>`)
  }

  /** @type {string[]} */
  const attrs: string[] = []
  for (const [name, raw] of Object.entries(element.attrs)) {
    if (name.startsWith('on') || name === 'href' || name === 'xlink:href' || name === 'style') {
      throw new Error(`refusing to emit attribute "${name}"`)
    }
    if (!GLOBAL_ATTRS.has(name)) {
      throw new Error(`refusing to emit unknown attribute "${name}"`)
    }
    const value = typeof raw === 'number' ? String(raw) : raw
    if (!isSafeValue(name, value)) {
      throw new Error(
        `refusing to emit unsafe value for attribute "${name}": ${JSON.stringify(value)}`
      )
    }
    attrs.push(`${name}="${escapeAttribute(value)}"`)
  }

  const open = attrs.length > 0 ? `<${tag} ${attrs.join(' ')}>` : `<${tag}>`
  const { children } = element
  if (children === undefined || children.length === 0) {
    return `${open.slice(0, -1)}/>`
  }
  const body = children.map(child => serialise(child)).join('')
  return `${open}${body}</${tag}>`
}

/** Options for {@link serialiseDocument}. */
export interface SerialiseOptions {
  /** Square canvas size in user units. */
  size: number
  /** Background colour, or `null` for a transparent canvas. */
  background: string | null
}

/**
 * Serialises a full SVG document.
 *
 * Elements are joined with newlines so the output is readable and diffable; the separators are fixed,
 * so the document stays byte-identical for identical input.
 *
 * @param elements - The elements to draw, in paint order.
 * @param options - Canvas size and background colour.
 * @returns A complete SVG document.
 * @throws {Error} When any element fails the safety checks.
 */
export function serialiseDocument(
  elements: readonly SVGElement[],
  options: SerialiseOptions
): string {
  const { size, background } = options
  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img">`,
  ]

  if (background !== null) {
    lines.push(
      `<rect x="0" y="0" width="${size}" height="${size}" fill="${escapeAttribute(background)}"/>`
    )
  }

  for (const element of elements) {
    lines.push(serialise(element))
  }

  lines.push('</svg>')
  return `${lines.join('\n')}\n`
}

/**
 * Builds a `<g>` wrapper.
 *
 * @param children - Child elements.
 * @param attrs - Attributes for the group.
 * @returns The element.
 */
export function group(
  children: readonly SVGElement[],
  attrs: Record<string, string | number> = {}
): SVGElement {
  return { tag: 'g', attrs, children: [...children] }
}

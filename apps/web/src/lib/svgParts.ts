import { pathBounds } from '@sigilgen/path'
import { fmt } from '@sigilgen/format'

/**
 * The generated SVG, broken into the pieces a reader can edit.
 *
 * The generator emits a flat document: one `<svg>` and a run of `<path>` elements, each carrying its own
 * `d` and `fill`. That flatness is what makes the output safe and portable, and it is also the natural
 * unit of editing — a path is one shape, one colour, one thing to move. So a "part" here is a top-level
 * `<path>`, which is the granularity the whole editor is built on.
 *
 * For an abstract mark that is every shape in the composition. For a wordmark it is the pictogram and
 * the word as a whole, because the word is compiled into a single path by the glyph compiler — splitting
 * it back into letters would mean re-parsing the outline, which the project forbids at runtime.
 */

export interface SvgPart {
  /** Path data, absolute `M`/`L`/`C`/`Z` as the generator emits it. */
  d: string
  /** Fill colour, or `null` when the path declares none. */
  fill: string | null
}

export interface SvgParts {
  viewBox: [number, number, number, number]
  parts: SvgPart[]
}

/**
 * Reads the viewBox and every top-level path out of a generated SVG document.
 *
 * Deliberately not a general XML parser. The document is produced by this project's own serializer, so
 * its shape is known and fixed: an `<svg>` with a `viewBox`, then `<path>` elements. A general parser
 * would be more code to test for no behaviour this input can exercise, and would accept documents the
 * generator cannot produce.
 *
 * @param svg - SVG document text.
 * @returns The viewBox and one entry per path, in document order.
 */
export function parseSvgParts(svg: string): SvgParts {
  const tag = svg.match(/<svg\b[^>]*>/i)?.[0] ?? ''
  const box = tag.match(/viewBox\s*=\s*"([^"]*)"/i)?.[1] ?? ''
  const numbers = box
    .split(/[\s,]+/)
    .filter(part => part !== '')
    .map(Number)
  const viewBox: [number, number, number, number] = [
    numbers[0] ?? 0,
    numbers[1] ?? 0,
    numbers[2] ?? 0,
    numbers[3] ?? 0,
  ]

  const parts: SvgPart[] = []
  for (const match of svg.matchAll(/<path\b([^>]*?)\/?>/gi)) {
    const attrs = match[1] ?? ''
    parts.push({
      d: attrs.match(/\bd\s*=\s*"([^"]*)"/i)?.[1] ?? '',
      fill: attrs.match(/fill\s*=\s*"([^"]*)"/i)?.[1] ?? null,
    })
  }
  return { viewBox, parts }
}

/**
 * An edit to one part.
 *
 * Every field is relative to the part as generated, so an edit is a complete description of how that
 * part should differ from the original rather than a delta on top of the last drag. That keeps the
 * history trivial — undo is "restore the previous array" — and means a part can be reset by replacing
 * its entry with {@link emptyEdit}.
 */
export interface PartEdit {
  /** Horizontal shift, in the SVG's own user units. */
  dx: number
  /** Vertical shift, in the SVG's own user units. */
  dy: number
  /** Rotation in degrees, clockwise, about the part's own centre. */
  rotate: number
  /** Uniform scale about the part's own centre. `1` is unchanged. */
  scale: number
  /** Fill override, or `null` to keep the colour the generator chose. */
  fill: string | null
  /** Whether the part is omitted from the output. */
  hidden: boolean
}

/** The edit that changes nothing. */
export function emptyEdit(): PartEdit {
  return { dx: 0, dy: 0, rotate: 0, scale: 1, fill: null, hidden: false }
}

/**
 * The centre of a part's ink, which rotation and scaling turn about.
 *
 * Taken from the path's bounding box rather than from any construction that built it: the box is what a
 * reader sees, and a rotation about anything else drifts the part across the canvas as it turns.
 *
 * @param d - Path data.
 * @returns The centre of the path's bounds.
 */
export function partCentre(d: string): { x: number; y: number } {
  const bounds = pathBounds(d)
  if (bounds === null) {
    return { x: 0, y: 0 }
  }
  return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
}

/**
 * Builds the SVG `transform` attribute for an edited part, or `null` when nothing changed.
 *
 * Rotation and scaling are about the part's own centre, which is why `scale` is written as a translate
 * pair around it rather than a bare `scale` — a bare one turns about the origin and would fling the part
 * off the canvas.
 *
 * @param d - The part's path data, used only to find its centre.
 * @param edit - The edit to apply.
 * @returns A transform string, or `null` for the identity.
 */
export function partTransform(d: string, edit: PartEdit): string | null {
  const pieces: string[] = []
  if (edit.dx !== 0 || edit.dy !== 0) {
    pieces.push(`translate(${fmt(edit.dx)} ${fmt(edit.dy)})`)
  }
  if (edit.rotate !== 0 || edit.scale !== 1) {
    const centre = partCentre(d)
    if (edit.rotate !== 0) {
      pieces.push(`rotate(${fmt(edit.rotate)} ${fmt(centre.x)} ${fmt(centre.y)})`)
    }
    if (edit.scale !== 1) {
      pieces.push(
        `translate(${fmt(centre.x)} ${fmt(centre.y)}) scale(${fmt(edit.scale)}) translate(${fmt(-centre.x)} ${fmt(-centre.y)})`
      )
    }
  }
  return pieces.length === 0 ? null : pieces.join(' ')
}

/**
 * Rebuilds the SVG with the edits applied.
 *
 * Hidden parts are dropped rather than emitted with `display: none`, so the exported file contains only
 * what the reader can see. A part with no edit is emitted exactly as it was, byte for byte, which is what
 * keeps an unedited concept's output identical to the generator's.
 *
 * @param svg - The original SVG document.
 * @param edits - One entry per part, in document order. Missing entries mean "unedited".
 * @returns A new SVG document.
 */
export function applyEdits(svg: string, edits: readonly PartEdit[]): string {
  const { viewBox, parts } = parseSvgParts(svg)
  const children: string[] = []
  parts.forEach((part, index) => {
    const edit = edits[index]
    // An absent entry means the part was never touched, so it passes through untouched. Only an
    // explicit `hidden` drops it — checking `edit === undefined` instead would discard every part of an
    // unedited concept, which is the one case that must survive byte for byte.
    if (edit?.hidden === true) {
      return
    }
    const transform = edit === undefined ? null : partTransform(part.d, edit)
    const fill = edit?.fill ?? part.fill
    const attributes = [`d="${part.d}"`]
    if (fill !== null) {
      attributes.push(`fill="${fill}"`)
    }
    const path = `<path ${attributes.join(' ')}/>`
    children.push(transform === null ? path : `<g transform="${transform}">${path}</g>`)
  })
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}" width="${viewBox[2]}" height="${viewBox[3]}" role="img">`,
    ...children,
    '</svg>',
    // The generator's own serializer ends the document with a newline, and an unedited concept has to
    // come out byte-identical to it — so the trailing newline is reproduced rather than omitted.
    '',
  ].join('\n')
}

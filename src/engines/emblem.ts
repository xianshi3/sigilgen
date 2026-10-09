/**
 * Emblem engine — a framed, badge-like composition.
 *
 * Emblems answer briefs that want a mark with an edge: hospitality, manufacturing, heritage, sports.
 * The frame is the primary form; the pictogram sits inside it and the name is set beneath, all within
 * one silhouette.
 *
 * The frame must not strangle its contents, so the engine budgets the interior: the pictogram gets a
 * fixed share of the frame's inner height, the name gets what is left, and the frame's own stroke is
 * proportional rather than absolute so the whole thing scales.
 */

import { iconInkSize, path, pick, placeIcon, wordmarkLetters } from './shared'
import { contrastFill } from './monogram'
import { readableOn } from '../resolvers/palette-resolver'
import { fitText, opticalTracking } from './metrics'
import { textPath } from '../text'
import { discPath, regularPolygonPath, shieldPath } from '../geometry'
import type { Engine, EngineInput, FontEntry, IconEntry, SVGElement } from '../types'

/** Frame shapes available to the engine. */
export const FRAMES: readonly string[] = ['shield', 'hexagon', 'circle', 'banner']

/** Frames are sized so the widest one still clears the canvas edges. */
const FRAME_RATIO = 0.86

/**
 * Letterspacing an emblem adds to its name, as a fraction of cap height.
 *
 * The name sits inside a frame with a pictogram above it, so it is glanced at rather than read. A
 * little extra air keeps it from crowding the frame; much more than this and it starts to collide with
 * the border, which the fitting pass cannot see because it only knows the interior box.
 */
const EMBLEM_TRACKING = 0.03

/** The icon, the gap and the name split the interior block between them. */
const BLOCK_SHARES = { icon: 0.48, gap: 0.14, name: 0.38 } as const

/**
 * How much usable room each frame gives the composition inside it, as fractions of the frame's own
 * bounding box.
 *
 * `block` is the height the icon and name together may occupy. It is a fraction rather than an
 * absolute unit because the frames differ so much in proportion — a banner is three times wider than
 * it is tall — and an absolute inset that looks right in a disc puts the name outside a banner
 * entirely.
 *
 * The name's *width* is not budgeted here. It is measured from the frame's own outline by
 * {@link frameHalfWidth}, so that a change to a frame's proportions cannot leave the type hanging
 * outside the badge.
 */
const FRAME_ROOM: Record<string, { block: number; lift: number }> = {
  circle: { block: 0.64, lift: 0 },
  hexagon: { block: 0.68, lift: 0 },
  shield: { block: 0.54, lift: 0.05 },
  banner: { block: 0.7, lift: 0 },
}

/** Fraction of the frame's available width the name may use, leaving a margin at the edges. */
const NAME_MARGIN = 0.88

/**
 * Half the width of a frame at a given row.
 *
 * The emblem's frames are not all the same shape, and three of the four are narrower at some rows
 * than at their widest point: a shield tapers to a point, a hexagon has shoulders, a banner has
 * notched corners. Anything set inside a frame has to be budgeted against the *narrowest* row it
 * will occupy, not the frame's maximum width, or it hangs out over the edge.
 *
 * @param frame - One of {@link FRAMES}.
 * @param centre - Centre of the canvas.
 * @param frameRadius - Radius of the frame.
 * @param y - Row to measure.
 * @returns Half-width in user units, or `0` outside the frame.
 */
export function frameHalfWidth(
  frame: string,
  centre: number,
  frameRadius: number,
  y: number
): number {
  const box = frameBox(frame, centre, frameRadius)
  const bottom = box.top + box.height
  // A frame has no width outside its own vertical extent. The shapes below are all described by what
  // happens *inside* that band, so without this guard a row above a shield would report full width.
  if (y < box.top || y > bottom) {
    return 0
  }
  switch (frame) {
    case 'banner': {
      const half = box.width / 2
      // The notch lifts the two bottom corners, so the flag narrows over the last `notch` of height.
      const shoulder = bottom - box.notch
      if (y <= shoulder) {
        return half
      }
      return Math.max(0, half - (y - shoulder))
    }
    case 'shield': {
      // Full width down to the midpoint, then a straight run to the point at the bottom.
      const breakY = box.top + box.height / 2
      if (y <= breakY) {
        return frameRadius
      }
      return Math.max(0, (frameRadius * (bottom - y)) / (bottom - breakY))
    }
    case 'hexagon': {
      // Pointy-topped: full width across the middle third, tapering to a vertex top and bottom.
      const half = (Math.sqrt(3) / 2) * frameRadius
      const shoulder = box.height / 4
      const dy = Math.abs(y - centre)
      if (dy <= shoulder) {
        return half
      }
      return Math.max(0, half * ((box.height / 2 - dy) / (box.height / 2 - shoulder)))
    }
    case 'circle':
    default: {
      const dy = y - centre
      const squared = frameRadius * frameRadius - dy * dy
      return squared > 0 ? Math.sqrt(squared) : 0
    }
  }
}

/** The bounding box of a frame, which is what the interior is budgeted against. */
interface FrameBox {
  /** Top edge y. */
  top: number
  /** Overall height. */
  height: number
  /** Overall width. */
  width: number
  /** Depth of the banner's centre notch, or `0` for frames that have none. */
  notch: number
}

/**
 * Measures a frame's bounding box.
 *
 * `framePath` and the interior layout both read this, so the composition can never be positioned
 * against a rectangle the frame does not actually occupy.
 *
 * @param frame - One of {@link FRAMES}.
 * @param centre - Centre of the canvas.
 * @param frameRadius - Radius of the frame.
 * @returns The bounding box.
 */
function frameBox(frame: string, centre: number, frameRadius: number): FrameBox {
  switch (frame) {
    case 'banner': {
      const width = frameRadius * 1.86
      // Half the height, so the box is centred on the canvas like every other frame. At 0.72 the box
      // ran from -0.72r to +0.56r, whose centre is -0.08r — a badge sitting a twentieth of the canvas
      // above the middle, which reads as a mistake rather than as a raised flag.
      return {
        top: centre - frameRadius * 0.64,
        height: frameRadius * 1.28,
        width,
        notch: width * 0.1,
      }
    }
    case 'shield':
    case 'hexagon':
    case 'circle':
    default:
      // The shield's box is its full extent even though only its top half is full width.
      return {
        top: centre - frameRadius,
        height: frameRadius * 2,
        width: frameRadius * 2,
        notch: 0,
      }
  }
}

/**
 * Builds the frame path for a badge shape.
 *
 * @param frame - One of {@link FRAMES}.
 * @param centre - Centre of the canvas.
 * @param size - Canvas size.
 * @returns Path data.
 */
export function framePath(frame: string, centre: number, size: number): string {
  const radius = (size * FRAME_RATIO) / 2
  switch (frame) {
    case 'shield':
      return shieldPath(centre, centre - radius, radius * 2, radius * 2, 0.5)
    case 'hexagon':
      return regularPolygonPath(centre, centre, radius, 6, -90)
    case 'banner': {
      const box = frameBox('banner', centre, radius)
      const { top, height, width, notch } = box
      return [
        `M ${centre - width / 2} ${top}`,
        `L ${centre + width / 2} ${top}`,
        `L ${centre + width / 2} ${top + height - notch}`,
        `L ${centre + width / 2 - notch} ${top + height}`,
        `L ${centre - width / 2 + notch} ${top + height}`,
        `L ${centre - width / 2} ${top + height - notch}`,
        'Z',
      ].join(' ')
    }
    case 'circle':
    default:
      // A solid disc, not a ring: the interior is where the icon and the name live, so the frame has to
      // be a real filled shape for the reversed-out type to read.
      return discPath(centre, centre, radius)
  }
}

/**
 * Draws an emblem.
 *
 * @param input - The engine input.
 * @returns The SVG elements that make up the mark.
 */
export const emblem: Engine = (input: EngineInput): SVGElement[] => {
  const { palette, font, seed, size, icon } = input
  const frame = pick(FRAMES, seed, input.request.preferences.frame)
  const letters = wordmarkLetters(input)

  const centre = size / 2
  const frameRadius = (size * FRAME_RATIO) / 2

  const frameFill = palette.primary
  const innerFill = contrastFill(palette, frameFill)
  const iconFill =
    palette.accent === frameFill ? innerFill : readableOn(palette.accent, frameFill, innerFill)

  const elements: SVGElement[] = [path(framePath(frame, centre, size), frameFill)]
  elements.push(
    ...drawSealStack(frame, icon, letters, centre, frameRadius, iconFill, innerFill, font)
  )

  input.mood.notes.push(
    `Emblem in a ${frame} frame with the icon and the name stacked inside a single silhouette.`
  )

  return elements
}

/**
 * Lays out an icon and a name inside a closed frame.
 *
 * The interior is budgeted rather than positioned by eye: a share of the frame's inner diameter goes
 * to the pictogram, a share to the name, and the rest to the gap between them. The block is then
 * centred as a unit, which is what keeps the composition balanced whatever the name's length.
 *
 * @param icon - The pictogram, or `null` when none resolved.
 * @param letters - The name to set.
 * @param centre - Centre of the canvas.
 * @param frameRadius - Radius of the frame.
 * @param iconFill - Colour for the pictogram.
 * @param innerFill - Colour for the type.
 * @param font - The typeface.
 * @returns The SVG elements.
 */
function drawSealStack(
  frame: string,
  icon: IconEntry | null,
  letters: string,
  centre: number,
  frameRadius: number,
  iconFill: string,
  innerFill: string,
  font: FontEntry
): SVGElement[] {
  const elements: SVGElement[] = []
  const box = frameBox(frame, centre, frameRadius)
  const room =
    FRAME_ROOM[frame] ?? (FRAME_ROOM['hexagon'] as { block: number; name: number; lift: number })
  const hasName = letters !== ''

  // With no name to set, the icon takes the whole block: a pictogram floating in the middle of a
  // badge reads worse than one that fills it.
  const iconShare = hasName ? BLOCK_SHARES.icon : 1
  const nameShare = hasName ? BLOCK_SHARES.name : 0
  const gapShare = hasName ? BLOCK_SHARES.gap : 0

  const blockHeight = box.height * room.block
  const iconBox = blockHeight * iconShare
  const nameHeight = blockHeight * nameShare
  const gap = blockHeight * gapShare

  // The pictogram is letterboxed inside its own box, so its ink is shorter than `iconBox` whenever it
  // is not square. Everything below is placed on the ink, not on the room reserved for it.
  const iconInk = icon === null ? { width: iconBox, height: iconBox } : iconInkSize(icon, iconBox)

  if (hasName) {
    const tracking = opticalTracking(font, EMBLEM_TRACKING)

    // Provisional band, used only to measure how much width the frame actually offers at the rows the
    // name will occupy. A tapered frame must not hand it more room than it has, so the narrowest of
    // those two rows is the budget.
    const provisional = box.top + (box.height - blockHeight) / 2 - frameRadius * room.lift
    const nameBandTop = provisional + iconBox + gap
    const narrowest = Math.min(
      frameHalfWidth(frame, centre, frameRadius, nameBandTop),
      frameHalfWidth(frame, centre, frameRadius, nameBandTop + nameHeight)
    )
    const fitted = fitText(
      font,
      letters,
      centre,
      nameBandTop,
      narrowest * 2 * NAME_MARGIN,
      nameHeight,
      tracking
    )

    // Centre the two *inks* in the frame, then hang the name off the pictogram's ink with the clear gap
    // the table asked for. `nameHeight` is a budget, not a prediction: a long name in a narrow frame
    // comes out far shorter than the band reserved for it, and `fitText` then centred that shorter run
    // inside the taller band. Every badge therefore sat high inside its own frame, by about a
    // twentieth of the block, while each slot was placed exactly where the table said it should be.
    const inkHeight = iconInk.height + gap + fitted.ink.height
    const inkTop = box.top + (box.height - inkHeight) / 2 - frameRadius * room.lift
    const iconTop = inkTop - (iconBox - iconInk.height) / 2
    const capTop = inkTop + iconInk.height + gap - fitted.ink.offsetY

    if (icon !== null) {
      elements.push(placeIcon(icon, centre - iconBox / 2, iconTop, iconBox, iconFill))
    }
    elements.push(
      path(textPath(font, letters, fitted.left, capTop, fitted.scale, tracking), innerFill)
    )
    return elements
  }

  // With no name the pictogram is the whole composition, so it centres on the frame directly.
  if (icon !== null) {
    const inkTop = box.top + (box.height - iconInk.height) / 2 - frameRadius * room.lift
    elements.push(
      placeIcon(
        icon,
        centre - iconBox / 2,
        inkTop - (iconBox - iconInk.height) / 2,
        iconBox,
        iconFill
      )
    )
  }
  return elements
}

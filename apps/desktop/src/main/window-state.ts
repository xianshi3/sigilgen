/**
 * Window geometry that survives a restart, and the rules that keep it visible.
 *
 * This module deliberately knows nothing about Electron: it takes plain rectangles and returns plain
 * rectangles, so the awkward part — a window restored onto a monitor that is no longer plugged in, or
 * one saved on a 4K screen and reopened on a laptop — is testable without launching a window.
 */

/** A rectangle in screen coordinates, in device-independent pixels. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** What is written to disk between runs. */
export interface SavedWindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

/** One display's usable area, excluding the taskbar or dock. */
export interface DisplayArea {
  workArea: Rect
}

/** The geometry a new window should open with. */
export interface RestoredWindowState {
  bounds: Rect
  maximized: boolean
}

/** Width of a window that has never been opened before. */
export const DEFAULT_WINDOW_WIDTH = 1440

/** Height of a window that has never been opened before. */
export const DEFAULT_WINDOW_HEIGHT = 900

/** The narrowest the three-column studio is allowed to get. Below this the mark stops being judgeable. */
export const MIN_WINDOW_WIDTH = 960

/** The shortest the studio is allowed to get before the stage loses its vertical rhythm. */
export const MIN_WINDOW_HEIGHT = 640

/**
 * How much of a saved window must still be on some display for it to be kept.
 *
 * A window whose title bar is one pixel inside a monitor cannot be grabbed, and a window with only a
 * corner showing is not much better. Requiring a strip that a pointer can actually reach is the
 * difference between "restored" and "lost".
 */
const MIN_VISIBLE_WIDTH = 120

/** Vertical counterpart of {@link MIN_VISIBLE_WIDTH}; a title bar needs a grabbable height too. */
const MIN_VISIBLE_HEIGHT = 80

/**
 * Clamps a number into an inclusive range.
 *
 * @param value - The number to clamp.
 * @param minimum - Lower bound.
 * @param maximum - Upper bound.
 * @returns The clamped value.
 */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

/**
 * Whether a finite number survived the round trip through JSON.
 *
 * @param value - A candidate coordinate.
 * @returns `true` when the value can be used as a coordinate.
 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * The area shared by two rectangles.
 *
 * @param a - First rectangle.
 * @param b - Second rectangle.
 * @returns Width and height of the overlap, both zero when they do not intersect.
 */
function overlap(a: Rect, b: Rect): { width: number; height: number } {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return { width: Math.max(0, width), height: Math.max(0, height) }
}

/**
 * Places a window in the middle of a display.
 *
 * @param width - Window width.
 * @param height - Window height.
 * @param area - The display's usable area.
 * @returns Centred bounds, rounded to whole pixels.
 */
function centred(width: number, height: number, area: Rect): Rect {
  return {
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
    width,
    height,
  }
}

/**
 * Turns whatever was on disk into bounds that are safe to open.
 *
 * The rules, in order:
 *
 *   1. A missing or malformed size falls back to the default.
 *   2. The size is clamped to the smallest usable studio and the largest display, so a window saved on
 *      a 4K monitor does not open larger than a laptop screen.
 *   3. A position is kept only when a grabbable strip of the title bar is on a connected display.
 *      Otherwise the window is centred on the primary display.
 *
 * The maximized flag is carried separately rather than folded into the bounds, because the normal
 * bounds are what should be restored when the window is later unmaximized.
 *
 * @param saved - Parsed contents of the state file, or `null` when there is none.
 * @param displays - Every connected display, each with its usable area.
 * @param primary - The primary display's usable area.
 * @returns Bounds and maximized state for the new window.
 */
export function restoreWindowState(
  saved: unknown,
  displays: DisplayArea[],
  primary: Rect
): RestoredWindowState {
  const candidate =
    typeof saved === 'object' && saved !== null ? (saved as Partial<SavedWindowState>) : {}
  let largestWidth = primary.width
  let largestHeight = primary.height
  for (const display of displays) {
    largestWidth = Math.max(largestWidth, display.workArea.width)
    largestHeight = Math.max(largestHeight, display.workArea.height)
  }

  const width = clamp(
    isFiniteNumber(candidate.width) ? Math.round(candidate.width) : DEFAULT_WINDOW_WIDTH,
    MIN_WINDOW_WIDTH,
    Math.max(MIN_WINDOW_WIDTH, largestWidth)
  )
  const height = clamp(
    isFiniteNumber(candidate.height) ? Math.round(candidate.height) : DEFAULT_WINDOW_HEIGHT,
    MIN_WINDOW_HEIGHT,
    Math.max(MIN_WINDOW_HEIGHT, largestHeight)
  )

  const maximized = candidate.maximized === true

  if (!isFiniteNumber(candidate.x) || !isFiniteNumber(candidate.y)) {
    return { bounds: centred(width, height, primary), maximized }
  }

  const bounds: Rect = {
    x: Math.round(candidate.x),
    y: Math.round(candidate.y),
    width,
    height,
  }

  const visible = displays.some(display => {
    const shared = overlap(bounds, display.workArea)
    return shared.width >= MIN_VISIBLE_WIDTH && shared.height >= MIN_VISIBLE_HEIGHT
  })

  return { bounds: visible ? bounds : centred(width, height, primary), maximized }
}

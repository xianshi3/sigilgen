/**
 * The three widths the layout is built from.
 *
 * They live here rather than in `App.tsx` because the panel widths and the breakpoint that depends on
 * them are two halves of one decision, and a breakpoint typed as a literal stops being true the moment
 * a panel is resized. The narrow query is *derived* from the widths below, so widening a panel moves the
 * boundary with it instead of silently reintroducing a stage too small to judge a mark in.
 */

/** Width of the left panel, in CSS pixels. Fixed: it holds inputs with no meaningful minimum width. */
export const PANEL_WIDTH_LEFT = 288

/** Width of the right panel, in CSS pixels. Fixed, for the same reason. */
export const PANEL_WIDTH_RIGHT = 300

/**
 * Narrowest stage the studio is willing to show.
 *
 * Not a taste call. Below this the mark cannot be judged, which is the one thing the stage exists for,
 * so a narrower stage is worse than no three-column layout at all.
 */
export const MIN_STAGE_WIDTH = 420

/** What the two panels consume before the stage gets anything. */
export const PANELS_TOTAL_WIDTH = PANEL_WIDTH_LEFT + PANEL_WIDTH_RIGHT

/**
 * Viewport width below which the panels become drawers over the stage.
 *
 * Two panels plus a stage worth looking at. Measured: at 768 CSS pixels the old 900px breakpoint left
 * the stage 180px wide and the mark rendered at 116px — both panels fitted comfortably and the canvas
 * was still unusable, because the question the breakpoint has to answer is not "does the panel fit" but
 * "is there room left for the thing the reader came to look at".
 */
export const NARROW_BREAKPOINT = PANELS_TOTAL_WIDTH + MIN_STAGE_WIDTH

/**
 * The media query for that boundary.
 *
 * `NARROW_BREAKPOINT - 1` rather than `NARROW_BREAKPOINT`, because `max-width` is inclusive: at exactly
 * the boundary there is room for the full three columns, so that width must not read as narrow.
 */
export const NARROW_QUERY = `(max-width: ${NARROW_BREAKPOINT - 1}px)`

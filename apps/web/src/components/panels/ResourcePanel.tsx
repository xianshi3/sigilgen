import { FontPicker } from './FontPicker'
import { IconPicker } from './IconPicker'
import { PalettePicker } from './PalettePicker'

/**
 * The curated brain, offered as choices.
 *
 * Palette, typeface and pictogram are three different kinds of control — a swatch, a specimen, a
 * searchable grid — but they answer one question: given the composition the engine is going to draw,
 * what should it be drawn with. They sit together rather than scattering into the engine and canvas
 * settings because that is the order a reader works in: shape first, then colour, then letterform,
 * then detail.
 *
 * Each group folds away with its current value still readable in the heading, because a hundred and
 * twenty one items rendered at once would push the brand name out of the sidebar entirely.
 */
export function ResourcePanel() {
  return (
    <>
      <PalettePicker />
      <FontPicker />
      <IconPicker />
    </>
  )
}

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { I18nProvider } from '../src/i18n/I18nProvider'
import { Button } from '../src/components/primitives/Button'
import { RangeField } from '../src/components/primitives/RangeField'
import { Segmented } from '../src/components/primitives/Segmented'
import { Toggle } from '../src/components/primitives/Toggle'
import { StageBar } from '../src/components/stage/StageBar'

/**
 * The interactive floor, and the controls that have to sit on it.
 *
 * A control shorter than its neighbour is a control harder to hit than its neighbour, and that is the kind
 * of difference a reader feels without being able to name. The stage bar had both values in one row: 28px
 * zoom buttons and a reroll beside a 31px segmented control, with 32px inputs and disclosure rows in the
 * panels. Nothing was wrong enough to see, which is why it survived.
 *
 * The value is asserted, not the arithmetic. jsdom does no layout, so nothing here can measure a rendered
 * height — what it can do is check the one token the heights come from, and check that the controls still
 * reach for it rather than for a literal. That second half is the part that rots.
 */

/** True when a class list puts the floor on the height, either exactly or as a minimum. */
function usesFloor(classes: string): boolean {
  return classes.includes('h-[var(--control-h)]') || classes.includes('min-h-[var(--control-h)]')
}

describe('the interactive floor', () => {
  it('is tall enough to be a target rather than merely a shape', () => {
    const css = readFileSync('src/styles/tokens.css', 'utf8')
    const match = /--control-h:\s*([\d.]+)(rem|px);/.exec(css)
    expect(match, 'no --control-h in the token sheet').not.toBeNull()
    const size = Number(match?.[1])
    const px = match?.[2] === 'rem' ? size * 16 : size

    // WCAG 2.2 asks for 24 for a pointer. 32 is where this lands because 32 is what the text inputs and
    // the disclosure rows already used: the floor is the taller of two values the app already had, not a
    // new opinion about density. Dropping below it puts controls back under their neighbours.
    expect(px, 'under WCAG 2.2 minimum target size').toBeGreaterThanOrEqual(24)
    expect(px, 'below the height the inputs already used').toBeGreaterThanOrEqual(32)
  })

  it('is applied by Button, at both tiers', () => {
    // Both, because `sm` is the tier that was below: 28px, next to 32px inputs.
    for (const size of ['sm', 'md'] as const) {
      const { container } = render(<Button size={size}>Reroll</Button>)
      expect(usesFloor(container.querySelector('button')?.className ?? ''), `Button ${size}`).toBe(
        true
      )
    }
  })

  it('is applied by every segment of a segmented control', () => {
    // `py-1` around a caption line came to 31px, and to a different height in each locale, because a Han
    // line and a Latin line are not the same height.
    const { container } = render(
      <Segmented
        aria-label="backdrop"
        value="light"
        options={[
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
          { value: 'board', label: 'Checkerboard' },
        ]}
        onChange={() => {}}
      />
    )
    const segments = [...container.querySelectorAll('button')]
    expect(segments).toHaveLength(3)
    for (const segment of segments) {
      expect(usesFloor(segment.className)).toBe(true)
    }
  })

  it('is applied by a slider, whose box is the whole hit area', () => {
    // It was 16px tall with a 12px thumb, over a 238px track: a mouse could drag it and a thumb could not.
    const { container } = render(
      <RangeField label="Concepts" value={3} min={1} max={6} onChange={() => {}} />
    )
    expect(usesFloor(container.querySelector('input[type="range"]')?.className ?? '')).toBe(true)
  })

  it('is applied by a switch through its label, not through the 20px track', () => {
    const { container } = render(<Toggle checked={false} onChange={() => {}} label="Opaque" />)
    expect(usesFloor(container.querySelector('label')?.className ?? '')).toBe(true)
  })

  it('is applied by the zoom readout, which is a button only in that it is clickable', () => {
    const { container } = render(
      <I18nProvider initialLocale="en">
        <StageBar />
      </I18nProvider>
    )
    const readout = container.querySelector('button.tabular-nums')
    expect(readout, 'no zoom readout in the stage bar').not.toBeNull()
    expect(usesFloor(readout?.className ?? '')).toBe(true)
  })

  it('reaches the two controls that no fixture can render cheaply', () => {
    // Read from source, and only these two: the fill swatch needs a selected part on a generated concept,
    // and the panel handle is local to `App`. Rendering either would mean building a fixture that tests a
    // great deal more than the one claim being made here.
    for (const path of [
      'src/components/panels/InspectorPanel.tsx',
      'src/components/stage/StageBar.tsx',
    ]) {
      expect(readFileSync(path, 'utf8'), path).toContain('h-[var(--control-h)]')
    }
  })

  it('gives the panel handle a width a finger can find', () => {
    // It was `w-4`: a 16px target on the only control that opens a drawer, which is the single control a
    // reader on a touch screen has to locate. It floats over the stage, so the extra 8px costs nothing.
    expect(readFileSync('src/App.tsx', 'utf8')).toContain('h-11 w-6')
  })
})

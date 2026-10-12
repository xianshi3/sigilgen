import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactElement } from 'react'
import { Segmented } from '../src/components/primitives/Segmented'
import { TextField } from '../src/components/primitives/TextField'

/**
 * The primitives, and the accessibility contract they carry.
 *
 * A primitive is the one place a mistake is paid for everywhere it is used, and `Segmented` in particular
 * claims `role="radiogroup"`, which is a contract rather than a label: one tab stop, arrow keys to move,
 * selection following focus. None of that is visible in the markup, and none of it was tested.
 */

/**
 * A Segmented wired to local state, the way every caller uses it.
 *
 * Controlled components cannot be driven from a test without somewhere for the value to live, and the
 * point of most of these assertions is that the *selection* changed — which has to be observable.
 *
 * @param props - Initial value, the options, and an optional change spy.
 * @returns The rendered control.
 */
function Harness<T extends string>({
  initial,
  options,
  onChange,
}: {
  initial: T
  options: { value: T; label: string }[]
  onChange?: (value: T) => void
}): ReactElement {
  const [current, setCurrent] = useState<T>(initial)
  return (
    <Segmented
      aria-label="Test group"
      value={current}
      options={options}
      onChange={next => {
        setCurrent(next)
        onChange?.(next)
      }}
    />
  )
}

beforeEach(() => {
  localStorage.clear()
})

describe('Segmented', () => {
  const OPTIONS = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
    { value: 'c', label: 'Gamma' },
  ]

  it('is a single tab stop, not one per option', () => {
    // A group of three radios that are each tabbable means a keyboard reader crosses three stops to get
    // past one control. The selected option holds the group's only tab stop.
    render(<Harness initial="b" options={OPTIONS} />)
    const radios = screen.getAllByRole('radio')
    expect(radios.map(r => r.tabIndex)).toEqual([-1, 0, -1])
  })

  it('moves selection and focus with the arrow keys', async () => {
    const user = userEvent.setup()
    const changed: string[] = []
    render(<Harness initial="a" options={OPTIONS} onChange={v => changed.push(v)} />)

    const first = screen.getAllByRole('radio')[0] as HTMLElement
    first.focus()
    await user.keyboard('{ArrowRight}')

    expect(changed).toEqual(['b'])
    expect(screen.getAllByRole('radio')[1]).toHaveFocus()
    expect(screen.getAllByRole('radio')[1]).toHaveAttribute('aria-checked', 'true')
  })

  it('wraps at both ends rather than sticking', async () => {
    // A held arrow key should cycle. Landing on the end and stopping reads as a dead key.
    const user = userEvent.setup()
    const changed: string[] = []
    render(<Harness initial="a" options={OPTIONS} onChange={v => changed.push(v)} />)

    ;(screen.getAllByRole('radio')[0] as HTMLElement).focus()
    await user.keyboard('{ArrowLeft}')
    expect(changed).toEqual(['c'])

    await user.keyboard('{ArrowRight}')
    expect(changed).toEqual(['c', 'a'])
  })

  it('jumps to the ends with Home and End', async () => {
    const user = userEvent.setup()
    const changed: string[] = []
    render(<Harness initial="b" options={OPTIONS} onChange={v => changed.push(v)} />)

    ;(screen.getAllByRole('radio')[1] as HTMLElement).focus()
    await user.keyboard('{End}')
    expect(changed).toEqual(['c'])
    await user.keyboard('{Home}')
    expect(changed).toEqual(['c', 'a'])
  })

  it('leaves other keys to the browser', async () => {
    // `preventDefault` on everything would break typing, and space/enter have to keep activating buttons.
    const user = userEvent.setup()
    const changed: string[] = []
    render(<Harness initial="a" options={OPTIONS} onChange={v => changed.push(v)} />)
    ;(screen.getAllByRole('radio')[0] as HTMLElement).focus()
    await user.keyboard('{Tab}')
    expect(changed).toEqual([])
  })

  it('keeps a group reachable when nothing is selected', () => {
    // A stored value naming an option that no longer exists leaves the group with no tab stop at all,
    // which is worse than showing a stale selection.
    render(<Harness initial={'missing' as 'a'} options={OPTIONS} />)
    const tabbable = screen.getAllByRole('radio').filter(r => r.tabIndex === 0)
    expect(tabbable).toHaveLength(1)
  })

  it('does not move on arrow keys when it has no options', async () => {
    const user = userEvent.setup()
    const changed: string[] = []
    render(<Harness initial="a" options={[]} onChange={v => changed.push(v)} />)
    await user.keyboard('{ArrowRight}')
    expect(changed).toEqual([])
  })

  it('still selects by click', async () => {
    const user = userEvent.setup()
    const changed: string[] = []
    render(<Harness initial="a" options={OPTIONS} onChange={v => changed.push(v)} />)
    await user.click(screen.getByRole('radio', { name: 'Gamma' }))
    expect(changed).toEqual(['c'])
  })

  it('anchors the highlight at the padding box rather than its static position', () => {
    // An absolutely positioned element with no `left` sits at its *static* position, which inside a
    // padded flex container is the content box — the container's own padding to the right. The highlight
    // is then offset by exactly that padding and never lands on its label, however carefully it is
    // measured. `left-0` is what makes the measured offset mean what it says.
    const { container } = render(<Harness initial="a" options={OPTIONS} />)
    const pill = container.querySelector('span[aria-hidden="true"]')
    expect(pill?.className).toContain('left-0')
  })

  it('never derives the highlight from the option count', () => {
    // The segments are not equal width — "中文" is two Han glyphs and "English" is seven Latin ones, and
    // the gap between them is not zero either — so dividing the track by the number of options puts the
    // highlight somewhere other than its label, further off the further right the selection goes. The
    // old `translateX(index * 100%)` over `calc((100% - 0.25rem) / n)` was wrong twice over: the track is
    // inset by the container's padding, which is twice that, and the columns are not equal to begin with.
    //
    // jsdom resolves no layout, so this cannot compare the boxes. It can assert that the position comes
    // from a measurement of the selected button rather than from arithmetic — which is what was reverted
    // when this was measured in a browser and found 6.5px wide and 6.5px off at the second segment.
    const { container } = render(<Harness initial="c" options={OPTIONS} />)
    const pill = container.querySelector('span[aria-hidden="true"]') as HTMLElement | null
    expect(pill).not.toBeNull()
    // Measured pixels, not a percentage of anything.
    expect(pill?.style.width).toMatch(/px$/)
    expect(pill?.style.transform ?? '').toMatch(/translateX\(\d/)
    expect(pill?.style.transform ?? '').not.toContain('%')
  })
})

describe('TextField', () => {
  it('gives the input its label and keeps the hint out of the name', () => {
    // Text inside a `<label>` becomes part of the accessible name, so a field would be announced together
    // with its own instructions. The hint belongs on `aria-describedby`.
    render(
      <TextField
        id="field-example"
        label="Brand name"
        hint="Only A–Z are used"
        value=""
        onChange={() => {}}
      />
    )
    const input = screen.getByLabelText('Brand name')
    expect(input).toHaveAttribute('aria-describedby', 'field-example-hint')
    expect(input).not.toHaveAttribute('aria-label', expect.stringContaining('A–Z') as never)
  })

  it('renders the hint container even with no hint, so removing one cannot reflow the fields below', () => {
    const { container } = render(<TextField id="f" label="Name" value="" onChange={() => {}} />)
    expect(container.querySelector('#f-hint')).not.toBeNull()
  })

  it('has no accessible name at all when no id is given', () => {
    // Worth asserting so the decision is explicit rather than accidental: without an `id` there is
    // nothing for `<label htmlFor>` to point at, and the control is anonymous.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(<TextField label="Nameless" value="" onChange={() => {}} />)
      expect(screen.queryByLabelText('Nameless')).toBeNull()
    } finally {
      spy.mockRestore()
    }
  })
})

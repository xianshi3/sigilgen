import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../src/lib/contrast'

/**
 * The design system's contrast contract, checked against the stylesheet the browser is given.
 *
 * These are the numbers an eye cannot check: a colour pair that is slightly too close reads as "a bit
 * pale" and ships. Two failures of exactly that kind prompted this file — `--ink-faint` at 3.20:1 and the
 * empty state's theme ink on the opposite paper at 1.45:1 — and neither was visible by inspection,
 * because in each case the pairing that matched looked fine.
 *
 * The stylesheet is parsed rather than restated. A test holding its own copy of the colours agrees with
 * itself and says nothing about what the app paints.
 */

/** The body of every rule with exactly this selector, brace-matched so a nested rule cannot end it. */
function bodies(css: string, selector: string): string[] {
  const needle = `${selector} {`
  const found: string[] = []
  let from = 0
  for (;;) {
    const start = css.indexOf(needle, from)
    if (start === -1) {
      return found
    }
    const open = start + needle.length - 1
    let depth = 0
    let end = -1
    for (let at = open; at < css.length; at += 1) {
      const character = css[at]
      if (character === '{') {
        depth += 1
      } else if (character === '}') {
        depth -= 1
        if (depth === 0) {
          end = at
          break
        }
      }
    }
    if (end === -1) {
      return found
    }
    found.push(css.slice(open + 1, end))
    from = end
  }
}

/** Every custom property that selector declares, later declarations winning as they do in the cascade. */
function declarations(css: string, selector: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const body of bodies(css, selector)) {
    for (const match of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
      const name = match[1]
      const value = match[2]
      if (name !== undefined && value !== undefined) {
        out[name] = value.trim()
      }
    }
  }
  return out
}

const sheet = readFileSync('src/styles/tokens.css', 'utf8')

/** `:root` is the light theme plus everything deliberately unthemed: paper, scrims, sheet ink. */
const light = declarations(sheet, ':root')
const dark = { ...light, ...declarations(sheet, ":root[data-theme='dark']") }
const darkSheet = { ...light, ...declarations(sheet, "[data-paper='dark']") }

/** AA for normal text. Every ink here is used at caption size or below, so there is no "large text" case. */
const MIN_TEXT = 4.5
/** WCAG's bar for the part of a control that carries meaning without being read as text. */
const MIN_INDICATOR = 3

/** Where an ink can land. The stage is here because it is the largest surface in the app. */
const GROUNDS = ['surface', 'surface-raised', 'surface-sunken', 'stage']
const INKS = ['ink', 'ink-soft', 'ink-faint']
const SHEET_INKS = ['sheet-ink', 'sheet-ink-soft', 'sheet-ink-faint']
/** Both pale papers plus the darker checkerboard square, which is the worst of the two. */
const PALE_SHEETS = ['paper-light', 'paper-checker-a', 'paper-checker-b']

/** Every ink against every ground, as a label that names the pair and the ratio it measures. */
function pairs(
  inks: string[],
  grounds: string[],
  tokens: Record<string, string>
): [string, number | null][] {
  const out: [string, number | null][] = []
  for (const ink of inks) {
    for (const ground of grounds) {
      out.push([`--${ink} on --${ground}`, contrastRatio(tokens[ink] ?? '', tokens[ground] ?? '')])
    }
  }
  return out
}

describe('the token sheet on contrast', () => {
  it('keeps every text ink above AA on every ground it can land on', () => {
    for (const [theme, tokens] of [
      ['light theme', light],
      ['dark theme', dark],
    ] as const) {
      for (const [label, ratio] of pairs(INKS, GROUNDS, tokens)) {
        expect(ratio, `${theme}: ${label}`).toBeGreaterThanOrEqual(MIN_TEXT)
      }
    }
  })

  it('keeps text on the sheet legible against the paper it is written on', () => {
    // The pairings the app actually makes: the sheet is `data-paper="dark"` only for the dark paper, and
    // the checkerboard is a pale paper with a stripe.
    for (const [label, ratio] of pairs(SHEET_INKS, PALE_SHEETS, light)) {
      expect(ratio, `pale sheet: ${label}`).toBeGreaterThanOrEqual(MIN_TEXT)
    }
    for (const [label, ratio] of pairs(SHEET_INKS, ['paper-dark'], darkSheet)) {
      expect(ratio, `dark sheet: ${label}`).toBeGreaterThanOrEqual(MIN_TEXT)
    }
  })

  it('keeps the accent above the non-text bar wherever it marks something', () => {
    for (const [theme, tokens] of [
      ['light theme', light],
      ['dark theme', dark],
    ] as const) {
      for (const [label, ratio] of pairs(['accent'], GROUNDS, tokens)) {
        expect(ratio, `${theme}: ${label}`).toBeGreaterThanOrEqual(MIN_INDICATOR)
      }
    }
  })

  it('keeps the outline of a selected part visible on the paper it is drawn over', () => {
    // The dark theme's accent measured 1.96:1 on the checkerboard, which is why this is the paper's
    // accent rather than the theme's.
    for (const [label, ratio] of pairs(['sheet-accent'], PALE_SHEETS, light)) {
      expect(ratio, `pale sheet: ${label}`).toBeGreaterThanOrEqual(MIN_INDICATOR)
    }
    for (const [label, ratio] of pairs(['sheet-accent'], ['paper-dark'], darkSheet)) {
      expect(ratio, `dark sheet: ${label}`).toBeGreaterThanOrEqual(MIN_INDICATOR)
    }
  })
})

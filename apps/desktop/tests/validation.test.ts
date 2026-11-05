import { describe, expect, it } from 'vitest'
import { isExternalUrl, safeSvgName } from '../src/main/validation'

/**
 * The checks applied to values crossing IPC.
 *
 * A renderer is still the app's own code, but the boundary is written as if it were hostile: that is
 * what makes it a boundary rather than a formality.
 */

describe('safeSvgName', () => {
  it('keeps a normal brand name and appends the extension', () => {
    expect(safeSvgName('Acme Logo')).toBe('Acme Logo.svg')
  })

  it('does not add a second extension', () => {
    expect(safeSvgName('acme.SVG')).toBe('acme.svg')
  })

  it('strips directories so the dialog cannot be pointed elsewhere', () => {
    expect(safeSvgName('../secrets/acme')).toBe('acme.svg')
    expect(safeSvgName('C:\\Users\\me\\acme.svg')).toBe('acme.svg')
  })

  it('replaces characters Windows forbids', () => {
    expect(safeSvgName('a<b>c:d')).toBe('a-b-c-d.svg')
  })

  it('rejects names that are only dots or spaces', () => {
    expect(safeSvgName('...')).toBeNull()
    expect(safeSvgName('   ')).toBeNull()
    expect(safeSvgName('')).toBeNull()
  })

  it('avoids Windows device names', () => {
    expect(safeSvgName('CON')).toBe('CON-logo.svg')
    expect(safeSvgName('lpt1.svg')).toBe('lpt1-logo.svg')
  })

  it('rejects values that are not strings', () => {
    expect(safeSvgName(42)).toBeNull()
    expect(safeSvgName(null)).toBeNull()
  })
})

describe('isExternalUrl', () => {
  it('accepts http and https', () => {
    expect(isExternalUrl('https://github.com/xianshi3/sigilgen')).toBe(true)
    expect(isExternalUrl('http://example.com')).toBe(true)
  })

  it('rejects other protocols', () => {
    expect(isExternalUrl('file:///C:/Windows/System32/calc.exe')).toBe(false)
    expect(isExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isExternalUrl('mailto:someone@example.com')).toBe(false)
  })

  it('rejects text that is not a URL', () => {
    expect(isExternalUrl('github.com')).toBe(false)
    expect(isExternalUrl(12)).toBe(false)
  })
})

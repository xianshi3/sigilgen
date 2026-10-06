import { describe, expect, it } from 'vitest'
import * as sigilgen from '../src/index'
import { generateLogo } from '../src/generate'

describe('public API', () => {
  it('exports the documented entry points', () => {
    for (const name of [
      'generateLogo',
      'generateLogos',
      'normaliseConfig',
      'SeedResolver',
      'seeded',
      'MoodResolver',
      'moodResolver',
      'extractWords',
      'scoreMood',
      'route',
      'engineWeights',
      'explainRoute',
      'ENGINES',
      'serialiseDocument',
      'group',
      'rasterise',
      'hasRasterSupport',
      'RasterSupportError',
      'BRAIN',
      'PALETTES',
      'FONTS',
      'ICONS',
      'MOODS',
      'COLOR_NAMES',
      'findPalette',
      'findFont',
      'findIcon',
      'fallbackMood',
      'sha256',
      'toHex',
      'fmt',
      'round',
      'clamp',
      'parsePath',
      'transformPath',
      'isSafePathData',
      'arcPath',
      'measureText',
      'textPath',
      'fitText',
      'naturalWidth',
      'capHeightForWidth',
      'ENGINE_NAMES',
    ]) {
      expect(sigilgen, `missing export: ${name}`).toHaveProperty(name)
    }
  })

  it('has no default export, which would confuse named-only consumers', () => {
    expect(sigilgen).not.toHaveProperty('default')
  })

  it('works end to end through the public entry point only', () => {
    const logo = sigilgen.generateLogo({ name: 'Acme', keywords: 'tech, minimal' })
    expect(logo.svg).toContain('<svg')
    expect(logo.engine).toBeTruthy()
  })

  it('produces the same output whether reached via the namespace or a direct import', () => {
    const config = { name: 'Vela', keywords: 'marine', seed: 4, size: 256 }
    expect(sigilgen.generateLogo(config).svg).toBe(generateLogo(config).svg)
  })

  it('exposes the five engine implementations', () => {
    for (const engine of sigilgen.ENGINE_NAMES) {
      expect(typeof sigilgen.ENGINES[engine], engine).toBe('function')
    }
  })

  it('exposes a mutable-free view of the brain', () => {
    expect(Object.isFrozen(sigilgen.COLOR_NAMES)).toBe(true)
  })
})

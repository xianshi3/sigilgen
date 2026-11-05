import { describe, expect, it } from 'vitest'
import { menuLabels, PROJECT_URL } from '../src/main/menu-labels'

/**
 * The menu is the one piece of chrome that follows the operating system's language rather than the
 * studio's own language switch. These cases pin the tag matching, including the regional variants.
 */

describe('menuLabels', () => {
  it('uses Chinese for Chinese locales, including regional tags', () => {
    expect(menuLabels('zh-CN').file).toBe('文件')
    expect(menuLabels('zh-TW').saveSvg).toBe('保存 SVG…')
  })

  it('uses English for everything else', () => {
    expect(menuLabels('en-US').file).toBe('File')
    expect(menuLabels('fr-FR').file).toBe('File')
    expect(menuLabels('').file).toBe('File')
  })

  it('points Learn More at the repository', () => {
    expect(PROJECT_URL).toBe('https://github.com/xianshi3/sigilgen')
  })
})

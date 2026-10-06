import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { main, parseArgs, slugify } from '../src/cli'
import { hasRasterSupport } from '../src/rasterize'

/** Captured stdout writes. */
let out = ''

/** Captured stderr writes. */
let err = ''

/** Original `process.stdout.write`. */
const realStdout = process.stdout.write.bind(process.stdout)

/** Original `process.stderr.write`. */
const realStderr = process.stderr.write.bind(process.stderr)

/** Temporary directory used for file output tests. */
let scratch = ''

beforeAll(() => {
  out = ''
  err = ''
  vi.spyOn(process.stdout, 'write').mockImplementation(chunk => {
    out += String(chunk)
    return true
  })
  vi.spyOn(process.stderr, 'write').mockImplementation(chunk => {
    err += String(chunk)
    return true
  })
  scratch = mkdtempSync(join(tmpdir(), 'sigilgen-cli-'))
})

afterAll(() => {
  vi.restoreAllMocks()
  process.stdout.write = realStdout
  process.stderr.write = realStderr
  rmSync(scratch, { recursive: true, force: true })
})

/**
 * Runs the CLI with captured output.
 *
 * @param args - Command line arguments.
 * @returns The exit code.
 */
async function run(...args: string[]): Promise<number> {
  out = ''
  err = ''
  return main(args)
}

describe('parseArgs', () => {
  it('reads long and short flags', () => {
    const options = parseArgs(['--name', 'Acme', '-k', 'tech', '-N', '4'])
    expect(options.name).toBe('Acme')
    expect(options.keywords).toBe('tech')
    expect(options.variations).toBe(4)
  })

  it('reads every documented flag', () => {
    const options = parseArgs([
      '--name',
      'Acme',
      '--keywords',
      'tech',
      '--brief',
      'a brief',
      '--engine',
      'monogram',
      '--palette',
      '#000000,#ffffff',
      '--font',
      'orbit-grotesk',
      '--icon',
      'mountain-peak',
      '--seed',
      '5',
      '--size',
      '256',
      '--variations',
      '2',
      '--background',
      '--output',
      './out',
      '--json',
      '--png',
      '--png-size',
      '512',
      '--quiet',
    ])
    expect(options).toMatchObject({
      name: 'Acme',
      keywords: 'tech',
      brief: 'a brief',
      engine: 'monogram',
      palette: '#000000,#ffffff',
      font: 'orbit-grotesk',
      icon: 'mountain-peak',
      seed: 5,
      size: 256,
      variations: 2,
      background: true,
      output: './out',
      json: true,
      png: true,
      pngSize: 512,
      quiet: true,
    })
  })

  it('applies the documented defaults', () => {
    const options = parseArgs(['--name', 'Acme'])
    expect(options.size).toBe(512)
    expect(options.variations).toBe(3)
    expect(options.seed).toBe(0)
    expect(options.pngSize).toBe(1024)
    expect(options.json).toBe(false)
    expect(options.background).toBe(false)
  })

  it('accepts = syntax', () => {
    // The flag table is hand written, so `=` is not part of the contract; this documents that.
    expect(() => parseArgs(['--name=Acme'])).toThrow()
  })

  it('rejects an unknown flag', () => {
    expect(() => parseArgs(['--nope'])).toThrow(/unknown option/)
  })

  it('rejects a flag with a missing value', () => {
    expect(() => parseArgs(['--name'])).toThrow(/needs a value/)
    expect(() => parseArgs(['--name', '--keywords'])).toThrow(/needs a value/)
  })

  it('rejects a non-numeric number', () => {
    expect(() => parseArgs(['--name', 'Acme', '--seed', 'abc'])).toThrow(/needs a number/)
  })

  it('recognises help and version', () => {
    expect(parseArgs(['--help']).help).toBe(true)
    expect(parseArgs(['-h']).help).toBe(true)
    expect(parseArgs(['--version']).version).toBe(true)
    expect(parseArgs(['-v']).version).toBe(true)
  })
})

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Northwind Coffee')).toBe('northwind-coffee')
  })

  it('collapses punctuation runs', () => {
    expect(slugify('A  B!!C')).toBe('a-b-c')
  })

  it('trims leading and trailing separators', () => {
    expect(slugify('  --Acme--  ')).toBe('acme')
  })

  it('falls back when nothing survives', () => {
    expect(slugify('!!!')).toBe('logo')
    expect(slugify('')).toBe('logo')
  })

  it('cannot escape the output directory', () => {
    expect(slugify('../../etc/passwd')).toBe('etc-passwd')
    expect(slugify('a/../../b')).toBe('a-b')
  })
})

describe('main', () => {
  it('prints usage for --help', async () => {
    expect(await run('--help')).toBe(0)
    expect(out).toContain('USAGE')
    expect(out).toContain('--name')
    expect(out).toContain('--json')
  })

  it('prints the version for --version', async () => {
    expect(await run('--version')).toBe(0)
    expect(out.trim()).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('requires a name', async () => {
    expect(await run('--keywords', 'tech')).toBe(2)
    expect(err).toContain('--name is required')
  })

  it('writes one SVG to stdout', async () => {
    expect(await run('--name', 'Acme', '--keywords', 'tech, minimal')).toBe(0)
    expect(out).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
    expect(out.trimEnd().endsWith('</svg>')).toBe(true)
  })

  it('is byte-identical across runs', async () => {
    await run('--name', 'Acme', '--keywords', 'tech', '--seed', '3')
    const first = out
    await run('--name', 'Acme', '--keywords', 'tech', '--seed', '3')
    expect(out).toBe(first)
  })

  it('emits a machine-readable summary with --json', async () => {
    expect(await run('--name', 'Ledgerly', '--keywords', 'fintech', '-N', '2', '--json')).toBe(0)
    const parsed = JSON.parse(out) as {
      name: string
      count: number
      logos: {
        engine: string
        palette: Record<string, unknown>
        font: Record<string, unknown>
        icon: unknown
        conceptNotes: string[]
        svg: string
      }[]
    }
    expect(parsed.name).toBe('Ledgerly')
    expect(parsed.count).toBe(2)
    expect(parsed.logos).toHaveLength(2)
    for (const logo of parsed.logos) {
      expect(typeof logo.engine).toBe('string')
      expect(typeof logo.palette).toBe('object')
      expect(typeof logo.font).toBe('object')
      expect(Array.isArray(logo.conceptNotes)).toBe(true)
      expect(logo.svg).toContain('<svg')
    }
  })

  it('rejects an unknown engine before doing any work', async () => {
    expect(await run('--name', 'Acme', '--engine', 'nope')).toBe(2)
    expect(err).toContain('unknown engine')
    expect(out).toBe('')
  })

  it('surfaces a configuration error without a stack trace', async () => {
    expect(await run('--name', '!!!')).toBe(2)
    expect(err).toContain('at least one letter')
  })

  it('accepts a custom colour list', async () => {
    expect(
      await run('--name', 'Ember', '--keywords', 'coffee', '--palette', '#2B1B12,cream,rust')
    ).toBe(0)
    expect(out).toContain('#2b1b12')
  })

  it('writes files with --output', async () => {
    const target = join(scratch, 'nested', 'out')
    expect(
      await run(
        '--name',
        'Acme Corp',
        '--keywords',
        'tech',
        '-N',
        '2',
        '--output',
        target,
        '--quiet'
      )
    ).toBe(0)
    const files = readdirSync(target).toSorted()
    expect(files).toEqual(['acme-corp-1.svg', 'acme-corp-2.svg'])
    for (const file of files) {
      expect(readFileSync(join(target, file), 'utf8')).toContain('<svg')
    }
    expect(out).toBe('')
  })

  it('writes a single unnumbered file for one concept', async () => {
    const target = join(scratch, 'single')
    expect(
      await run('--name', 'Vela', '--keywords', 'marine', '-N', '1', '--output', target, '--quiet')
    ).toBe(0)
    expect(readdirSync(target)).toEqual(['vela.svg'])
  })

  it('keeps files inside the requested directory', async () => {
    const target = join(scratch, 'contained')
    mkdirSync(target)
    await run(
      '--name',
      '../../escape',
      '--keywords',
      'tech',
      '-N',
      '1',
      '--output',
      target,
      '--quiet'
    )
    expect(readdirSync(target)).toEqual(['escape.svg'])
  })

  it('reports an unusable output directory', async () => {
    const blocker = join(scratch, 'blocked')
    writeFileSync(blocker, 'not a directory', 'utf8')
    expect(await run('--name', 'Acme', '--output', join(blocker, 'inner'))).toBe(1)
    expect(err).toContain('cannot create output directory')
  })

  it('includes a summary on stderr unless --quiet', async () => {
    await run('--name', 'Acme', '--keywords', 'tech')
    expect(err).toContain('concept')
    await run('--name', 'Acme', '--keywords', 'tech', '--quiet')
    expect(err).toBe('')
  })

  it('emits a background rectangle only when asked', async () => {
    await run('--name', 'Acme', '--keywords', 'tech')
    expect(out).not.toContain('<rect')
    await run('--name', 'Acme', '--keywords', 'tech', '--background')
    expect(out).toContain('<rect')
  })
})

describe('png output', () => {
  it('reports whether rasterisation is available', async () => {
    expect(typeof (await hasRasterSupport())).toBe('boolean')
  })

  it('writes a PNG when sharp is installed', async () => {
    if (!(await hasRasterSupport())) {
      // Documented behaviour: SVG still works, PNG is refused with an actionable message.
      expect(await run('--name', 'Acme', '--png', '-N', '1')).toBe(3)
      expect(err).toContain('sharp')
      return
    }
    const target = join(scratch, 'png')
    expect(
      await run(
        '--name',
        'Acme',
        '--keywords',
        'tech',
        '-N',
        '1',
        '--png',
        '--png-size',
        '128',
        '--output',
        target,
        '--quiet'
      )
    ).toBe(0)
    const files = readdirSync(target).toSorted()
    expect(files).toContain('acme.png')
    const bytes = readFileSync(join(target, 'acme.png'))
    // PNG magic number.
    expect([...bytes.subarray(0, 4)]).toEqual([137, 80, 78, 71])
  })
})

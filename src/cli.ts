#!/usr/bin/env node
/**
 * The `sigilgen` command line interface.
 *
 * Zero dependencies, including argument parsing: the flag table below is the whole parser. Output goes
 * to stdout by default so the tool composes with pipes; `--output` writes files instead.
 *
 * ```bash
 * sigilgen --name "Acme" --keywords "tech, minimal"
 * sigilgen --name "Ledgerly" --keywords fintech -n 4 --output ./out/
 * sigilgen --name "Ember" --keywords coffee --palette "#2B1B12,cream,rust"
 * sigilgen --name "Relay" --keywords "mesh networking" --json
 * sigilgen --name "Acme" --keywords owl --png --png-size 1024
 * ```
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import process from 'node:process'
import { generateLogos, normaliseConfig } from './generate'
import { hasRasterSupport, rasterise } from './rasterize'
import { ENGINE_NAMES, type GenerateOptions, type LogoResult } from './types'

/** Package version, read from the manifest at build time by tsup's `define`. */
const VERSION = '1.0.0'

/** Extension used for SVG output. */
const SVG_EXTENSION = '.svg'

/** Extension used for PNG output. */
const PNG_EXTENSION = '.png'

/** Parsed command line. */
interface Options {
  name: string | null
  keywords: string
  brief: string
  engine: string | null
  palette: string | null
  font: string | null
  icon: string | null
  seed: number
  size: number
  variations: number
  background: boolean
  output: string | null
  json: boolean
  png: boolean
  pngSize: number
  quiet: boolean
  help: boolean
  version: boolean
}

/** Thrown for user-facing argument errors, which are printed without a stack trace. */
class UsageError extends Error {
  /**
   * @param message - What the user should change.
   */
  constructor(message: string) {
    super(message)
    this.name = 'UsageError'
  }
}

/**
 * Usage text.
 *
 * @returns The help screen.
 */
function help(): string {
  return `sigilgen ${VERSION} — deterministic flat geometric SVG logos

USAGE
  sigilgen --name <brand> [options]

REQUIRED
  -n, --name <brand>        Brand name. Letters A-Z are used; other characters are ignored.

INPUT
  -k, --keywords <list>     Comma or space separated keywords, e.g. "tech, minimal".
  -b, --brief <text>        Free-text brief; keywords are extracted from it too.
  -e, --engine <id>         Force an engine: ${ENGINE_NAMES.join(' | ')}.
  -c, --palette <spec>      Palette id, or a colour list, e.g. "#2B1B12,cream,rust".
      --font <id>           Force a typeface id.
      --icon <key>          Force a pictogram key.
  -s, --seed <number>       Numeric seed mixed into the hash. Default 0.
      --size <number>       Square canvas size. Default 512.

OUTPUT
  -o, --output <path>       Write files here instead of stdout. Directories are created.
  -N, --variations <1-6>    Number of concepts. Default 3.
      --background          Emit an opaque background rectangle.
      --json                Print a machine-readable summary instead of SVG.
      --png                 Also write a PNG next to each SVG. Requires sharp.
      --png-size <number>   PNG edge length in pixels. Default 1024.
  -q, --quiet               Suppress the summary line on stderr.
  -h, --help                Show this help.
  -v, --version             Show the version.

EXAMPLES
  sigilgen --name "Acme" --keywords "tech, minimal"
  sigilgen --name "Ledgerly" --keywords fintech -N 4 --output ./out/
  sigilgen --name "Ember" --keywords coffee --palette "#2B1B12,cream,rust"
  sigilgen --name "Relay" --keywords "mesh networking" --json
  sigilgen --name "Acme" --keywords owl --png --png-size 1024

The same input always produces byte-identical output. SVG output needs no dependencies at all.
`
}

/**
 * Reads the value that follows a flag.
 *
 * @param argv - Argument list.
 * @param index - Index of the flag.
 * @param flag - The flag, for error messages.
 * @returns The value and the next index.
 * @throws {UsageError} When the flag has no value.
 */
function takeValue(argv: readonly string[], index: number, flag: string): [string, number] {
  const value = argv[index + 1]
  if (value === undefined || value.startsWith('-')) {
    throw new UsageError(`${flag} needs a value`)
  }
  return [value, index + 1]
}

/**
 * Parses a numeric flag.
 *
 * @param raw - The raw value.
 * @param flag - The flag, for error messages.
 * @returns The parsed number.
 * @throws {UsageError} When the value is not a finite number.
 */
function takeNumber(raw: string, flag: string): number {
  const value = Number(raw)
  if (!Number.isFinite(value)) {
    throw new UsageError(`${flag} needs a number, received "${raw}"`)
  }
  return value
}

/**
 * Parses `argv`.
 *
 * @param argv - Arguments after the node binary and script path.
 * @returns The parsed options.
 * @throws {UsageError} On an unknown flag or a missing value.
 */
export function parseArgs(argv: readonly string[]): Options {
  const options: Options = {
    name: null,
    keywords: '',
    brief: '',
    engine: null,
    palette: null,
    font: null,
    icon: null,
    seed: 0,
    size: 512,
    variations: 3,
    background: false,
    output: null,
    json: false,
    png: false,
    pngSize: 1024,
    quiet: false,
    help: false,
    version: false,
  }

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index] as string
    switch (arg) {
      case '-n':
      case '--name': {
        const [value, next] = takeValue(argv, index, arg)
        options.name = value
        index = next
        break
      }
      case '-k':
      case '--keywords': {
        const [value, next] = takeValue(argv, index, arg)
        options.keywords = value
        index = next
        break
      }
      case '-b':
      case '--brief': {
        const [value, next] = takeValue(argv, index, arg)
        options.brief = value
        index = next
        break
      }
      case '-e':
      case '--engine': {
        const [value, next] = takeValue(argv, index, arg)
        options.engine = value
        index = next
        break
      }
      case '-c':
      case '--palette': {
        const [value, next] = takeValue(argv, index, arg)
        options.palette = value
        index = next
        break
      }
      case '--font': {
        const [value, next] = takeValue(argv, index, arg)
        options.font = value
        index = next
        break
      }
      case '--icon': {
        const [value, next] = takeValue(argv, index, arg)
        options.icon = value
        index = next
        break
      }
      case '-s':
      case '--seed': {
        const [value, next] = takeValue(argv, index, arg)
        options.seed = takeNumber(value, arg)
        index = next
        break
      }
      case '--size': {
        const [value, next] = takeValue(argv, index, arg)
        options.size = takeNumber(value, arg)
        index = next
        break
      }
      case '-N':
      case '--variations': {
        const [value, next] = takeValue(argv, index, arg)
        options.variations = takeNumber(value, arg)
        index = next
        break
      }
      case '-o':
      case '--output': {
        const [value, next] = takeValue(argv, index, arg)
        options.output = value
        index = next
        break
      }
      case '--png-size': {
        const [value, next] = takeValue(argv, index, arg)
        options.pngSize = takeNumber(value, arg)
        index = next
        break
      }
      case '--background': {
        options.background = true
        break
      }
      case '--json': {
        options.json = true
        break
      }
      case '--png': {
        options.png = true
        break
      }
      case '-q':
      case '--quiet': {
        options.quiet = true
        break
      }
      case '-h':
      case '--help': {
        options.help = true
        break
      }
      case '-v':
      case '--version': {
        options.version = true
        break
      }
      default: {
        throw new UsageError(`unknown option "${arg}" (try --help)`)
      }
    }
  }

  return options
}

/**
 * Turns a brand name into a safe, lowercase file stem.
 *
 * @param name - The brand name.
 * @returns A stem containing only `[a-z0-9-]`.
 */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug === '' ? 'logo' : slug
}

/**
 * Builds the machine-readable summary.
 *
 * @param results - The generated concepts.
 * @param config - The normalised configuration, echoed back so a summary is self-describing.
 * @returns A JSON-ready object.
 */
function summarise(
  results: readonly LogoResult[],
  config: { name: string; engine: string | null; size: number; seed: number }
): Record<string, unknown> {
  return {
    name: config.name,
    seed: config.seed,
    size: config.size,
    count: results.length,
    logos: results.map(result => ({
      engine: result.engine,
      seed: result.seed,
      palette: {
        id: result.palette.id,
        primary: result.palette.primary,
        secondary: result.palette.secondary,
        accent: result.palette.accent,
        highlight: result.palette.highlight ?? null,
        background: result.palette.background,
      },
      font: { id: result.font.id, family: result.font.family, weight: result.font.weight },
      icon: result.icon === null ? null : { key: result.icon.key, category: result.icon.category },
      conceptNotes: result.conceptNotes,
      svg: result.svg,
    })),
  }
}

/**
 * Writes results to disk.
 *
 * The output directory is resolved before anything is written and only the extensions the CLI
 * advertises are ever appended to the generated file name.
 *
 * @param results - The generated concepts.
 * @param output - The `--output` path.
 * @param stem - The slugified brand name.
 * @param wantPng - Whether to also write PNG files.
 * @param pngSize - PNG edge length.
 * @returns The paths written, SVG first.
 * @throws {UsageError} When a path cannot be written.
 */
async function writeFiles(
  results: readonly LogoResult[],
  output: string,
  stem: string,
  wantPng: boolean,
  pngSize: number
): Promise<string[]> {
  const target = resolve(output)
  try {
    mkdirSync(target, { recursive: true })
  } catch (error) {
    throw new UsageError(`cannot create output directory "${target}": ${describe(error)}`)
  }

  const written: string[] = []
  for (const [index, result] of results.entries()) {
    const suffix = results.length === 1 ? '' : `-${index + 1}`
    const svgPath = join(target, `${stem}${suffix}${SVG_EXTENSION}`)
    try {
      writeFileSync(svgPath, result.svg, 'utf8')
    } catch (error) {
      throw new UsageError(`cannot write "${svgPath}": ${describe(error)}`)
    }
    written.push(svgPath)

    if (wantPng) {
      const pngPath = join(target, `${stem}${suffix}${PNG_EXTENSION}`)
      const raster = await rasterise(result, { size: pngSize })
      try {
        writeFileSync(pngPath, raster.data)
      } catch (error) {
        throw new UsageError(`cannot write "${pngPath}": ${describe(error)}`)
      }
      written.push(pngPath)
    }
  }
  return written
}

/**
 * Describes an unknown thrown value in one line.
 *
 * @param error - The thrown value.
 * @returns A readable message.
 */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Entry point.
 *
 * @param argv - Arguments after the node binary and script path.
 * @returns The process exit code.
 */
export async function main(argv: readonly string[]): Promise<number> {
  let options: Options
  try {
    options = parseArgs(argv)
  } catch (error) {
    process.stderr.write(`sigilgen: ${describe(error)}\n`)
    return 2
  }

  if (options.help) {
    process.stdout.write(help())
    return 0
  }
  if (options.version) {
    process.stdout.write(`${VERSION}\n`)
    return 0
  }
  if (options.name === null) {
    process.stderr.write('sigilgen: --name is required (try --help)\n')
    return 2
  }

  if (options.png && !(await hasRasterSupport())) {
    process.stderr.write(
      'sigilgen: --png needs the optional dependency "sharp". Install it, or drop --png to write SVG only.\n'
    )
    return 3
  }

  const config: GenerateOptions = {
    name: options.name,
    keywords: options.keywords,
    brief: options.brief,
    size: options.size,
    seed: options.seed,
    variations: options.variations,
    background: options.background,
  }

  if (options.engine !== null) {
    if (!ENGINE_NAMES.includes(options.engine as (typeof ENGINE_NAMES)[number])) {
      process.stderr.write(
        `sigilgen: unknown engine "${options.engine}"; expected one of ${ENGINE_NAMES.join(', ')}\n`
      )
      return 2
    }
    config.engine = options.engine as (typeof ENGINE_NAMES)[number]
  }
  if (options.palette !== null) {
    config.palette = options.palette
  }
  if (options.font !== null) {
    config.font = options.font
  }
  if (options.icon !== null) {
    config.icon = options.icon
  }

  let results: LogoResult[]
  try {
    // Validate up front so a bad flag fails before any file is created.
    normaliseConfig(config)
    results = generateLogos(config)
  } catch (error) {
    process.stderr.write(`sigilgen: ${describe(error)}\n`)
    return 2
  }

  const stem = slugify(options.name)

  if (options.output !== null) {
    try {
      const written = await writeFiles(results, options.output, stem, options.png, options.pngSize)
      if (!options.quiet) {
        process.stderr.write(
          `sigilgen: wrote ${written.length} file(s) to ${resolve(options.output)}\n`
        )
      }
    } catch (error) {
      process.stderr.write(`sigilgen: ${describe(error)}\n`)
      return 1
    }
    return 0
  }

  if (options.json) {
    const summary = summarise(results, {
      name: options.name,
      engine: options.engine,
      size: options.size,
      seed: options.seed,
    })
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
    return 0
  }

  if (results.length === 1) {
    process.stdout.write(results[0]?.svg ?? '')
  } else {
    // Several concepts on one stream: separate them with an XML comment so the output stays valid-ish
    // for eyeballing, and point at --output for files that a parser can read.
    for (const [index, result] of results.entries()) {
      process.stdout.write(
        `<!-- concept ${index + 1} of ${results.length}: ${result.engine} / ${result.palette.id} -->\n`
      )
      process.stdout.write(result.svg)
    }
  }
  if (!options.quiet) {
    process.stderr.write(
      `sigilgen: ${results.length} concept(s) for "${options.name}"; use --json or --output for a summary.\n`
    )
  }
  return 0
}

/* c8 ignore start -- process wiring, exercised end to end rather than in unit tests */
if (process.argv[1] !== undefined && basename(process.argv[1]).includes('cli')) {
  main(process.argv.slice(2))
    .then(code => {
      process.exitCode = code
    })
    .catch((error: unknown) => {
      process.stderr.write(`sigilgen: ${describe(error)}\n`)
      process.exitCode = 1
    })
}
/* c8 ignore stop */

export { VERSION, help }

/**
 * Compiles the brain's font data from real, OFL-licensed fonts.
 *
 * Sigilgen never parses a font file at runtime: the outlines are extracted here, at build time, into
 * `src/brain/fonts.json`. That is what keeps the runtime dependency free and the output deterministic —
 * the JSON is committed, and `--check` fails the build if it drifts from this script.
 *
 * The families below are real typefaces rather than parameter variants of one skeleton. Each entry is one
 * family at one weight; `variation` instances a variable font, which is how four weights of Inter come out
 * of a single 856 KB file.
 *
 * Every file under `assets/fonts/` is OFL-licensed, and each family's `OFL.txt` sits beside it. The
 * licences are not optional: they are what makes shipping the derived outlines lawful.
 *
 * Usage: `pnpm run build:brain` (writes), `pnpm run check:brain` (verifies).
 */

import { writeFileSync, readFileSync } from 'node:fs'
import { extractFamily } from './glyph-source.mjs'

const OUTPUT = 'src/brain/fonts.json'

/** One family at one weight. */
const FAMILIES = [
  {
    id: 'inter-light',
    family: 'Inter',
    category: 'geometric-sans',
    weight: 300,
    file: 'inter/Inter-variable.ttf',
    variation: { wght: 300 },
    tags: ['geometric', 'clean', 'modern', 'sans', 'neutral', 'interface'],
  },
  {
    id: 'inter-regular',
    family: 'Inter',
    category: 'geometric-sans',
    weight: 400,
    file: 'inter/Inter-variable.ttf',
    variation: { wght: 400 },
    tags: ['geometric', 'clean', 'modern', 'sans', 'neutral', 'software'],
  },
  {
    id: 'inter-semibold',
    family: 'Inter',
    category: 'geometric-sans',
    weight: 600,
    file: 'inter/Inter-variable.ttf',
    variation: { wght: 600 },
    tags: ['geometric', 'modern', 'sans', 'confident', 'saas', 'tech'],
  },
  {
    id: 'inter-bold',
    family: 'Inter',
    category: 'geometric-sans',
    weight: 700,
    file: 'inter/Inter-variable.ttf',
    variation: { wght: 700 },
    tags: ['geometric', 'bold', 'sans', 'strong', 'sport', 'tech'],
  },
  {
    id: 'space-grotesk-medium',
    family: 'Space Grotesk',
    category: 'display',
    weight: 500,
    file: 'space-grotesk/SpaceGrotesk-variable.ttf',
    variation: { wght: 500 },
    tags: ['display', 'geometric', 'quirky', 'tech', 'editorial', 'studio'],
  },
  {
    id: 'space-grotesk-bold',
    family: 'Space Grotesk',
    category: 'display',
    weight: 700,
    file: 'space-grotesk/SpaceGrotesk-variable.ttf',
    variation: { wght: 700 },
    tags: ['display', 'bold', 'tech', 'poster', 'gaming', 'energy'],
  },
  {
    id: 'archivo-regular',
    family: 'Archivo',
    category: 'humanist-sans',
    weight: 400,
    file: 'archivo/Archivo-variable.ttf',
    variation: { wght: 400 },
    tags: ['grotesque', 'neutral', 'editorial', 'sans', 'institutional', 'stable'],
  },
  {
    id: 'archivo-bold',
    family: 'Archivo',
    category: 'humanist-sans',
    weight: 700,
    file: 'archivo/Archivo-variable.ttf',
    variation: { wght: 700 },
    tags: ['grotesque', 'bold', 'editorial', 'sans', 'loud', 'retail'],
  },
  {
    id: 'work-sans-light',
    family: 'Work Sans',
    category: 'humanist-sans',
    weight: 300,
    file: 'work-sans/WorkSans-variable.ttf',
    variation: { wght: 300 },
    tags: ['humanist', 'light', 'calm', 'sans', 'editorial', 'quiet'],
  },
  {
    id: 'work-sans-medium',
    family: 'Work Sans',
    category: 'humanist-sans',
    weight: 500,
    file: 'work-sans/WorkSans-variable.ttf',
    variation: { wght: 500 },
    tags: ['humanist', 'warm', 'sans', 'friendly', 'retail', 'care'],
  },
  {
    id: 'plex-serif-regular',
    family: 'IBM Plex Serif',
    category: 'serif',
    weight: 400,
    file: 'ibm-plex-serif/IBMPlexSerif-Regular.ttf',
    tags: ['serif', 'editorial', 'book', 'literary', 'warm', 'print'],
  },
  {
    id: 'plex-serif-semibold',
    family: 'IBM Plex Serif',
    category: 'serif',
    weight: 600,
    file: 'ibm-plex-serif/IBMPlexSerif-SemiBold.ttf',
    tags: ['serif', 'bold', 'editorial', 'heritage', 'confident', 'print'],
  },
  {
    id: 'plex-mono-regular',
    family: 'IBM Plex Mono',
    category: 'display',
    weight: 400,
    file: 'ibm-plex-mono/IBMPlexMono-Regular.ttf',
    tags: ['mono', 'technical', 'code', 'terminal', 'engineer', 'blueprint'],
  },
]

const fonts = FAMILIES.map(extractFamily)
const json = `${JSON.stringify({ fonts }, null, 2)}\n`

if (process.argv.includes('--check')) {
  let current = ''
  try {
    current = readFileSync(OUTPUT, 'utf8')
  } catch {
    console.error(`error: ${OUTPUT} does not exist; run \`pnpm run build:brain\``)
    process.exit(1)
  }
  if (current !== json) {
    console.error('error: src/brain/fonts.json is out of date with scripts/build-brain.mjs')
    console.error('       run `pnpm run build:brain` and commit the result')
    process.exit(1)
  }
  console.log(`fonts.json is in sync (${fonts.length} families, 26 glyphs each)`)
} else {
  writeFileSync(OUTPUT, json, 'utf8')
  console.log(`wrote ${OUTPUT}`)
  console.log(`  ${fonts.length} families, ${fonts.length * 26} glyphs, ${json.length} bytes`)
}

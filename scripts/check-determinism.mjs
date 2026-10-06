#!/usr/bin/env node
/**
 * Cross-process determinism check.
 *
 * The test suite proves determinism within a process. This proves it *across* processes, which is the
 * property that actually matters for a build tool: two machines, two Node versions and two working
 * directories must produce the same bytes for the same input.
 *
 * Generates a spread of concepts in a subprocess, hashes the output, and compares against a recorded
 * manifest. With `--update` it rewrites the manifest instead, which is how a deliberate design change
 * is approved.
 *
 * Usage:
 *   node scripts/check-determinism.mjs            # verify against scripts/determinism.manifest.json
 *   node scripts/check-determinism.mjs --update   # rewrite the manifest
 */

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = resolve(ROOT, 'scripts/determinism.manifest.json')
const BUNDLE = resolve(ROOT, 'dist/index.js')

/**
 * Newest modification time under a directory tree.
 *
 * @param {string} dir - Directory to walk.
 * @returns {number} The newest mtime in milliseconds, or `0` when the tree is empty.
 */
function newestMtime(dir) {
  let newest = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestMtime(full))
    } else {
      newest = Math.max(newest, statSync(full).mtimeMs)
    }
  }
  return newest
}

// This check imports the built bundle, so running it against a stale `dist` re-hashes the *old* output
// and reports a clean pass no matter what the source now says. That is a false green, and it is easy to
// hit by running this script on its own instead of through `pnpm run check`, which builds first.
if (!process.argv.includes('--update')) {
  let builtAt = 0
  try {
    builtAt = statSync(BUNDLE).mtimeMs
  } catch {
    console.error(`error: ${BUNDLE} does not exist.`)
    console.error('       run `pnpm build` before checking determinism.')
    process.exit(1)
  }
  // Only `src` matters here: editing this script or the manifest must not demand a rebuild.
  const sourceAt = newestMtime(resolve(ROOT, 'src'))
  if (sourceAt > builtAt) {
    console.error('error: the build is older than the source, so this would hash stale output.')
    console.error(
      '       run `pnpm build` first, or use `pnpm run check`, which builds before checking.'
    )
    process.exit(1)
  }
}

// A file URL rather than a bare path: on Windows the ESM loader rejects `D:\...` outright.
const { generateLogos } = await import(pathToFileURL(BUNDLE).href)

/** Inputs chosen to exercise every engine, both palette forms, and the odd name-length boundaries. */
const CASES = [
  { name: 'Acme', keywords: 'tech, minimal', seed: 0, size: 512 },
  { name: 'QB', keywords: 'developer tools, cli', seed: 1, size: 256 },
  { name: 'Northwind Coffee Roasters', keywords: 'coffee, artisan', seed: 2, size: 512 },
  { name: 'Internationale', keywords: 'luxury, boutique', seed: 3, size: 300 },
  { name: 'Vela', keywords: 'marine, travel', variations: 6, seed: 4, size: 512 },
  { name: 'Ironbark', keywords: 'construction, manufacturing', variations: 6, seed: 5, size: 512 },
  { name: 'Ember', keywords: 'coffee', palette: '#2B1B12,cream,rust', seed: 6, size: 512 },
  {
    name: 'Loop',
    keywords: 'generative geometric abstract',
    engine: 'abstract',
    seed: 7,
    size: 512,
  },
  {
    name: 'Shield',
    keywords: 'badge emblem seal',
    engine: 'emblem',
    background: true,
    seed: 8,
    size: 512,
  },
  { name: 'A', keywords: 'generative', engine: 'lettermark', variations: 6, seed: 9, size: 128 },
]

/**
 * Builds the manifest: a hash per case, plus a combined digest.
 *
 * @returns {cases: Record<string, string>, combined: string}
 */
function buildManifest() {
  /** @type {Record<string, string>} */
  const cases = {}
  for (const config of CASES) {
    const labels = []
    const digest = createHash('sha256')
    for (const logo of generateLogos({ variations: 1, ...config })) {
      const label = `${logo.engine}|${logo.palette.id}|${logo.font.id}|${logo.icon?.key ?? '-'}|${logo.seed}`
      labels.push(label)
      digest.update(label)
      digest.update('\n')
      digest.update(logo.svg)
      digest.update('\n')
      for (const note of logo.conceptNotes) {
        digest.update(note)
      }
      digest.update('\n')
    }
    cases[labels.join(', ')] = digest.digest('hex')
  }
  const combined = createHash('sha256')
  for (const [label, hash] of Object.entries(cases)) {
    combined.update(label)
    combined.update(hash)
  }
  return { cases, combined: combined.digest('hex') }
}

const actual = buildManifest()

if (process.argv.includes('--update')) {
  writeFileSync(MANIFEST, `${JSON.stringify(actual, null, 2)}\n`, 'utf8')
  console.log(`wrote ${MANIFEST} (combined ${actual.combined.slice(0, 12)})`)
  process.exit(0)
}

let expected
try {
  expected = JSON.parse(readFileSync(MANIFEST, 'utf8'))
} catch {
  console.error(`error: ${MANIFEST} is missing or unreadable.`)
  console.error(
    '       run `node scripts/check-determinism.mjs --update` to record the current output.'
  )
  process.exit(1)
}

const expectedKeys = Object.keys(expected.cases ?? {})
const actualKeys = Object.keys(actual.cases)

if (expectedKeys.length !== actualKeys.length) {
  console.error(
    `error: the manifest covers ${expectedKeys.length} case(s) but this run produced ${actualKeys.length}.`
  )
  process.exit(1)
}

let failed = false
for (const [index, label] of actualKeys.entries()) {
  const want = expected.cases[label]
  const got = actual.cases[label]
  if (want === undefined) {
    console.error(`error: unexpected case: ${label}`)
    failed = true
    continue
  }
  if (want !== got) {
    console.error(`mismatch: ${label}`)
    console.error(`  expected ${want}`)
    console.error(`  actual   ${got}`)
    failed = true
  }
  void index
}

if (actual.combined !== expected.combined) {
  console.error('mismatch: combined digest')
  console.error(`  expected ${expected.combined}`)
  console.error(`  actual   ${actual.combined}`)
  failed = true
}

if (failed) {
  console.error('')
  console.error('Output is not reproducible. If the change is intentional, run:')
  console.error('  node scripts/check-determinism.mjs --update')
  process.exit(1)
}

console.log(`deterministic: ${actualKeys.length} cases, combined ${actual.combined.slice(0, 12)}`)

#!/usr/bin/env node
/**
 * Creates the AI tool instruction files as symlinks pointing at AGENTS.md, which is the single
 * source of truth for agent instructions.
 *
 * Creating symlinks on Windows requires either Administrator rights or Developer Mode. When
 * neither is available this script falls back to writing a small pointer file instead, so agents
 * still land on AGENTS.md instead of missing instructions entirely. The fallback is reported
 * loudly and can be upgraded later by re-running the script once symlinks are possible.
 *
 * Usage:
 *   node scripts/link-ai-files.mjs          # create links, fallback to pointers on EPERM
 *   node scripts/link-ai-files.mjs --strict # fail instead of falling back
 */

import { readFileSync, rmSync, symlinkSync, writeFileSync, lstatSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = 'AGENTS.md'

/** @type {ReadonlyArray<{ path: string, target: string }>} */
const LINKS = [
  { path: 'CLAUDE.md', target: SOURCE },
  { path: '.cursorrules', target: SOURCE },
  { path: '.windsurfrules', target: SOURCE },
  { path: join('.github', 'copilot-instructions.md'), target: join('..', SOURCE) },
]

const strict = process.argv.includes('--strict')
let fellBack = 0

for (const link of LINKS) {
  const absoluteLink = join(ROOT, link.path)
  const absoluteTarget = resolve(dirname(absoluteLink), link.target)

  try {
    readFileSync(absoluteTarget)
  } catch {
    console.error(`error: target ${link.target} does not exist; run this from a Sigilgen checkout`)
    process.exit(1)
  }

  removeExisting(absoluteLink)

  try {
    symlinkSync(link.target, absoluteLink, 'file')
    console.log(`link    ${link.path} -> ${link.target}`)
  } catch (error) {
    if (strict) {
      console.error(`error: cannot create symlink ${link.path}: ${describe(error)}`)
      process.exit(1)
    }
    writeFileSync(absoluteLink, pointerBody(link), 'utf8')
    fellBack++
    console.log(`pointer ${link.path} -> ${link.target} (symlink unavailable: ${describe(error)})`)
  }
}

if (fellBack > 0) {
  console.log('')
  console.log(`${fellBack} pointer file(s) written instead of symlinks.`)
  console.log('Enable Windows Developer Mode (or run as Administrator) and re-run `pnpm run links`')
  console.log('to convert them into real symlinks before committing.')
}

/**
 * Deletes whatever currently occupies a path, whether file, symlink or directory.
 *
 * @param {string} path
 * @returns {void}
 */
function removeExisting(path) {
  try {
    const stats = lstatSync(path)
    if (stats.isDirectory()) {
      throw new Error(`refusing to replace directory at ${path}`)
    }
    rmSync(path, { force: true })
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') {
      throw error
    }
  }
}

/**
 * Builds the fallback file body: a short redirect to AGENTS.md.
 *
 * @param {{ path: string, target: string }} link
 * @returns {string}
 */
function pointerBody(link) {
  const hint = relative(dirname(join(ROOT, link.path)), join(ROOT, SOURCE))
    .split(sep)
    .join('/')
  const sourceBody = readFileSync(resolve(dirname(join(ROOT, link.path)), link.target), 'utf8')
  return [
    '<!-- GENERATED FILE — DO NOT EDIT. -->',
    '<!-- Sigilgen instructions live in AGENTS.md. This file exists only because creating a',
    '     symlink is not permitted on this machine. Run `pnpm run links` with symlink',
    `     privileges to replace it with a real link to ${link.target}. -->`,
    '',
    `# AGENTS.md — see \`${hint}\``,
    '',
    `Read \`${hint}\` and follow it. Its full contents are reproduced below so that no`,
    'instruction is lost while this fallback file is in place.',
    '',
    '---',
    '',
    sourceBody.trimEnd(),
    '',
  ].join('\n')
}

/**
 * Turns an unknown thrown value into a short human-readable string.
 *
 * @param {unknown} error
 * @returns {string}
 */
function describe(error) {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

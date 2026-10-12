import { defineConfig } from 'vitest/config'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * The studio's own test configuration.
 *
 * It is separate from the library's because the two answer different questions. The library's suite runs
 * in `node` and tests pure functions; this one runs in `jsdom` and covers the parts of the interface that
 * only exist in a browser — persistence, clipboard, locale, layout — which is precisely the surface that
 * had no tests at all until now.
 *
 * The aliases point at the library's TypeScript source rather than its build output, so a change in the
 * library is a change here without a rebuild. That is the same arrangement the dev server uses, and it
 * means a test failure points at a line of source rather than at a stale bundle.
 *
 * ## The aliases are derived, not copied
 *
 * They are read out of `tsconfig.json`'s `compilerOptions.paths` rather than restated. Listing them here
 * too was correct until it wasn't: `tsconfig` uses one wildcard, `"@sigilgen/*": ["../../src/*"]`, and the
 * hand-written list enumerated five specific entry points. The sixth import — `@sigilgen/text`, pulled in
 * by `font-sample.ts` — typechecked, built and ran in the browser, and failed only under test. Deriving the
 * two from one source makes that class of drift impossible rather than merely unlikely.
 */
interface PathMapping {
  [pattern: string]: string[]
}

/** Reads `compilerOptions.paths` out of the studio's `tsconfig.json`. */
function pathMappings(): PathMapping {
  const raw = readFileSync(fileURLToPath(new URL('./tsconfig.json', import.meta.url)), 'utf8')
  const parsed = JSON.parse(raw) as {
    compilerOptions?: { paths?: PathMapping }
  }
  return parsed.compilerOptions?.paths ?? {}
}

/**
 * Turns one TypeScript path mapping into a Vite alias.
 *
 * Only the single-wildcard form is handled, which is the only form this project uses. A pattern with a
 * `*` in its middle would need a regular expression rather than a prefix, and silently supporting half
 * the syntax would be worse than failing loudly.
 *
 * @param pattern - The TypeScript key, e.g. `@sigilgen/*`.
 * @param targets - The replacement values; the first is used, as Vite takes one target per alias.
 * @returns A Vite alias, or `null` when the pattern is not a trailing wildcard.
 */
function toAlias(pattern: string, targets: string[]): { find: string; replacement: string } | null {
  if (!pattern.endsWith('/*')) {
    throw new Error(
      `vitest.config.ts only derives aliases of the form "prefix/*"; tsconfig.json declares "${pattern}". ` +
        'Teach toAlias() that shape rather than letting the two drift.'
    )
  }
  const target = targets[0]
  if (target === undefined) {
    return null
  }
  // `tsconfig.json`'s paths are relative to that file, which sits beside this one, so the mapping resolves
  // as-is. Prepending a level — which reads as tidying — lands above the repository.
  const base = fileURLToPath(new URL(target.slice(0, -1), import.meta.url))
  // The `find` is the pattern with its trailing `*` removed but *keeping* neither slash, because Vite's
  // alias matching tests `importee.startsWith(find + '/')`. A `find` that already ends in `/` can never
  // match anything, and fails as a bare "does not exist" for every import it should have caught.
  return { find: pattern.slice(0, -2), replacement: base }
}

const alias = Object.entries(pathMappings())
  .map(([pattern, targets]) => toAlias(pattern, targets))
  .filter((entry): entry is { find: string; replacement: string } => entry !== null)

export default defineConfig({
  resolve: { alias },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
  },
})

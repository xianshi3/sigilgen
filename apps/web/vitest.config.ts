import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * The studio's own test configuration.
 *
 * It is separate from the library's because the two answer different questions. The library's suite runs
 * in `node` and tests pure functions; this one runs in `jsdom` and covers the parts of the interface that
 * only exist in a browser — persistence, clipboard, locale — which is precisely the surface that had no
 * tests at all until now.
 *
 * The `@sigilgen/*` aliases point at the library's TypeScript source rather than its build output, so a
 * change in the library is a change here without a rebuild. That is the same arrangement the dev server
 * uses, and it means a test failure points at a line of source rather than at a stale bundle.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@sigilgen/types': fileURLToPath(new URL('../../src/types.ts', import.meta.url)),
      '@sigilgen/generate': fileURLToPath(new URL('../../src/generate.ts', import.meta.url)),
      '@sigilgen/engines/abstract': fileURLToPath(
        new URL('../../src/engines/abstract.ts', import.meta.url)
      ),
      '@sigilgen/engines/emblem': fileURLToPath(
        new URL('../../src/engines/emblem.ts', import.meta.url)
      ),
      '@sigilgen/engines/lettermark': fileURLToPath(
        new URL('../../src/engines/lettermark.ts', import.meta.url)
      ),
      '@sigilgen/engines/wordmark': fileURLToPath(
        new URL('../../src/engines/wordmark.ts', import.meta.url)
      ),
      '@sigilgen/engines/shared': fileURLToPath(
        new URL('../../src/engines/shared.ts', import.meta.url)
      ),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
})

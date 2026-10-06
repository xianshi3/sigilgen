import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The generator core is TypeScript source, imported straight from `../../src` so that editing an
// engine hot-reloads here instead of requiring a rebuild of the published bundle.
const core = fileURLToPath(new URL('../../src', import.meta.url))
const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@sigilgen': core },
  },
  server: {
    // The core lives outside this package's root, so the dev server has to be allowed to read it.
    fs: { allow: [repoRoot] },
  },
  build: { outDir: 'dist', emptyOutDir: true },
})

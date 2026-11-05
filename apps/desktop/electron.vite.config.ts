import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'

/**
 * The desktop shell's build, in three parts.
 *
 * The renderer is deliberately the *studio source*, not a copy of it: `root` points at `apps/web`, so
 * the desktop build compiles the same `index.html`, the same entry point and the same Tailwind scan as
 * the browser build. Wrapping a second copy of the interface would be two products to keep in step.
 *
 * Main and preload are externalised: Electron's own modules are supplied by the runtime, and this
 * package has no runtime dependencies to bundle.
 */

const webRoot = fileURLToPath(new URL('../web', import.meta.url))
const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const core = fileURLToPath(new URL('../../src', import.meta.url))
const out = (name: string): string => fileURLToPath(new URL(`out/${name}`, import.meta.url))

/**
 * The production page policy.
 *
 * The renderer is a local page with no network surface of its own: every asset is bundled, and the only
 * outbound traffic is the user explicitly choosing a link. Inline styles are required because React
 * writes style attributes; nothing else is allowed to be inline.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

/** Injects the policy into the built page; the dev server keeps its own, looser one for HMR. */
const contentSecurityPolicy: Plugin = {
  name: 'sigilgen-desktop-csp',
  apply: 'build',
  transformIndexHtml(html) {
    return html.replace(
      '<head>',
      `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />`
    )
  },
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: out('main'),
      rollupOptions: { input: fileURLToPath(new URL('src/main/index.ts', import.meta.url)) },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: out('preload'),
      rollupOptions: { input: fileURLToPath(new URL('src/preload/index.ts', import.meta.url)) },
    },
  },
  renderer: {
    root: webRoot,
    base: './',
    resolve: {
      alias: { '@sigilgen': core },
    },
    plugins: [react(), tailwindcss(), contentSecurityPolicy],
    server: {
      fs: { allow: [repoRoot] },
    },
    build: {
      outDir: out('renderer'),
      emptyOutDir: true,
      minify: true,
      rollupOptions: {
        input: fileURLToPath(new URL('../web/index.html', import.meta.url)),
        output: {
          codeSplitting: {
            groups: [
              { name: 'motion', test: /node_modules[\\/](motion|framer-motion)[\\/]/ },
              { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            ],
          },
        },
      },
    },
  },
})

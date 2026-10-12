import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsup'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
  },
  format: ['esm', 'cjs'],
  target: 'node22',
  platform: 'node',
  // `sharp` is an optional dependency reached only through a dynamic import. Bundling it would inline
  // a native module into the bundle — bloating every install and breaking the "zero runtime
  // dependencies" guarantee — so it stays external and is resolved at run time, or fails cleanly.
  external: ['sharp'],
  // The manifest is the only copy of the version. `src/cli.ts` reads `__SIGILGEN_VERSION__` and tsup
  // substitutes this here, so `sigilgen --version` reports whatever `package.json` says without the
  // number being written down twice — the duplication being what makes a version lie after a release.
  define: {
    __SIGILGEN_VERSION__: JSON.stringify(pkg.version),
  },
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  treeshake: true,
  minify: false,
  publicDir: false,
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' }
  },
})

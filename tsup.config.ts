import { defineConfig } from 'tsup'

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

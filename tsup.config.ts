import { defineConfig } from 'tsup';

export default defineConfig([
  // The published package.
  {
    entry: ['src/index.ts', 'src/widget/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    target: 'es2022',
  },
  // A single self-contained file for the demo site, so the deployed directory
  // is just `demo/` rather than the whole repo. Not published — `files` in
  // package.json only ships `dist`.
  {
    entry: { widget: 'src/widget/index.ts' },
    outDir: 'demo',
    format: ['esm'],
    splitting: false,
    dts: false,
    sourcemap: false,
    clean: false,
    minify: true,
    treeshake: true,
    target: 'es2022',
  },
]);

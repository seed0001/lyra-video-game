// Bundles the game (src/main.js and three.js) into dist/main.js with esbuild, plus the terrain worker
// beside it (terrain.js finds it at new URL('./terrainWorker.js', import.meta.url)), and copies the
// Basis transcoder KTX2Loader needs into dist/basis/. `npm run dev` rebuilds on every save.
import * as esbuild from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const watch = process.argv.includes('--watch');

await mkdir(path.join(root, 'dist/basis'), { recursive: true });
for (const f of ['basis_transcoder.js', 'basis_transcoder.wasm']) {
  await cp(path.join(here, 'node_modules/three/examples/jsm/libs/basis', f), path.join(root, 'dist/basis', f));
}

const options = {
  entryPoints: { main: path.join(root, 'src/main.js'), terrainWorker: path.join(root, 'src/terrainWorker.js') },
  outdir: path.join(root, 'dist'),
  bundle: true,
  format: 'esm',          // main.js uses top-level await
  target: 'es2022',
  minify: !watch,
  sourcemap: true,
  legalComments: 'none',
  nodePaths: [path.join(here, 'node_modules')], // src/ has no node_modules of its own
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}

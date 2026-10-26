// Optimizes assets/ for the web, in place:
//   - every .glb: meshopt geometry and animation compression (EXT_meshopt_compression, replacing
//     Draco), textures to KTX2 (ETC1S, at most 2048 on a side; normal maps in normal-map mode),
//     deduped and pruned
//   - every .png: to a KTX2 (ETC1S with mipmaps, flipped so it samples like a PNG with flipY), and the
//     .png removed
// Re-running is safe: a .glb that already uses meshopt is skipped, and only remaining .pngs convert.
import { readdir, readFile, writeFile, unlink, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import draco3d from 'draco3dgltf';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, meshopt } from '@gltf-transform/functions';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import { encodeToKTX2 } from 'ktx2-encoder';

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(here, '../assets');

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else out.push(p);
  }
  return out;
}

// Raw RGBA for the Basis encoder: at most 2048 on a side, and a multiple of 4 each way (block-compressed
// formats need whole 4x4 blocks).
const MAX = 2048;
async function decode(buffer) {
  const img = sharp(buffer);
  const { width, height } = await img.metadata();
  const s = Math.min(1, MAX / Math.max(width, height));
  const w = Math.ceil(width * s / 4) * 4, h = Math.ceil(height * s / 4) * 4;
  const { data, info } = await img.resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
let before = 0, after = 0;
const files = await walk(assets);

// ---------- models ----------
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });

for (const file of files.filter((f) => f.endsWith('.glb'))) {
  const doc = await io.read(file);
  const used = doc.getRoot().listExtensionsUsed().map((e) => e.extensionName);
  if (used.includes('EXT_meshopt_compression')) { console.log(`skip  ${path.relative(assets, file)} (already meshopt)`); continue; }
  const size0 = (await stat(file)).size;
  // geometry comes out decoded; drop Draco so it isn't re-encoded on write
  for (const ext of doc.getRoot().listExtensionsUsed()) if (ext.extensionName === 'KHR_draco_mesh_compression') ext.dispose();
  await doc.transform(
    dedup(),
    prune(),
    resample(),
    ktx2({ isUASTC: false, isNormalMap: true, qualityLevel: 200, generateMipmap: true, enableDebug: false, slots: /^normalTexture$/, imageDecoder: decode }),
    ktx2({ isUASTC: false, qualityLevel: 160, generateMipmap: true, enableDebug: false, slots: /^(?!normalTexture$).*/, imageDecoder: decode }),
    meshopt({ encoder: MeshoptEncoder, level: 'high' }),
  );
  await io.write(file, doc);
  const size1 = (await stat(file)).size;
  before += size0; after += size1;
  console.log(`glb   ${path.relative(assets, file)}: ${kb(size0)} -> ${kb(size1)}`);
}

// ---------- images ----------
for (const file of files.filter((f) => f.endsWith('.png'))) {
  const png = await readFile(file);
  const out = file.replace(/\.png$/, '.ktx2');
  const data = await encodeToKTX2(new Uint8Array(png), {
    isUASTC: false, qualityLevel: 160, generateMipmap: true, isYFlip: true, enableDebug: false, imageDecoder: decode,
  });
  await writeFile(out, data);
  await unlink(file);
  before += png.length; after += data.length;
  console.log(`image ${path.relative(assets, file)}: ${kb(png.length)} -> ${kb(data.length)}`);
}

console.log(`\nassets: ${kb(before)} -> ${kb(after)}`);

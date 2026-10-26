import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Shared loaders for the optimized assets (build/optimize-assets.mjs): GLBs are meshopt-compressed
// with KTX2 textures, and every image is a KTX2. The Basis transcoder is copied to dist/basis/ by
// build/build.mjs. initLoaders(renderer) must run before anything loads (KTX2 picks the GPU format).
export const ktx2Loader = new KTX2Loader().setTranscoderPath('dist/basis/');
export const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx2Loader);

export function initLoaders(renderer) {
  ktx2Loader.detectSupport(renderer);
}

// A colour KTX2 image (sRGB). The files are stored flipped, so they sample like a PNG with flipY.
export async function loadImage(url) {
  const t = await ktx2Loader.loadAsync(url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// copy a loaded compressed texture's data into another (keeping that one's own wrap, repeat and offset)
export function fill(t, src) {
  t.image = src.image;
  t.mipmaps = src.mipmaps;
  t.format = src.format;
  t.type = src.type;
  t.minFilter = src.minFilter;
  t.magFilter = src.magFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
}

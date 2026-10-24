import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { tagFixed } from './cast.js';

// Patch, from the dog model on travisbollenbach.com (Chance, a Meshy model with a walk cycle).
// He lives in the ops room: laps of the room with stops at his bed and by Lyra's platform.
// Like everyone else, where he is is a pure function of the world clock.
const HEIGHT = 0.6;            // at the shoulder-ish top of the model, meters
const SPEED = 0.9;             // m/s
const YAW = 0;                 // turns the model so it faces +z
// laps of the ops room (its local frame), around Lyra's platform at (-15, 0); rest seconds at each
const LOOP = [
  [[-6.2, 5.1], 540],          // his bed
  [[-11, 7.5], 25],
  [[-19, 7.5], 40],
  [[-24.5, 2], 20],
  [[-22, -7], 60],
  [[-14.5, -2.6], 120],        // in front of Lyra
  [[-9, -7], 20],
  [[-6.5, -1], 15],
];

export async function buildPatch(ops, floorY) {
  const obj = await new FBXLoader().loadAsync('assets/characters/chance.fbx');
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    o.frustumCulled = false; // skinned: the bind-pose bounds don't follow the walk
    if (o.material.map) { o.material.map.colorSpace = THREE.SRGBColorSpace; o.material.map.anisotropy = 8; }
  });
  const box = new THREE.Box3().setFromObject(obj);
  const s = HEIGHT / (box.max.y - box.min.y);
  const c = box.getCenter(new THREE.Vector3());
  const model = new THREE.Group();
  model.add(obj);
  obj.position.set(-c.x, -box.min.y, -c.z);
  model.scale.setScalar(s);
  model.rotation.y = YAW;
  const root = new THREE.Group();
  root.add(model);
  tagFixed(root, { x: 0, z: 0 }, 'Patch', '#f2f2f0', HEIGHT + 0.25);
  ops.add(root);

  const mixer = new THREE.AnimationMixer(obj);
  const clip = obj.animations[0];
  if (clip) mixer.clipAction(clip).play();
  const cycle = clip ? clip.duration : 1;

  // the loop as timed segments
  const segs = [];
  let t = 0;
  for (let i = 0; i < LOOP.length; i++) {
    const [a, rest] = LOOP[i], b = LOOP[(i + 1) % LOOP.length][0];
    segs.push({ t0: t, t1: t + rest, a, b: a, walk: false });
    t += rest;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segs.push({ t0: t, t1: t + len / SPEED, a, b, walk: true, len });
    t += len / SPEED;
  }
  const period = t;
  let heading = 0;

  return {
    root,
    update(simMs) {
      const sec = ((simMs / 1000) % period + period) % period;
      const sg = segs.find((x) => sec < x.t1) || segs[segs.length - 1];
      const f = sg.walk ? (sec - sg.t0) / (sg.t1 - sg.t0) : 0;
      root.position.set(sg.a[0] + (sg.b[0] - sg.a[0]) * f, floorY, sg.a[1] + (sg.b[1] - sg.a[1]) * f);
      if (sg.walk) heading = Math.atan2(sg.b[0] - sg.a[0], sg.b[1] - sg.a[1]);
      root.rotation.y = heading;
      // walk cycle while moving; standing (the cycle's first frame) at rest
      mixer.setTime(sg.walk ? ((sec - sg.t0) * SPEED / 1.0) % cycle : 0);
    },
  };
}

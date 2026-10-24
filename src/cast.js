import * as THREE from 'three';
import { castRoute, dayIndex, dayStart, dayOfWeek, CITY_NAMES } from './commute.js';
import { outdoor, OPS_DOOR, OPS_STEP, LINES_Z } from './people.js';
import { HOMES, VIRA_STALLS } from './homes.js';
import { loadVehicle, loadModel } from './models.js';
import { bikeGeo } from './juno.js';
import { toWorld } from './interiors.js';
import { getHeight, TOWN_Z } from './terrain.js';
import { rng } from './noise.js';
import { localClock } from './sun.js';

// The series cast on their daily schedules: Marcus rides in from Saltbrush, Nova drives down from
// the hills above Halcyon, Juno brings the trike over from Ironwood, and James and Solo spend their
// days at Vira. Those with a model (from Meshy, converted to Draco GLB) walk and idle in it; the rest
// are drawn with the staff's bodies (people.js) in their own clothes (story/characters/cast_card.png)
// until they have one. Everyone has a name tag over their head.
// Like the staff, where everyone is is a pure function of the world clock.
const MIN = 60000, HOUR = 3600000, WALK = 1.35, MOUNT = 1.5 * MIN;
const OPS_FL = 0.15;                 // the operations building's floor (interiorVira.js FL)
const ROVER = [92, -545];            // James's rover in Bay Three (main.js parks it)

// Spots inside the operations building, in its frame. Lyra's platform is at (-15, 0).
const LYRA = [-15, 0];
const IN = {
  lyraA: [-14.5, 2.8], lyraB: [-17.8, 2.2], lyraC: [-11.8, 1.6], lyraD: [-13, 4.4], lyraE: [-16, 3.4],
  console: [-21, 6], lobbyA: [-33, 4], lobbyB: [-35, -3],
  desk: [0.6, 6.4], office: [-1.5, 3.5], office2: [1.8, 4],
  serversA: [12, -2], serversB: [20, 3],
};
const faceLyra = (p) => Math.atan2(LYRA[0] - p[0], LYRA[1] - p[1]);

// look: shirt/jacket, pants, skin, hair (a bald head is skin), scale (1 = 1.75 m)
const CAST = [
  {
    id: 'marcus', name: 'Marcus Hale', tag: '#36e0ff', title: 'Lead data scientist',
    look: { shirt: '#1a1a1c', pants: '#2b2f37', skin: '#dba882', hat: '#8c8780', scale: 1.03 },
    vehicle: 'bike', seat: { y: 0.45, z: -0.38 },
    // weekdays, in at 7
    shift: (d) => (dayOfWeek(d) % 6 ? [7, 17.5] : null),
    acts: [
      { at: IN.desk, face: Math.PI, pose: 'inspect', prop: 'tablet', what: 'At his desk', w: 3 },
      { at: IN.lyraA, pose: 'stand', what: 'In the ops room with Lyra', w: 3 },
      { at: IN.serversA, face: Math.PI / 2, pose: 'inspect', prop: 'tablet', what: 'Checking the server hall', w: 1 },
      { out: [96.5, -549], face: -Math.PI / 4, pose: 'look', what: "Looking over James's rover", w: 1 },
    ],
  },
  {
    id: 'nova', name: 'Nova', tag: '#d8b4ff', title: 'Human-AI psychology',
    model: 'assets/characters/nova.glb', height: 1.7,
    look: { shirt: '#202022', pants: '#93a7bc', skin: '#f1c8a6', hat: '#2a1c15', scale: 0.97 },
    vehicle: 'nova_car',
    shift: (d) => (dayOfWeek(d) % 6 ? [9, 17.5] : null),
    acts: [
      { at: IN.lyraB, pose: 'stand', what: 'Talking with Lyra', w: 4 },
      { at: IN.console, face: Math.PI, pose: 'inspect', prop: 'tablet', what: 'Taking notes in the ops room', w: 2 },
      { at: IN.office, face: Math.PI / 2, pose: 'stand', what: "In Marcus's office", w: 1 },
      { at: IN.lobbyA, face: Math.PI, pose: 'stand', what: 'In the lobby', w: 1 },
    ],
  },
  {
    id: 'juno', name: 'Juno', tag: '#ffb84d', title: "Vira's mechanic",
    look: { shirt: '#3b3a33', pants: '#33322e', skin: '#e9b894', hat: '#e8e2d4', scale: 0.96 },
    vehicle: 'juno_trike', seat: { y: 0.5, z: -0.45 },
    // Monday to Saturday, in at 7:30
    shift: (d) => (dayOfWeek(d) ? [7.5, 16.5] : null),
    acts: [
      { out: [92, -548.6], face: 0, pose: 'kneel', what: 'Working on the rover', w: 3 },
      { out: [96.2, -545.4], face: -Math.PI / 2, pose: 'reach', what: "Under the rover's front end", w: 2 },
      { at: IN.lyraC, pose: 'stand', what: 'In the ops room with Lyra', w: 2 },
      { at: IN.serversB, face: 0, pose: 'kneel', what: 'Fixing a cooling unit in the server hall', w: 1 },
    ],
  },
  {
    id: 'james', name: 'James Dunn', tag: '#9fd36a', title: 'Colonel, U.S. Army',
    look: { shirt: '#7b7a5a', pants: '#6f6e52', skin: '#dc9f80', hat: '#dc9f80', scale: 1.04 },
    // on site with his rover through the day; where he stays isn't canon yet
    visitor: true,
    shift: (d) => (dayOfWeek(d) % 6 ? [9, 16] : null),
    acts: [
      { out: [89, -541.5], face: Math.PI / 2, pose: 'stand', what: 'With his rover', w: 3 },
      { at: IN.lyraD, pose: 'stand', what: 'Talking with Lyra', w: 2 },
      { at: IN.office2, face: -Math.PI / 2, pose: 'stand', what: "In Marcus's office", w: 1 },
    ],
  },
  {
    id: 'solo', name: 'Solo', tag: '#ff7a8a', title: "Lyra's guest",
    model: 'assets/characters/solo.glb', height: 1.78,
    look: { shirt: '#6b2a27', pants: '#3f5878', skin: '#d9a77f', hat: '#241912', scale: 1.0 },
    visitor: true,
    shift: () => [9.5, 20],
    acts: [
      { at: IN.lyraE, pose: 'stand', what: 'With Lyra', w: 4 },
      { at: IN.lobbyB, face: 0, pose: 'look', what: 'In the lobby', w: 1 },
      { out: [87, -551], face: Math.PI / 3, pose: 'look', what: 'Watching the work on the rover', w: 1 },
    ],
  },
];

// ---------- name tags ----------
function nameTag(text, color) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = '600 44px system-ui, "Segoe UI", Arial, sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text.toUpperCase()).width) + 74, h = 92;
  c.width = w; c.height = h;
  ctx.font = font;
  ctx.fillStyle = 'rgba(6,14,22,.78)';
  ctx.beginPath(); ctx.roundRect(4, 4, w - 8, 62, 10); ctx.fill();
  ctx.fillStyle = color;
  ctx.fillRect(4, 4, 10, 62);
  ctx.beginPath(); ctx.moveTo(w / 2 - 13, 66); ctx.lineTo(w / 2 + 13, 66); ctx.lineTo(w / 2, 86); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.toUpperCase(), 36, 37);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthWrite: false, fog: false, toneMapped: false, transparent: true }));
  const H = 0.042;
  s.scale.set(H * w / h, H, 1);
  s.center.set(0.5, 0);
  s.renderOrder = 10;
  return s;
}

// Marcus's bike until the cast's vehicles all have models: the chopper from Juno's workshop.
function buildBike() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(bikeGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.6 }));
  m.rotation.y = -Math.PI / 2; // its nose is +x; turn it to +z like the other vehicles
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return g;
}

// A cast member's own model: scaled to their height, with idle and walk cycles to blend between.
async function rig(def) {
  const gltf = await loadModel(def.model);
  const obj = gltf.scene;
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    o.frustumCulled = false; // skinned: the bind-pose bounds don't follow the animation
    const m = o.material;
    if (m.emissiveMap) { m.emissiveMap = null; m.emissive.set(0x000000); } // Meshy bakes the colour in as emission too
  });
  const box = new THREE.Box3().setFromObject(obj);
  const s = def.height / (box.max.y - box.min.y);
  obj.scale.setScalar(s);
  obj.position.y = -box.min.y * s;
  const root = new THREE.Group();
  root.add(obj);
  root.visible = false;
  const mixer = new THREE.AnimationMixer(obj);
  const clip = (re) => gltf.animations.find((a) => re.test(a.name)) || gltf.animations[0];
  const actions = { idle: mixer.clipAction(clip(/Idle/)), walk: mixer.clipAction(clip(/Walking/)) };
  for (const a of Object.values(actions)) { a.play(); a.setEffectiveWeight(0); }
  return { root, mixer, actions, walkW: 0 };
}

// ---------- a day at Vira ----------
// Places: { out: [x, z] } outdoors (world), or { at: [x, z] } inside the operations building.
// Segments: walk { pts, cum, len } outdoors, or stay { x, y, z, h } (h world heading).
function polyline(pts) {
  const clean = [pts[0]];
  for (const q of pts) { const l = clean[clean.length - 1]; if (Math.hypot(q[0] - l[0], q[1] - l[1]) > 0.01) clean.push(q); }
  const cum = [0];
  for (let i = 1; i < clean.length; i++) cum.push(cum[i - 1] + Math.hypot(clean[i][0] - clean[i - 1][0], clean[i][1] - clean[i - 1][1]));
  return { pts: clean, cum, len: cum[cum.length - 1] };
}

function buildDay(m, ops, t0, t1) {
  const r = rng(m.seedBase + Math.floor(t0 / MIN));
  const segs = [];
  let t = t0, at = m.visitor ? { at: IN.lobbyA } : { out: m.carSpot }, h = 0;
  const inWorld = (p) => toWorld(ops, p[0], OPS_FL, p[1]);
  const walk = (pts, what) => {
    const pl = polyline(pts);
    if (pl.len < 0.05) return;
    const dur = (pl.len / WALK) * 1000;
    segs.push({ kind: 'walk', t0: t, t1: t + dur, ...pl, what });
    t += dur;
    const n = pl.pts.length;
    h = Math.atan2(pl.pts[n - 1][0] - pl.pts[n - 2][0], pl.pts[n - 1][1] - pl.pts[n - 2][1]);
  };
  const stay = (ms, pose, what, opt = {}) => {
    let x, y, z, hh = opt.h ?? h;
    if (at.out) { [x, z] = at.out; y = null; } else { const v = inWorld(at.at); x = v.x; y = v.y; z = v.z; }
    segs.push({ kind: 'stay', t0: t, t1: t + ms, x, y, z, h: hh, pose, prop: opt.prop || null, what, inside: !at.out });
    t += ms; h = hh;
  };
  // walking between two places; inside the building they just appear where they're going
  const pathTo = (a, b) => {
    if (a.at && b.at) return [];
    const from = a.out || OPS_STEP, to = b.out || OPS_STEP;
    const pts = outdoor(from, to);
    if (a.at) pts.unshift(OPS_DOOR);
    if (b.at) pts.push(OPS_DOOR);
    return pts;
  };
  const lotEdge = m.carSpot && [m.carSpot[0], LINES_Z[0]];
  const go = (b, what) => {
    let pts = pathTo(at, b);
    if (m.carSpot && at.out === m.carSpot) pts = [m.carSpot, lotEdge, ...outdoor(lotEdge, b.out || OPS_STEP).slice(1), ...(b.at ? [OPS_DOOR] : [])];
    if (pts.length) walk(pts, what);
    at = b;
  };

  if (!m.visitor) stay(0.6 * MIN, 'stand', m.vehicle === 'nova_car' ? 'Parking' : 'Parking the ' + (m.vehicle === 'bike' ? 'bike' : 'trike'), { h: Math.PI });
  const total = m.acts.reduce((s, a) => s + a.w, 0);
  let last = null, guard = 0;
  const RET = 12 * MIN;
  while (t < t1 - RET && guard++ < 60) {
    let u = r() * total, a = m.acts[0];
    for (const x of m.acts) { if ((u -= x.w) < 0) { a = x; break; } }
    if (a === last) continue;
    last = a;
    const place = a.out ? { out: a.out } : { at: a.at };
    go(place, a.out ? 'Heading out to Bay Three' : 'Walking in');
    const face = a.face ?? (a.at ? faceLyra(a.at) : 0);
    const dur = Math.min((20 + r() * 50) * MIN, Math.max(MIN, t1 - RET - t));
    stay(dur, a.pose, a.what, { h: face, prop: a.prop });
  }
  // back out at the end of the day: to the car, or (visitors) into the lobby and away
  const end = m.visitor ? { at: IN.lobbyA } : { out: m.carSpot };
  let pts = pathTo(at, end);
  if (!m.visitor && pts.length) pts = [...pts.slice(0, -1), lotEdge, m.carSpot];
  const len = pts.length ? polyline(pts).len : 0;
  const leave = t1 - (len / WALK) * 1000 - (m.visitor ? 0 : 0.5 * MIN);
  const lastSeg = segs[segs.length - 1];
  if (lastSeg && lastSeg.kind === 'stay' && leave > t) { lastSeg.t1 = leave; t = leave; }
  if (pts.length) walk(pts, m.visitor ? 'Heading out for the day' : 'Walking back to the ' + (m.vehicle === 'nova_car' ? 'car' : m.vehicle === 'bike' ? 'bike' : 'trike'));
  at = end;
  if (!m.visitor) stay(Math.max(0, t1 - t), 'stand', m.vehicle === 'nova_car' ? 'Getting in the car' : 'Getting on the ' + (m.vehicle === 'bike' ? 'bike' : 'trike'));
  return segs;
}

function segAt(segs, t) {
  let lo = 0, hi = segs.length - 1;
  if (!segs.length || t < segs[0].t0 || t >= segs[hi].t1) return null;
  while (lo < hi) { const k = (lo + hi + 1) >> 1; if (segs[k].t0 <= t) lo = k; else hi = k - 1; }
  return segs[lo];
}

// ---------- the cast ----------
// homes: { nova, juno } (their home groups), ops: the operations building, staff: traffic.staff
export async function buildCast({ novaHome, junoHome, ops, staff }) {
  const group = new THREE.Group();

  // Marcus's house: a Saltbrush house nobody on staff lives in, on the south side toward Vira.
  const taken = staff.map((e) => e.home.drive);
  const vacant = HOMES.saltbrush.filter((h) => !taken.some(([x, z]) => Math.hypot(x - h.drive[0], z - h.drive[1]) < 15));
  vacant.sort((a, b) => Math.hypot(a.drive[0], a.drive[1] - TOWN_Z - 400) - Math.hypot(b.drive[0], b.drive[1] - TOWN_Z - 400));
  const marcusHome = vacant[0] || HOMES.saltbrush[0];
  // parking stalls nobody uses, closest to the operations building
  const usedStalls = new Set(staff.map((e) => e.stall));
  const stalls = VIRA_STALLS.filter((s) => !usedStalls.has(s))
    .sort((a, b) => Math.hypot(a.x - OPS_STEP[0], a.z - OPS_STEP[1]) - Math.hypot(b.x - OPS_STEP[0], b.z - OPS_STEP[1]));
  if (stalls.length < 3) console.warn('cast: not enough free stalls at Vira', stalls.length);

  const homeSpot = (home, s) => { const v = toWorld(home, s.x, s.y || 0, s.z); return { x: v.x, y: v.y, z: v.z, h: (s.ry || 0) + home.rotation.y }; };
  const novaCar = homeSpot(novaHome, novaHome.userData.spots.nova_car);
  const junoTrike = homeSpot(junoHome, junoHome.userData.spots.juno_trike);
  const homes = {
    marcus: {
      route: { city: 'saltbrush', drive: marcusHome.drive, street: marcusHome.street },
      park: { x: marcusHome.drive[0], y: Math.max(0, getHeight(...marcusHome.drive)) + 0.08, z: marcusHome.drive[1], h: marcusHome.street > marcusHome.drive[1] ? 0 : Math.PI },
      figure: null, place: CITY_NAMES.saltbrush,
    },
    nova: {
      route: { city: 'halcyon', road: 'novahill', drive: [novaCar.x, novaCar.z] },
      park: novaCar, figure: homeSpot(novaHome, novaHome.userData.cast.nova), place: 'the hills above Halcyon',
    },
    juno: {
      route: { city: 'ironwood', road: 'junodrive', drive: [junoTrike.x, junoTrike.z] },
      park: junoTrike, figure: homeSpot(junoHome, junoHome.userData.cast.juno), place: 'her place outside Ironwood',
    },
  };

  const members = [];
  let si = 0;
  for (const [i, def] of CAST.entries()) {
    const m = { ...def, seedBase: (i + 1) * 104729, plans: new Map(), state: null, pos: new THREE.Vector3(), heading: 0, speed: 0 };
    m.look = {
      shirt: new THREE.Color(def.look.shirt), pants: new THREE.Color(def.look.pants), skin: new THREE.Color(def.look.skin),
      hat: new THREE.Color(def.look.hat), scale: def.look.scale, seed: i * 17.3,
    };
    m.w = {};
    m.tagSprite = nameTag(def.name, def.tag);
    m.tagSprite.visible = false;
    group.add(m.tagSprite);
    if (def.model) {
      try { m.rig = await rig(def); group.add(m.rig.root); } catch (e) { console.warn('cast model failed', def.model, e); }
    }
    if (!def.visitor) {
      m.home = homes[def.id];
      const stall = stalls[si++] || VIRA_STALLS[si];
      m.stall = stall;
      m.carSpot = [stall.x + 1.45, stall.z];
      m.route = castRoute(m.home.route, stall);
      m.routeHome = m.route.reversed();
      m.parkWork = m.route.at(m.route.duration, {});
      try { m.car = def.vehicle === 'bike' ? buildBike() : await loadVehicle(def.vehicle); } catch (e) { console.warn('cast vehicle failed', def.vehicle, e); }
      if (m.car) group.add(m.car);
    }
    members.push(m);
  }

  // ---------- schedules ----------
  const shiftOn = (m, d) => {
    const s = m.shift(d);
    return s && { start: dayStart(d) + s[0] * HOUR, end: dayStart(d) + s[1] * HOUR };
  };
  function stateAt(m, t) {
    const d = dayIndex(t);
    for (const day of [d - 1, d, d + 1]) {
      const sh = shiftOn(m, day);
      if (!sh) continue;
      if (m.visitor) {
        if (t >= sh.start && t < sh.end) return { mode: 'work', shift: sh };
        continue;
      }
      const dur = m.route.duration, leave = sh.start - dur;
      if (t >= leave - MOUNT && t < leave) return { mode: 'mount', shift: sh, eta: sh.start - t };
      if (t >= leave && t < sh.start) return { mode: 'toWork', tau: t - leave, shift: sh, eta: sh.start - t };
      if (t >= sh.start && t < sh.end) return { mode: 'work', shift: sh };
      if (t >= sh.end && t < sh.end + dur) return { mode: 'toHome', tau: t - sh.end, shift: sh, eta: sh.end + dur - t };
      if (t >= sh.end + dur && t < sh.end + dur + MOUNT) return { mode: 'dismount', shift: sh };
    }
    return { mode: m.visitor ? 'away' : 'home' };
  }
  function nextShift(m, t) {
    const d = dayIndex(t);
    for (let day = d; day < d + 8; day++) { const sh = shiftOn(m, day); if (sh && sh.start > t) return sh; }
    return null;
  }
  const planOf = (m, sh) => {
    let p = m.plans.get(sh.start);
    if (!p) { if (m.plans.size > 4) m.plans.clear(); p = buildDay(m, ops, sh.start, sh.end); m.plans.set(sh.start, p); }
    return p;
  };

  // ---------- per frame ----------
  const pose = {}, drawn = [];
  const v = new THREE.Vector3();
  let nearGate = false;
  const GATE = new THREE.Vector3(31, 0, -650);

  function placeFigure(m, x, y, z, h, poseName, opt = {}) {
    const w = m.w;
    w.x = x; w.z = z; w.h = h; w.pose = poseName; w.moving = !!opt.moving; w.phase = opt.phase || 0; w.tl = opt.tl || 0; w.prop = opt.prop || null;
    m.drawY = y; m.drawn = true;
    m.pos.set(x, y, z);
  }

  function update(t, dt, realDt = dt) {
    nearGate = false;
    for (const m of members) {
      const st = stateAt(m, t);
      m.state = st; m.drawn = false; m.inCar = false; m.speed = 0; m.doing = '';
      const tl = (t / 1000) % 1000;
      // vehicle
      let car = null;
      if (m.car) {
        if (st.mode === 'toWork' || st.mode === 'toHome') {
          const p = (st.mode === 'toWork' ? m.route : m.routeHome).at(st.tau, pose);
          const target = Math.atan2(p.hx, p.hz);
          if (dt < 0.5) { let dh = Math.atan2(Math.sin(target - m.heading), Math.cos(target - m.heading)); m.heading += dh * (1 - Math.exp(-dt * 6)); } else m.heading = target;
          car = { x: p.x, y: p.y, z: p.z, h: m.heading };
          m.speed = p.speed;
          if (v.set(p.x, 0, p.z).distanceToSquared(GATE) < 60 * 60) nearGate = true;
        } else if (st.mode === 'work') {
          const p = m.parkWork; car = { x: p.x, y: p.y, z: p.z, h: Math.atan2(p.hx, p.hz) };
          m.heading = car.h;
        } else {
          car = m.home.park; m.heading = car.h;
        }
        m.car.position.set(car.x, car.y, car.z);
        m.car.rotation.y = car.h;
        m.carPos = car;
      }
      // the person
      if (st.mode === 'toWork' || st.mode === 'toHome') {
        m.inCar = true;
        m.doing = st.mode === 'toWork' ? 'Driving to Vira' : `Driving home to ${m.home.place}`;
        if (m.vehicle !== 'nova_car') m.doing = m.doing.replace('Driving', 'Riding');
        if (m.seat) {
          // on the bike or trike: sit up on the seat
          const fx = Math.sin(car.h), fz = Math.cos(car.h);
          placeFigure(m, car.x + fx * m.seat.z, car.y + m.seat.y, car.z + fz * m.seat.z, car.h, 'sit');
        } else m.pos.set(car.x, car.y, car.z);
      } else if (st.mode === 'mount' || st.mode === 'dismount') {
        const p = car, sx = Math.cos(p.h), sz = -Math.sin(p.h);
        placeFigure(m, p.x + sx * 1.3, p.y, p.z + sz * 1.3, p.h + Math.PI / 2, 'stand', { tl });
        m.doing = st.mode === 'mount' ? (m.vehicle === 'nova_car' ? 'Getting in the car' : `Getting on the ${m.vehicle === 'bike' ? 'bike' : 'trike'}`) : 'Home';
      } else if (st.mode === 'home') {
        const f = m.home.figure;
        if (f) placeFigure(m, f.x, f.y, f.z, f.h, 'stand', { tl });
        else m.pos.set(m.home.park.x, m.home.park.y, m.home.park.z);
        const n = nextShift(m, t);
        m.doing = `At home in ${m.home.place}` + (n ? ` &middot; leaves ${localClock(new Date(n.start - m.route.duration - MOUNT))}` : '');
      } else if (st.mode === 'away') {
        const n = nextShift(m, t);
        m.doing = 'Off site' + (n ? ` &middot; back at Vira ${localClock(new Date(n.start))}` : '');
      } else {
        const segs = planOf(m, st.shift), s = segAt(segs, t);
        if (s) {
          m.doing = s.what;
          if (s.kind === 'walk') {
            const dd = Math.min(s.len, ((t - s.t0) / 1000) * WALK);
            let i = 1; while (i < s.cum.length - 1 && s.cum[i] < dd) i++;
            const a = s.pts[i - 1], b = s.pts[i], f = (dd - s.cum[i - 1]) / ((s.cum[i] - s.cum[i - 1]) || 1);
            const x = a[0] + (b[0] - a[0]) * f, z = a[1] + (b[1] - a[1]) * f;
            placeFigure(m, x, Math.max(0, getHeight(x, z)) + 0.1, z, Math.atan2(b[0] - a[0], b[1] - a[1]), 'walk', { moving: true, phase: dd / 0.72 * Math.PI, tl });
          } else {
            const y = s.y ?? Math.max(0, getHeight(s.x, s.z)) + 0.1;
            placeFigure(m, s.x, y, s.z, s.h, s.pose, { tl: (t - s.t0) / 1000, prop: s.prop });
          }
        }
      }
    }
    // models: blend toward the walk cycle while moving, the idle while standing
    for (const m of members) {
      const r = m.rig;
      if (!r || !m.drawn) continue;
      const k = 1 - Math.exp(-Math.min(realDt, 0.1) * 8);
      r.walkW += ((m.w.moving ? 1 : 0) - r.walkW) * k;
      r.actions.walk.setEffectiveWeight(r.walkW);
      r.actions.idle.setEffectiveWeight(1 - r.walkW);
      r.mixer.update(Math.min(realDt, 0.1));
    }
    return nearGate;
  }

  // what people.js draws this frame (figures near the camera), and where the tags go
  function extras(cam) {
    drawn.length = 0;
    for (const m of members) {
      const anchor = m.drawn ? m.pos : m.inCar && m.carPos ? v.set(m.carPos.x, m.carPos.y, m.carPos.z) : null;
      const dist = anchor ? anchor.distanceTo(cam) : Infinity;
      if (m.rig) {
        const show = m.drawn && dist < 1600;
        m.rig.root.visible = show;
        if (show) { m.rig.root.position.set(m.pos.x, m.drawY, m.pos.z); m.rig.root.rotation.y = m.w.h; }
      } else if (m.drawn && dist < 1600) drawn.push({ look: m.look, w: m.w, y: m.drawY });
      const tag = m.tagSprite;
      tag.visible = dist < 3000;
      if (tag.visible) tag.position.set(anchor.x, anchor.y + (m.drawn ? 1.95 * m.look.scale + (m.w.pose === 'sit' ? -0.35 : 0) : 2.2), anchor.z);
    }
    return drawn;
  }

  // ---------- follow camera (R) ----------
  let following = null;
  const followable = () => members.filter((m) => m.state && m.state.mode !== 'away');
  function followNext() {
    const pool = followable();
    if (!pool.length) return null;
    const i = following ? pool.indexOf(following) : -1;
    following = pool[(i + 1) % pool.length];
    camPos.set(Infinity, 0, 0);
    return following;
  }
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), want = new THREE.Vector3();
  function chase(camera, dt) {
    const m = following;
    if (!m || !m.state || m.state.mode === 'away') return false;
    const k = dt > 0.5 ? 1 : 1 - Math.exp(-dt * 4);
    if (m.inCar || (!m.drawn && m.carPos)) {
      // behind the vehicle (or the parked bike, while Marcus is indoors at home)
      const c = m.carPos, fx = Math.sin(c.h), fz = Math.cos(c.h), fast = m.speed > 15;
      const back = m.inCar ? (fast ? 13 : 9) : 9, high = m.inCar ? (fast ? 4.2 : 3.4) : 4;
      want.set(c.x - fx * back, c.y + high, c.z - fz * back);
      camLook.set(c.x + fx * 6, c.y + 1.2, c.z + fz * 6);
    } else {
      const p = m.pos, fx = Math.sin(m.w.h), fz = Math.cos(m.w.h);
      const near = m.state.mode === 'home' || (m.state.mode === 'work' && !m.w.moving && p.y > 0.12 && Math.abs(p.y - OPS_FL) < 0.05) ? 2.6 : 4.2;
      want.set(p.x - fx * near + fz * 0.9, p.y + 2.2, p.z - fz * near - fx * 0.9);
      camLook.set(p.x + fx * 2, p.y + 1.3, p.z + fz * 2);
    }
    if (!Number.isFinite(camPos.x) || camPos.distanceTo(want) > 80) camPos.copy(want); else camPos.lerp(want, k);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    return true;
  }
  function describe(t) {
    const m = following;
    if (!m) return '';
    const st = m.state;
    const mins = (ms) => `${Math.max(1, Math.round(ms / 60000))} min`;
    let line = m.doing;
    if (st.mode === 'toWork') line += ` &middot; arrives in ${mins(st.eta)}`;
    if (st.mode === 'toHome') line += ` &middot; ${mins(st.eta)} to go`;
    if (st.mode === 'work') line += `<br>${m.visitor ? 'Leaves' : 'Heads home'} ${localClock(new Date(st.shift.end))}`;
    return `<b>FOLLOWING</b><br><span style="color:${m.tag}">${m.name}</span><br>${m.title}<br>${line}` +
      (m.speed > 0 ? `<br>${Math.round(m.speed * 2.237)} mph` : '');
  }
  // one short line per cast member, for the HUD
  const brief = () => members.map((m) => `<span style="color:${m.tag}">${m.name.split(' ')[0]}</span> ${((d) => d.charAt(0).toLowerCase() + d.slice(1))(String(m.doing).split(' &middot;')[0])}`);

  return {
    group, members, update, extras, followNext, chase, describe, brief,
    get following() { return following; },
    unfollow() { following = null; },
  };
}

// A name tag over a figure that stays put (Lyra on her platform, Patch in the ops room).
export function tagFixed(parent, spot, text, color, height) {
  const s = nameTag(text, color);
  s.position.set(spot.x, (spot.y || 0) + height, spot.z);
  parent.add(s);
  return s;
}

import * as THREE from 'three';
import { STATION_SITES } from './stationSites.js';
import { Route, own, leg, sharedLine, saltIndexAtZ, toHalcyon, dayIndex, dayStart, CITY_NAMES } from './commute.js';
import { vehicleGeometry } from './props.js';
import { HOMES } from './homes.js';
import { HALCYON, IRONWOOD, CITY_GRID, IRON_GRID, TOWN_Z } from './heightfield.js';
import { part, mergeParts, canvasTex, nightEmissive, globalUniforms } from './util.js';
import { rng } from './noise.js';
import { localClock } from './sun.js';

// First responders for every town: a police station, a fire station and an EMS station each
// (sites in stationSites.js), with their cruisers, engines and ambulances. Police patrol their
// town around the clock (Saltbrush's also run the highway down to Vira's gate and back) with
// breaks at the station; fire and EMS answer calls to houses in their town, lights flashing on the
// way out, and come back after; ambulances take their patient to Halcyon's hospital first. Like
// everything else, it's a pure function of the world clock.
const MIN = 60000, HOUR = 3600000;
const ROAD_Y = { saltbrush: 0.3, halcyon: 0.08, ironwood: 0.08 };
const LANE = 2.5;
const NAMES = { police: 'Police', fire: 'Fire', ems: 'EMS' };
const BUILDING = {                       // width (along the street), depth, height
  police: { w: 34, d: 22, h: 8 },
  fire: { w: 30, d: 22, h: 9 },
  ems: { w: 26, d: 18, h: 7 },
};
// units per station
const FLEET = {
  saltbrush: { police: 3, fire: 1, ems: 1 },
  halcyon: { police: 6, fire: 2, ems: 3 },
  ironwood: { police: 3, fire: 1, ems: 2 },
};
const UNIT_KIND = { police: 'cruiser', fire: 'engine', ems: 'ambulance' };

// ---------- the street grid each town drives on ----------
const GRID = {
  halcyon: { x0: HALCYON.x, z0: HALCYON.z, g: CITY_GRID },
  ironwood: { x0: IRONWOOD.x, z0: IRONWOOD.z, g: IRON_GRID },
};
const snap = (v, o, g) => o + Math.round((v - o) / g) * g;

// From a station's street point to a house: along streets only (station street -> a cross street
// by the house -> the house's own street -> its driveway).
function pathToHouse(city, from, home) {
  const [dx, dz] = home.drive, zs = home.street;
  if (city === 'saltbrush') return [from, [0, from[1]], [0, zs], [dx, zs], [dx, dz]]; // Main Street is x = 0
  const G = GRID[city], xl = snap(dx, G.x0, G.g);
  return [from, [xl, from[1]], [xl, zs], [dx, zs], [dx, dz]];
}

// The hospital: a tower and an emergency wing with an ambulance canopy, doors facing +z.
function hospitalBuilding() {
  const g = new THREE.Group();
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  const glass = nightEmissive(new THREE.MeshStandardMaterial({ color: '#3a4a58', emissive: '#fff0d0', roughness: 0.15, metalness: 0.6 }), 0.7);
  // tower: eight floors with window bands
  add(new THREE.BoxGeometry(64, 30, 30), mat('#e9e6df'), -8, 15, -10);
  for (let f = 0; f < 8; f++) add(new THREE.BoxGeometry(64.1, 1.5, 30.1), glass, -8, 2.6 + f * 3.5, -10);
  add(new THREE.BoxGeometry(66, 1, 32), mat('#8a9096'), -8, 30.5, -10);
  // rooftop helipad
  add(new THREE.CylinderGeometry(9, 9, 0.3, 32), mat('#4a4f55'), -8, 31.15, -10);
  const H = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#4a4f55'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#f2f2f0'; c.lineWidth = 10; c.beginPath(); c.arc(w / 2, h / 2, w * 0.42, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#f2f2f0'; c.font = 'bold 150px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', w / 2, h / 2 + 8);
  });
  const pad = new THREE.Mesh(new THREE.CircleGeometry(8.6, 32), new THREE.MeshStandardMaterial({ map: H, roughness: 0.8 }));
  pad.rotation.x = -Math.PI / 2; pad.position.set(-8, 31.32, -10); g.add(pad);
  // emergency wing, low, to the east, with a canopy over the ambulance bay
  add(new THREE.BoxGeometry(30, 9, 26), mat('#ecebe6'), 38, 4.5, -8);
  add(new THREE.BoxGeometry(30.1, 0.9, 26.1), mat('#d1261f'), 38, 7.6, -8);
  add(new THREE.BoxGeometry(4, 2.8, 0.1), glass, 38, 1.4, 5.02);
  add(new THREE.BoxGeometry(18, 0.5, 12), mat('#c9ccd0'), 38, 4.6, 11);                         // canopy
  for (const x of [30, 46]) add(new THREE.CylinderGeometry(0.25, 0.25, 4.6, 10), mat('#9aa0a6'), x, 2.3, 16.5);
  // signs
  const sign = (text, bg, fg, w, x, y, z) => {
    const tex = canvasTex(1024, 160, (c, cw, ch) => {
      c.fillStyle = bg; c.fillRect(0, 0, cw, ch);
      c.fillStyle = fg; c.font = 'bold 96px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, cw / 2, ch / 2 + 4);
    });
    add(new THREE.PlaneGeometry(w, w * 0.156), nightEmissive(new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, roughness: 0.6 }), 0.6), x, y, z);
  };
  sign('HALCYON HOSPITAL', '#1f3c6b', '#ffffff', 30, -8, 27.5, 5.1);
  sign('EMERGENCY', '#d1261f', '#ffffff', 14, 38, 5.6, 17.1);
  return g;
}

// ---------- geometry ----------
const box = (w, h, d, x, y, z, c) => part(new THREE.BoxGeometry(w, h, d), c, x, y, z);
const cyl = (r, l, x, y, z, c) => { const g = new THREE.CylinderGeometry(r, r, l, 14); g.rotateZ(Math.PI / 2); return part(g, c, x, y, z); };
const wheels = (zs, w, r) => zs.flatMap((z) => [-1, 1].map((s) => cyl(r, 0.34, s * (w / 2 - 0.15), r, z, '#141414')));

function unitGeometry(kind, city) {
  if (kind === 'cruiser') {
    const v = vehicleGeometry('sedan');
    const paint = city === 'halcyon' ? '#1b2a44' : '#f4f4f2';
    const doors = city === 'halcyon' ? '#f4f4f2' : '#16181b';
    const body = mergeParts([part(v.body.clone(), paint), box(1.86, 0.32, 1.9, 0, 0.62, 0.1, doors), box(0.6, 0.05, 0.9, 0, 0.98, 1.5, doors)]);
    return {
      body, glass: v.glass, trim: v.trim, paint: '#ffffff',
      bar: mergeParts([box(1.25, 0.12, 0.3, 0, 1.49, -0.25, '#1a1a1a')]),
      red: mergeParts([box(0.5, 0.11, 0.26, -0.33, 1.6, -0.25, '#ff2a2a')]),
      blue: mergeParts([box(0.5, 0.11, 0.26, 0.33, 1.6, -0.25, '#2a5cff')]),
    };
  }
  if (kind === 'ambulance') {
    return {
      body: mergeParts([
        box(2.1, 1.0, 1.9, 0, 0.95, 2.35, '#f4f4f2'), box(2.0, 0.7, 1.2, 0, 1.75, 1.95, '#f4f4f2'),   // cab
        box(2.4, 2.4, 4.0, 0, 1.7, -0.8, '#f4f4f2'),                                                      // patient box
        box(2.42, 0.25, 4.02, 0, 1.25, -0.8, '#d1261f'), box(2.12, 0.18, 1.92, 0, 1.1, 2.35, '#d1261f'),  // stripe
        box(2.42, 0.5, 0.5, 0, 2.2, -0.8, '#1c4fa8'),                                                     // star-of-life panel
      ]),
      glass: mergeParts([box(1.9, 0.6, 0.06, 0, 1.75, 2.56, '#1b2329')]),
      trim: mergeParts([...wheels([2.1, -1.9], 2.2, 0.4), box(2.0, 0.3, 0.1, 0, 0.55, 3.32, '#202224')]),
      paint: '#ffffff',
      bar: mergeParts([box(1.6, 0.14, 0.3, 0, 2.97, 1.0, '#1a1a1a')]),
      red: mergeParts([box(0.5, 0.14, 0.28, -0.45, 3.1, 1.0, '#ff2a2a'), box(0.3, 0.3, 0.06, -0.9, 2.7, -2.82, '#ff2a2a')]),
      blue: mergeParts([box(0.5, 0.14, 0.28, 0.45, 3.1, 1.0, '#ff3d1f'), box(0.3, 0.3, 0.06, 0.9, 2.7, -2.82, '#ff3d1f')]),
    };
  }
  // fire engine
  const red = '#b3201c';
  return {
    body: mergeParts([
      box(2.5, 2.3, 2.6, 0, 1.75, 3.5, red), box(2.5, 1.1, 0.8, 0, 1.25, 5.0, red),                 // cab
      box(2.5, 2.2, 6.4, 0, 1.75, -1.4, red),                                                        // body
      box(2.52, 0.2, 9.2, 0, 1.0, 0.2, '#f2f2f0'),                                                   // white stripe
      ...[-1, 1].map((s) => box(0.06, 1.4, 5.6, s * 1.27, 1.8, -1.4, '#c9ccd0')),                    // compartment doors
    ]),
    glass: mergeParts([box(2.3, 0.9, 0.06, 0, 2.4, 4.82, '#1b2329')]),
    trim: mergeParts([
      ...wheels([3.6, -2.6, -3.8], 2.5, 0.52),
      ...[-0.6, 0.6].map((x) => box(0.12, 0.12, 8.0, x, 3.0, -0.6, '#b8bbbe')),                     // ladder rails
      ...Array.from({ length: 16 }, (_, k) => box(1.2, 0.08, 0.08, 0, 3.0, -4.4 + k * 0.5, '#b8bbbe')),
      box(2.4, 0.4, 0.3, 0, 0.7, 5.45, '#c9ccd0'),
    ]),
    paint: '#ffffff',
    bar: mergeParts([box(2.0, 0.16, 0.34, 0, 2.98, 4.2, '#1a1a1a')]),
    red: mergeParts([box(0.7, 0.16, 0.3, -0.55, 3.12, 4.2, '#ff2a2a'), box(0.3, 0.3, 0.06, -1.0, 2.5, -4.62, '#ff2a2a')]),
    blue: mergeParts([box(0.7, 0.16, 0.3, 0.55, 3.12, 4.2, '#ff2a2a'), box(0.3, 0.3, 0.06, 1.0, 2.5, -4.62, '#ff2a2a')]),
  };
}

function signTexture(text, bg, fg) {
  return canvasTex(1024, 160, (c, w, h) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.fillStyle = fg; c.font = 'bold 92px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, w / 2, h / 2 + 4);
  });
}

// A station building, in a frame where the doors face +z and the ground is y = 0.
function stationBuilding(kind, city) {
  const g = new THREE.Group();
  const { w, d, h } = BUILDING[kind];
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  const wall = { police: '#d9d2c3', fire: '#9b3a2a', ems: '#ecebe6' }[kind];
  add(new THREE.BoxGeometry(w, h, d), mat(wall), 0, h / 2, 0);
  add(new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6), mat('#5b5f63'), 0, h + 0.25, 0);            // parapet
  const glassM = nightEmissive(new THREE.MeshStandardMaterial({ color: '#2a3640', emissive: '#ffe2b0', roughness: 0.15, metalness: 0.6 }), 0.9);
  if (kind === 'police') {
    add(new THREE.BoxGeometry(w + 0.1, 1.0, d + 0.1), mat('#1f3c6b'), 0, h - 1.4, 0);              // blue band
    for (let k = -3; k <= 3; k++) if (k) add(new THREE.BoxGeometry(2.4, 1.6, 0.1), glassM, k * 4.4, 3.2, d / 2 + 0.02);
    add(new THREE.BoxGeometry(3.2, 2.8, 0.1), glassM, 0, 1.4, d / 2 + 0.02);                         // doors
    add(new THREE.BoxGeometry(4.4, 0.25, 2.2), mat('#5b5f63'), 0, 3.1, d / 2 + 1.1);                // canopy
    for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.22, 12, 8), nightEmissive(mat('#1a2a66', { emissive: '#3a6cff' }), 3), s * 2.3, 2.6, d / 2 + 0.3);
    add(new THREE.CylinderGeometry(0.08, 0.1, 11, 8), mat('#c9ccd0', { metalness: 0.7 }), w / 2 + 3, 5.5, d / 2 + 4); // flagpole
    add(new THREE.PlaneGeometry(2.2, 1.3), mat('#b22234', { side: THREE.DoubleSide }), w / 2 + 4.2, 10.2, d / 2 + 4);
  } else {
    const bays = kind === 'fire' ? 3 : 2, bw = kind === 'fire' ? 4.6 : 4.0, bh = kind === 'fire' ? 5.2 : 4.0;
    const door = mat(kind === 'fire' ? '#f2f2f0' : '#c9ccd0', { metalness: 0.3, roughness: 0.5 });
    const x0 = -w / 2 + 3 + bw / 2;
    for (let k = 0; k < bays; k++) {
      add(new THREE.BoxGeometry(bw, bh, 0.12), door, x0 + k * (bw + 1.6), bh / 2, d / 2 + 0.03);
      for (let row = 1; row <= 3; row++) add(new THREE.BoxGeometry(bw - 0.3, 0.06, 0.04), mat('#9aa0a6'), x0 + k * (bw + 1.6), row * bh / 4, d / 2 + 0.11);
    }
    add(new THREE.BoxGeometry(2.0, 2.4, 0.1), glassM, w / 2 - 2.5, 1.2, d / 2 + 0.02);              // office door
    if (kind === 'fire') add(new THREE.BoxGeometry(5, 16, 5), mat('#8a3324'), -w / 2 - 2.5, 8, -d / 2 + 4); // hose tower
    else add(new THREE.BoxGeometry(w + 0.1, 0.8, d + 0.1), mat('#d1261f'), 0, h - 1.6, 0);          // red band
  }
  // sign over the doors
  const label = `${city === 'halcyon' ? 'HALCYON' : CITY_NAMES[city].toUpperCase()} ${kind === 'police' ? 'POLICE' : kind === 'fire' ? 'FIRE DEPT' : 'EMS'}`;
  const [bg, fg] = { police: ['#1f3c6b', '#ffffff'], fire: ['#f2f2f0', '#9b1d16'], ems: ['#ffffff', '#c11f1a'] }[kind];
  const tex = signTexture(label, bg, fg);
  const sm = nightEmissive(new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, roughness: 0.6 }), 0.5);
  add(new THREE.PlaneGeometry(Math.min(w - 4, 20), 3.1), sm, 0, h - (kind === 'police' ? 3.3 : 1.6), d / 2 + 0.06);
  return g;
}

// ---------- the stations and their units ----------
export function buildStations() {
  const group = new THREE.Group();
  const units = [];
  const stations = [];

  // Halcyon's hospital, and the ambulance bay under its canopy
  const hs = STATION_SITES.find((s) => s.kind === 'hospital');
  const hospital = (() => {
    const yaw = Math.atan2(hs.face[0], hs.face[1]), y = ROAD_Y.halcyon;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(hs.w, 0.12, hs.d), new THREE.MeshStandardMaterial({ color: '#b9b6ae', roughness: 0.9 }));
    pad.position.set(hs.x, y - 0.03, hs.z); pad.rotation.y = yaw; pad.receiveShadow = true;
    group.add(pad);
    const b = hospitalBuilding();
    b.position.set(hs.x - 10, y + 0.03, hs.z - 6); b.rotation.y = yaw;
    group.add(b);
    return { street: hs.street, bay: [hs.x - 10 + 38, hs.z - 6 + 13], y };
  })();

  for (const s of STATION_SITES) {
    if (s.kind === 'hospital') continue;
    const [fx, fz] = s.face, y = ROAD_Y[s.city];
    const yaw = Math.atan2(fx, fz);                         // building frame: doors face +z
    const along = s.face[0] ? s.d : s.w, depth = s.face[0] ? s.w : s.d;
    const B = BUILDING[s.kind];
    const back = depth / 2 - B.d / 2 - 3;                  // building at the back of its lot
    const bx = s.x - fx * back, bz = s.z - fz * back;
    // concrete pad over the lot
    const pad = new THREE.Mesh(new THREE.BoxGeometry(along, 0.12, depth), new THREE.MeshStandardMaterial({ color: '#b9b6ae', roughness: 0.9 }));
    pad.position.set(s.x, y - 0.03, s.z); pad.rotation.y = yaw; pad.receiveShadow = true;
    group.add(pad);
    const bld = stationBuilding(s.kind, s.city);
    bld.position.set(bx, y + 0.03, bz); bld.rotation.y = yaw;
    group.add(bld);
    // parking: a row in front of the doors, side by side along the street
    const n = FLEET[s.city][s.kind];
    const front = B.d / 2 + (s.kind === 'police' ? 9 : 6);
    const sx = fz, sz = -fx;                               // along the street (to the doors' right)
    const spacing = s.kind === 'police' ? 3.4 : 6.2;
    const st = { ...s, y, name: `${CITY_NAMES[s.city]} ${NAMES[s.kind]}`, units: [] };
    stations.push(st);
    for (let k = 0; k < n; k++) {
      const off = (k - (n - 1) / 2) * spacing;
      const px = bx + fx * front + sx * off, pz = bz + fz * front + sz * off;
      const u = {
        id: units.length, kind: UNIT_KIND[s.kind], station: st, k, city: s.city,
        park: { x: px, y, z: pz, h: yaw }, parkPt: [px, pz],
        pos: new THREE.Vector3(px, y, pz), heading: yaw, speed: 0, lights: false, doing: '',
        label: `${st.name} ${s.kind === 'police' ? 'Unit' : s.kind === 'fire' ? 'Engine' : 'Medic'} ${k + 1}`,
      };
      st.units.push(u);
      units.push(u);
    }
  }

  // ---------- programs: what a unit is doing at time t ----------
  // A program is a list of steps, each a drive along a route or a wait; a cycle repeats it.
  const routeOf = (pts, speed, y) => new Route([own(pts, speed, LANE, y)]);
  const atPark = (u, what) => ({ wait: true, x: u.park.x, y: u.park.y, z: u.park.z, h: u.park.h, what });

  // police: a loop of the town from the station and back, then a break at the station
  for (const st of stations) {
    if (st.kind !== 'police') continue;
    st.units.forEach((u, k) => {
      const y = st.y, out = st.street;
      let steps;
      if (st.city === 'saltbrush') {
        const T = TOWN_Z;
        if (k === 0) {
          // Main Street and the east side of town
          const loop = [u.parkPt, out, [0, T + 440], [160, T + 440], [160, T - 440], [0, T - 440], out, u.parkPt];
          steps = [{ route: routeOf(loop, 12, y), what: 'On patrol in Saltbrush' }, { ms: 25 * MIN, ...atPark(u, 'At the station') }];
        } else if (k === 1) {
          // the highway down to Vira's gate and back
          const salt = sharedLine('saltbrush'), i0 = saltIndexAtZ(out[1]), i1 = salt.pts.length - 1;
          const down = new Route([own([u.parkPt, out], 6, 0, y), leg(salt, i0, i1, 25, 1.8, 0.27)]);
          const up = new Route([leg(salt, i1, i0, 25, 1.8, 0.27), own([out, u.parkPt], 6, 0, y)]);
          const end = down.at(down.duration, {});
          steps = [{ route: down, what: 'Highway patrol to Vira' },
            { ms: 15 * MIN, wait: true, x: end.x, y: end.y, z: end.z, h: Math.atan2(end.hx, end.hz) + Math.PI, what: "Parked by Vira's gate" },
            { route: up, what: 'Highway patrol back to Saltbrush' }, { ms: 40 * MIN, ...atPark(u, 'At the station') }];
        } else steps = [{ ms: HOUR, ...atPark(u, 'At the station (reserve)') }];
      } else {
        // a rectangle of streets from the station's street, different for each unit
        const G = GRID[st.city], g = G.g, r = rng(st.city.length * 977 + k * 131);
        const xs = snap(out[0], G.x0, g);
        const wide = (3 + Math.floor(r() * 5)) * g, deep = (2 + Math.floor(r() * 5)) * g * (k % 2 ? 1 : -1);
        const x1 = xs + (k % 3 === 0 ? wide : -wide);
        const z1 = out[1] + deep;
        const loop = [u.parkPt, out, [x1, out[1]], [x1, z1], [xs, z1], [xs, out[1]], out, u.parkPt];
        steps = [{ route: routeOf(loop, 12, y), what: `On patrol in ${CITY_NAMES[st.city]}` }, { ms: (15 + r() * 20) * MIN, ...atPark(u, 'At the station') }];
      }
      u.program = { steps, offset: k * 23 * MIN + st.city.length * 7 * MIN };
      let total = 0; for (const s of steps) total += s.route ? s.route.duration : s.ms;
      u.program.cycle = total;
    });
  }

  // fire & EMS: calls to houses in their town on each day
  const callsFor = (u, d) => {
    if (!u.calls) u.calls = new Map();
    if (u.calls.has(d)) return u.calls.get(d);
    const r = rng(u.id * 7919 + d * 31 + 5);
    const homes = HOMES[u.city];
    const n = u.kind === 'engine' ? 1 + Math.floor(r() * 3) : 2 + Math.floor(r() * 4);
    const times = Array.from({ length: n }, () => dayStart(d) + r() * 24 * HOUR).sort((a, b) => a - b);
    const list = [];
    let free = -Infinity;
    for (const t0 of times) {
      const home = homes[Math.floor(r() * homes.length)];
      const what = u.kind === 'engine' ? ['Structure fire', 'Smoke alarm', 'Brush fire', 'Gas leak', 'Car fire'][Math.floor(r() * 5)]
        : ['Medical call', 'Fall', 'Chest pain', 'Breathing trouble', 'Allergic reaction'][Math.floor(r() * 5)];
      const pts = pathToHouse(u.city, u.station.street, home);
      const out = routeOf([u.parkPt, ...pts], 16, u.station.y);
      const scene = out.at(out.duration, {});
      const dwell = (u.kind === 'engine' ? 30 + r() * 40 : 15 + r() * 15) * MIN;
      let transport = null, er = 0, back;
      if (u.kind === 'ambulance') {
        // the patient goes to Halcyon's hospital, then the ambulance goes home
        transport = toHospital(u.city, home, 16);
        er = (15 + r() * 15) * MIN;
        back = fromHospital(u);
      } else back = routeOf([...pts].reverse().concat([u.parkPt]), 10, u.station.y);
      const end = t0 + out.duration + dwell + (transport ? transport.duration + er : 0) + back.duration;
      if (t0 < free + 10 * MIN) continue;               // still out on the last one
      free = end;
      list.push({ t0, end, out, back, dwell, scene, what, transport, er, bay: transport && transport.at(transport.duration, {}) });
    }
    if (u.calls.size > 6) u.calls.clear();
    u.calls.set(d, list);
    return list;
  };

  // ambulance runs to the hospital: Halcyon's on its own streets, the other towns' by highway
  function toHospital(city, home, speed) {
    const [dx, dz] = home.drive, zs = home.street;
    if (city === 'halcyon') {
      const G = GRID.halcyon, xl = snap(dx, G.x0, G.g), hz = hospital.street[1];
      return new Route([own([[dx, dz], [dx, zs], [xl, zs], [xl, hz], hospital.street, hospital.bay], speed, LANE, hospital.y)]);
    }
    const town = own([[dx, dz], [dx, zs]], 6, 0, ROAD_Y[city]);
    const end = own([hospital.street, hospital.bay], 6, 0, hospital.y);
    return new Route([town, ...toHalcyon(city, [dx, zs], hospital.street).legs, end]);
  }
  // and back from the hospital to the ambulance's own station
  const backRoutes = new Map();
  function fromHospital(u) {
    if (backRoutes.has(u.id)) return backRoutes.get(u.id);
    const st = u.station;
    let route;
    if (u.city === 'halcyon') {
      const G = GRID.halcyon, xl = snap(hospital.street[0], G.x0, G.g);
      route = new Route([own([hospital.bay, hospital.street, [xl, hospital.street[1]], [xl, st.street[1]], st.street, u.parkPt], 11, LANE, hospital.y)]);
    } else {
      // the run from the station to the hospital, driven backwards
      route = toHospital(u.city, { drive: u.parkPt, street: st.street[1] }, 16).reversed();
    }
    backRoutes.set(u.id, route);
    return route;
  }

  // ---------- per frame ----------
  const tmp = {};
  function poseOf(u, t) {
    if (u.program) {
      const p = u.program;
      let tau = ((t + p.offset) % p.cycle + p.cycle) % p.cycle;
      for (const s of p.steps) {
        const dur = s.route ? s.route.duration : s.ms;
        if (tau < dur) {
          if (s.route) { const q = s.route.at(tau, tmp); return { x: q.x, y: q.y, z: q.z, h: Math.atan2(q.hx, q.hz), speed: q.speed, lights: false, what: s.what, moving: q.speed > 0 }; }
          return { x: s.x, y: s.y, z: s.z, h: s.h, speed: 0, lights: false, what: s.what };
        }
        tau -= dur;
      }
    }
    if (u.kind !== 'cruiser') {
      const d = dayIndex(t);
      for (const day of [d - 1, d]) for (const c of callsFor(u, day)) {
        if (t < c.t0 || t >= c.end) continue;
        const a = t - c.t0;
        if (a < c.out.duration) { const q = c.out.at(a, tmp); return { x: q.x, y: q.y, z: q.z, h: Math.atan2(q.hx, q.hz), speed: q.speed, lights: true, what: `Responding: ${c.what.toLowerCase()}`, moving: true, call: c, eta: c.out.duration - a }; }
        if (a < c.out.duration + c.dwell) return { x: c.scene.x, y: c.scene.y, z: c.scene.z, h: Math.atan2(c.scene.hx, c.scene.hz), speed: 0, lights: true, what: `On scene: ${c.what.toLowerCase()}`, call: c };
        let b = a - c.out.duration - c.dwell;
        if (c.transport) {
          if (b < c.transport.duration) { const q = c.transport.at(b, tmp); return { x: q.x, y: q.y, z: q.z, h: Math.atan2(q.hx, q.hz), speed: q.speed, lights: true, what: 'Taking the patient to Halcyon Hospital', moving: true, call: c, eta: c.transport.duration - b }; }
          b -= c.transport.duration;
          if (b < c.er) return { x: c.bay.x, y: c.bay.y, z: c.bay.z, h: Math.atan2(c.bay.hx, c.bay.hz), speed: 0, lights: false, what: 'At Halcyon Hospital, handing over the patient', call: c };
          b -= c.er;
        }
        const q = c.back.at(b, tmp);
        return { x: q.x, y: q.y, z: q.z, h: Math.atan2(q.hx, q.hz), speed: q.speed, lights: false, what: 'Returning to the station', moving: true, call: c };
      }
    }
    return { x: u.park.x, y: u.park.y, z: u.park.z, h: u.park.h, speed: 0, lights: false, what: 'At the station' };
  }

  // instanced fleets, one set of meshes per vehicle kind (per city for cruiser paint)
  const fleets = new Map();
  for (const u of units) {
    const key = u.kind + (u.kind === 'cruiser' ? u.city : '');
    if (!fleets.has(key)) fleets.set(key, { geo: unitGeometry(u.kind, u.city), list: [] });
    fleets.get(key).list.push(u);
  }
  const lampMat = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (const f of fleets.values()) {
    const n = f.list.length;
    const mk = (geo, mat, cast = true) => {
      const im = new THREE.InstancedMesh(geo, mat, n);
      im.frustumCulled = false; im.castShadow = cast; im.receiveShadow = true;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      group.add(im);
      return im;
    };
    const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.4, color: f.geo.paint });
    f.meshes = [
      mk(f.geo.body, paint), mk(f.geo.glass, new THREE.MeshStandardMaterial({ color: '#1b2329', roughness: 0.06, metalness: 0.9 })),
      mk(f.geo.trim, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 })), mk(f.geo.bar, new THREE.MeshStandardMaterial({ color: '#1a1a1a' })),
    ];
    f.red = mk(f.geo.red, lampMat('#ff2a2a'), false);
    f.blue = mk(f.geo.blue, lampMat(f.list[0].kind === 'cruiser' ? '#2a5cff' : '#ff2a2a'), false);
    f.redOff = mk(f.geo.red, new THREE.MeshStandardMaterial({ color: '#5a1010' }), false);
    f.blueOff = mk(f.geo.blue, new THREE.MeshStandardMaterial({ color: f.list[0].kind === 'cruiser' ? '#10205a' : '#5a1010' }), false);
  }

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  const counts = { patrol: 0, calls: 0 };
  let flashT = 0;
  function update(t, dt, realDt = dt) {
    flashT += Math.min(realDt, 0.1);
    const phase = Math.floor(flashT * 6) % 2;
    counts.patrol = counts.calls = 0;
    for (const f of fleets.values()) {
      f.list.forEach((u, i) => {
        const p = poseOf(u, t);
        u.state = p; u.doing = p.what; u.lights = p.lights; u.speed = p.speed || 0;
        if (p.what.startsWith('On patrol') || p.what.startsWith('Highway')) counts.patrol++;
        if (p.call) counts.calls++;
        if (p.moving && dt < 0.5) {
          const dh = Math.atan2(Math.sin(p.h - u.heading), Math.cos(p.h - u.heading));
          u.heading += dh * (1 - Math.exp(-dt * 5));
        } else u.heading = p.h;
        u.pos.set(p.x, p.y, p.z);
        m4.compose(u.pos, q.setFromAxisAngle(up, u.heading), one);
        for (const m of f.meshes) m.setMatrixAt(i, m4);
        const on = u.lights;
        f.red.setMatrixAt(i, on && phase === 0 ? m4 : zero);
        f.blue.setMatrixAt(i, on && phase === 1 ? m4 : zero);
        f.redOff.setMatrixAt(i, on && phase === 0 ? zero : m4);
        f.blueOff.setMatrixAt(i, on && phase === 1 ? zero : m4);
      });
      for (const m of [...f.meshes, f.red, f.blue, f.redOff, f.blueOff]) m.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------- follow camera (X): units with lights on first, then anyone moving ----------
  let following = null;
  function followNext() {
    const busy = units.filter((u) => u.lights);
    const moving = units.filter((u) => u.speed > 0 || (u.state && u.state.moving));
    const pool = busy.length ? [...busy, ...moving.filter((u) => !u.lights)] : moving.length ? moving : units;
    following = pool[(pool.indexOf(following) + 1) % pool.length];
    camPos.set(Infinity, 0, 0);
    return following;
  }
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), want = new THREE.Vector3();
  function chase(camera, dt) {
    const u = following;
    if (!u) return false;
    const fx = Math.sin(u.heading), fz = Math.cos(u.heading), big = u.kind !== 'cruiser';
    want.set(u.pos.x - fx * (big ? 15 : 10), u.pos.y + (big ? 5.5 : 4), u.pos.z - fz * (big ? 15 : 10));
    const k = dt > 0.5 ? 1 : 1 - Math.exp(-dt * 4);
    if (!Number.isFinite(camPos.x) || camPos.distanceTo(want) > 300) camPos.copy(want); else camPos.lerp(want, k);
    camLook.set(u.pos.x + fx * 6, u.pos.y + 1.5, u.pos.z + fz * 6);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    return true;
  }
  function describe() {
    const u = following;
    if (!u) return '';
    const p = u.state || {};
    const extra = p.eta ? ` &middot; on scene in ${Math.max(1, Math.round(p.eta / 60000))} min` : '';
    return `<b>FOLLOWING</b><br>${u.label}<br>${u.doing}${extra}` + (u.speed > 0 ? `<br>${Math.round(u.speed * 2.237)} mph` : '') + (u.lights ? '<br><span style="color:#ff5a4a">● lights and siren</span>' : '');
  }

  return {
    group, units, stations, counts, update, followNext, chase, describe,
    get following() { return following; },
    unfollow() { following = null; },
  };
}

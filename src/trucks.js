import * as THREE from 'three';
import { buildTruckGeo } from './props.js';
import { trailerSide } from './dctextures.js';
import { blob } from './textures.js';
import { mergeParts, part, globalUniforms } from './util.js';
import { truckRoutes, dayIndex, dayStart, dayOfWeek, CITY_NAMES } from './commute.js';
import { TRUCK_BAYS } from './homes.js';
import { HALCYON, IRONWOOD, FREEWAY_Z } from './heightfield.js';
import { hallCenter, hallName } from './hallInterior.js';
import { rng } from './noise.js';
import { localClock } from './sun.js';

// Semis delivering to Vira. Each delivery bay has its slots: the dock bays take three loads on
// weekdays while receiving is open, the side bays two a day, every day. A run starts in Ironwood or
// Halcyon, takes the highway down to Lyra's gate, backs up to the hall (or pulls into its side bay),
// sits while it's unloaded and drives home. Like the staff's cars, it's all a pure function of the
// world clock; a truck is only drawn while it's on its way to Vira, at the bay, or on its way back.
const HOUR = 3600000, MIN = 60000;
const GATE = new THREE.Vector3(31, 0, -650);
const ORIGINS = {
  ironwood: [IRONWOOD.x, IRONWOOD.z],          // out of the rail yard town's main street
  halcyon: [HALCYON.x, FREEWAY_Z],             // from the city, up onto the freeway
};
const DOCK_SLOTS = [7, 9.5, 12.5], SIDE_SLOTS = [5.5, 14];
const CAB = ['#f2f2f0', '#b3201c', '#1f3c6b', '#2b2d31', '#f2f2f0', '#c9ccd0', '#3d5a3a', '#d8cfb8'];

export function buildDeliveries() {
  const group = new THREE.Group();
  const routes = new Map();
  const routeFor = (city, b) => {
    const key = city + b;
    if (!routes.has(key)) routes.set(key, truckRoutes(city, ORIGINS[city], TRUCK_BAYS[b]));
    return routes.get(key);
  };
  // the hall each bay serves, for the follow panel
  const hallOf = (bay) => {
    let best = 0, bd = Infinity;
    for (let h = 0; h < 16; h++) { const c = hallCenter(h); const d = Math.hypot(c.x - bay.x, c.z - bay.z); if (d < bd) { bd = d; best = h; } }
    return hallName(best);
  };

  // one truck per (bay, slot): the same slot on the next day is a day later, so it never overlaps
  const trucks = [];
  TRUCK_BAYS.forEach((bay, b) => {
    (bay.dock ? DOCK_SLOTS : SIDE_SLOTS).forEach((h, k) => {
      trucks.push({ bay: b, slot: k, hour: h, hall: hallOf(bay), color: CAB[(b * 3 + k * 5) % CAB.length], pos: new THREE.Vector3(), heading: 0, speed: 0, state: null });
    });
  });

  // a delivery on day d, or null: when it gets to the bay, how long it sits, and where it's from
  function delivery(tr, d) {
    const bay = TRUCK_BAYS[tr.bay];
    if (bay.dock && dayOfWeek(d) % 6 === 0) return null;          // receiving is closed weekends
    const r = rng(tr.bay * 7919 + tr.slot * 104729 + d * 31);
    const city = r() < 0.55 ? 'ironwood' : 'halcyon';
    const arrive = dayStart(d) + (tr.hour + r() * (bay.dock ? 1.2 : 1.5)) * HOUR;
    const dwell = (bay.dock ? 45 + r() * 30 : 60 + r() * 60) * MIN;
    return { city, arrive, depart: arrive + dwell, ...routeFor(city, tr.bay) };
  }
  function stateAt(tr, t) {
    const d = dayIndex(t);
    for (const day of [d - 1, d, d + 1]) {
      const dl = delivery(tr, day);
      if (!dl) continue;
      const start = dl.arrive - dl.inbound.duration, end = dl.depart + dl.outbound.duration;
      if (t < start || t >= end) continue;
      if (t < dl.arrive) return { mode: 'in', tau: t - start, dl, eta: dl.arrive - t };
      if (t < dl.depart) return { mode: 'bay', dl };
      return { mode: 'out', tau: t - dl.depart, dl, eta: end - t };
    }
    return null;
  }
  function nextDelivery(tr, t) {
    const d = dayIndex(t);
    for (let day = d; day < d + 4; day++) { const dl = delivery(tr, day); if (dl && dl.arrive - dl.inbound.duration > t) return dl; }
    return null;
  }

  // ---------- instanced semis ----------
  const T = buildTruckGeo();
  const ts = trailerSide();
  const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.5 });
  const trim = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.4 });
  const side = new THREE.MeshStandardMaterial({ map: ts.map, normalMap: ts.normal, roughness: 0.5, metalness: 0.3 });
  const plain = new THREE.MeshStandardMaterial({ color: '#e9e9e6', roughness: 0.5, metalness: 0.3 });
  const lamps = mergeParts([-0.85, 0.85].flatMap((x) => [
    part(new THREE.BoxGeometry(0.4, 0.2, 0.05), '#fff6e0', x, 1.25, 10.58),
    part(new THREE.BoxGeometry(0.3, 0.2, 0.05), '#ff2010', x * 1.25, 1.1, -9.48),
  ]));
  const shadowGeo = new THREE.PlaneGeometry(3.4, 22); shadowGeo.rotateX(-Math.PI / 2);
  const n = trucks.length;
  const mk = (geo, mat, cast) => {
    const im = new THREE.InstancedMesh(geo, mat, n);
    im.frustumCulled = false; im.castShadow = cast; im.receiveShadow = true;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(im);
    return im;
  };
  const cab = mk(T.semiCab, paint, true), chassis = mk(T.semiTrim, trim, true), trailer = mk(T.trailer, [side, side, plain, plain, plain, plain], true);
  const lamp = mk(lamps, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), false);
  const shadow = mk(shadowGeo, new THREE.MeshBasicMaterial({ map: blob(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), false);
  shadow.renderOrder = 2;
  trucks.forEach((tr, i) => cab.setColorAt(i, new THREE.Color(tr.color)));
  const all = [cab, chassis, trailer, lamp, shadow];

  const pose = {}, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const counts = { road: 0, bay: 0 };

  function update(t, dt) {
    const night = globalUniforms.night.value > 0.25;
    let nearGate = false;
    counts.road = counts.bay = 0;
    trucks.forEach((tr, i) => {
      const st = stateAt(tr, t);
      tr.state = st;
      if (!st) { for (const m of all) m.setMatrixAt(i, zero); tr.speed = 0; return; }
      let p;
      if (st.mode === 'in') p = st.dl.inbound.at(st.tau, pose);
      else if (st.mode === 'out') p = st.dl.outbound.at(st.tau, pose);
      else { const b = TRUCK_BAYS[tr.bay]; p = { x: b.x, y: 0.12, z: b.z, hx: Math.sin(b.ry), hz: Math.cos(b.ry), speed: 0 }; }
      const moving = st.mode !== 'bay' && p.speed > 0;
      counts[st.mode === 'bay' ? 'bay' : 'road']++;
      const target = Math.atan2(p.hx, p.hz);
      if (moving && dt < 0.5) {
        const dh = Math.atan2(Math.sin(target - tr.heading), Math.cos(target - tr.heading));
        tr.heading += dh * (1 - Math.exp(-dt * 3));
      } else tr.heading = target;
      tr.pos.set(p.x, p.y, p.z);
      tr.speed = moving ? p.speed : 0;
      if (moving && tr.pos.distanceToSquared(GATE) < 70 * 70) nearGate = true;
      m4.compose(tr.pos, q.setFromAxisAngle(up, tr.heading), one);
      cab.setMatrixAt(i, m4); chassis.setMatrixAt(i, m4); trailer.setMatrixAt(i, m4); shadow.setMatrixAt(i, m4);
      lamp.setMatrixAt(i, night && st.mode !== 'bay' ? m4 : zero);
    });
    for (const m of all) m.instanceMatrix.needsUpdate = true;
    return nearGate;
  }

  // ---------- follow camera (Y) ----------
  let following = null;
  function followNext() {
    const active = trucks.filter((tr) => tr.state);
    const pool = active.filter((tr) => tr.state.mode !== 'bay').length ? active.filter((tr) => tr.state.mode !== 'bay') : active;
    if (!pool.length) return null;
    following = pool[(pool.indexOf(following) + 1) % pool.length];
    return following;
  }
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), want = new THREE.Vector3();
  function chase(camera, dt) {
    const tr = following;
    if (!tr || !tr.state) return false;
    const fx = Math.sin(tr.heading), fz = Math.cos(tr.heading);
    want.set(tr.pos.x - fx * 26, tr.pos.y + 7.5, tr.pos.z - fz * 26);
    const k = dt > 0.5 ? 1 : 1 - Math.exp(-dt * 4);
    if (camPos.distanceTo(want) > 400) camPos.copy(want); else camPos.lerp(want, k);
    camLook.set(tr.pos.x + fx * 10, tr.pos.y + 2.5, tr.pos.z + fz * 10);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    return true;
  }
  function describe(t) {
    const tr = following;
    if (!tr) return '';
    const st = tr.state;
    const mins = (ms) => `${Math.max(1, Math.round(ms / 60000))} min`;
    const bay = TRUCK_BAYS[tr.bay], where = `${bay.dock ? 'the loading dock at' : 'the side bay by'} ${tr.hall}`;
    let line;
    if (!st) { const n = nextDelivery(tr, t); line = n ? `Next run leaves ${CITY_NAMES[n.city]} ${localClock(new Date(n.arrive - n.inbound.duration))}` : 'No runs scheduled'; }
    else if (st.mode === 'in') line = `Delivering to ${where}<br>From ${CITY_NAMES[st.dl.city]} &middot; arrives in ${mins(st.eta)}`;
    else if (st.mode === 'bay') line = `Unloading at ${where}<br>Leaves ${localClock(new Date(st.dl.depart))}`;
    else line = `Heading back to ${CITY_NAMES[st.dl.city]} &middot; ${mins(st.eta)} to go`;
    return `<b>FOLLOWING</b><br>Semi &middot; Vira delivery<br>${line}${tr.speed > 0 ? `<br>${Math.round(tr.speed * 2.237)} mph` : ''}`;
  }

  return {
    group, trucks, counts, update, followNext, chase, describe,
    get following() { return following; },
    unfollow() { following = null; },
  };
}

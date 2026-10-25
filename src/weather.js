import * as THREE from 'three';
import { getHeight } from './terrain.js';
import { dayIndex, dayStart } from './commute.js';
import { rng } from './noise.js';
import { localClock } from './sun.js';

// Weather over the whole map, on the world clock: most days are clear (with dust devils on hot
// afternoons), and some bring cloud, a long rain, an afternoon thunderstorm or a dust storm. Z picks
// the weather by hand. update() returns how much of each is in the air right now (0..1):
// { overcast, rain, storm, dust, devils, flash, wind: [x, z] }; main.js darkens the sky and light from
// it, and this module draws the rain, lightning, blowing dust and dust devils around the camera.
const HOUR = 3600000, MIN = 60000;
export const WEATHER_NAMES = { clear: 'Clear', cloudy: 'Cloudy', rain: 'Rain', storm: 'Thunderstorm', dust: 'Dust storm' };
const MODES = ['auto', 'clear', 'cloudy', 'rain', 'storm', 'dust'];
// how much of each ingredient a kind of weather has at full strength
const MIX = {
  clear: { overcast: 0, rain: 0, storm: 0, dust: 0 },
  cloudy: { overcast: 0.65, rain: 0, storm: 0, dust: 0 },
  rain: { overcast: 0.85, rain: 0.7, storm: 0, dust: 0 },
  storm: { overcast: 1, rain: 1, storm: 1, dust: 0 },
  dust: { overcast: 0.2, rain: 0, storm: 0, dust: 1 },
};

// the day's weather event (one at most), or null for a clear day
function eventOn(d) {
  const r = rng(d * 7717 + 13);
  const u = r();
  let kind = null, start = 0, len = 0;
  if (u < 0.4) return null;
  if (u < 0.55) { kind = 'cloudy'; start = 7 + r() * 4; len = 6 + r() * 6; }
  else if (u < 0.7) { kind = 'rain'; start = r() * 18; len = 3 + r() * 5; }
  else if (u < 0.85) { kind = 'storm'; start = 13 + r() * 5; len = 2 + r() * 2.5; }
  else { kind = 'dust'; start = 10 + r() * 6; len = 2 + r() * 3; }
  const t0 = dayStart(d) + start * HOUR;
  return { kind, t0, t1: t0 + len * HOUR };
}

export function buildWeather(camera) {
  const group = new THREE.Group();
  let mode = 0;                                  // index into MODES
  const cur = { overcast: 0, rain: 0, storm: 0, dust: 0 };
  let label = 'Clear', until = null;

  // ---------- rain: streaks in a box that follows the camera (wrapped in world space) ----------
  const RAIN_N = 14000, BOX = 150, BOX_H = 70;
  const rainGeo = new THREE.BufferGeometry();
  const seeds = new Float32Array(RAIN_N * 2 * 4);
  const r = rng(99);
  for (let i = 0; i < RAIN_N; i++) {
    const sx = r() * BOX, sy = r() * BOX_H, sz = r() * BOX, len = 0.5 + r() * 0.6;
    seeds.set([sx, sy, sz, 0, sx, sy, sz, len], i * 8);
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RAIN_N * 2 * 3), 3));
  rainGeo.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  rainGeo.setDrawRange(0, 0);
  const rainMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, camPos: { value: new THREE.Vector3() }, wind: { value: new THREE.Vector2() }, alpha: { value: 0.5 }, color: { value: new THREE.Color('#aab6c4') } },
    vertexShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute vec4 seed;
      uniform float time; uniform vec3 camPos; uniform vec2 wind;
      varying float vA;
      void main() {
        vec3 s = seed.xyz;
        float len = seed.w;
        float fall = 11.0;
        vec3 p;
        p.x = camPos.x + mod(s.x - camPos.x - wind.x * time, ${BOX.toFixed(1)}) - ${(BOX / 2).toFixed(1)};
        p.z = camPos.z + mod(s.z - camPos.z - wind.y * time, ${BOX.toFixed(1)}) - ${(BOX / 2).toFixed(1)};
        p.y = camPos.y + ${(BOX_H / 2).toFixed(1)} - mod(s.y + time * fall, ${BOX_H.toFixed(1)});
        vec3 v = normalize(vec3(wind.x, -fall, wind.y));
        p -= v * len * 1.4;
        vA = 1.0 - smoothstep(30.0, 75.0, length(p - camPos));
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <logdepthbuf_pars_fragment>
      uniform float alpha; uniform vec3 color;
      varying float vA;
      void main() {
        #include <logdepthbuf_fragment>
        gl_FragColor = vec4(color, alpha * vA);
      }`,
    transparent: true, depthWrite: false,
  });
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.frustumCulled = false;
  rain.renderOrder = 4;
  group.add(rain);

  // ---------- blowing dust: soft specks racing along the ground ----------
  const DUST_N = 9000, DBOX = 220, DBOX_H = 40;
  const dustGeo = new THREE.BufferGeometry();
  const dseeds = new Float32Array(DUST_N * 4);
  for (let i = 0; i < DUST_N; i++) dseeds.set([r() * DBOX, r() * DBOX_H, r() * DBOX, r()], i * 4);
  dustGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DUST_N * 3), 3));
  dustGeo.setAttribute('seed', new THREE.BufferAttribute(dseeds, 4));
  const dustMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, camPos: { value: new THREE.Vector3() }, wind: { value: new THREE.Vector2() }, alpha: { value: 0 }, color: { value: new THREE.Color('#b8925f') }, groundY: { value: 0 } },
    vertexShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute vec4 seed;
      uniform float time; uniform vec3 camPos; uniform vec2 wind; uniform float groundY;
      varying float vA;
      void main() {
        vec3 p;
        float k = 0.6 + seed.w * 0.8;
        p.x = camPos.x + mod(seed.x - camPos.x - wind.x * time * k * 2.2, ${DBOX.toFixed(1)}) - ${(DBOX / 2).toFixed(1)};
        p.z = camPos.z + mod(seed.z - camPos.z - wind.y * time * k * 2.2, ${DBOX.toFixed(1)}) - ${(DBOX / 2).toFixed(1)};
        p.y = groundY + seed.y * seed.y / ${DBOX_H.toFixed(1)} + sin(time * 2.0 + seed.w * 40.0) * 0.6;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        vA = 1.0 - smoothstep(40.0, 110.0, length(p - camPos));
        gl_PointSize = clamp(260.0 / -mv.z, 1.0, 26.0);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <logdepthbuf_pars_fragment>
      uniform float alpha; uniform vec3 color;
      varying float vA;
      void main() {
        #include <logdepthbuf_fragment>
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(color, alpha * vA * (1.0 - d * 2.0) * 0.55);
      }`,
    transparent: true, depthWrite: false,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  dust.renderOrder = 4;
  group.add(dust);

  // ---------- dust devils: spinning funnels of dust in the open desert ----------
  const DEVIL_N = 2200, DEVILS = 4, CELL = 1800;
  const devilGeo = new THREE.BufferGeometry();
  const dv = new Float32Array(DEVIL_N * 4);
  for (let i = 0; i < DEVIL_N; i++) dv.set([r() * Math.PI * 2, Math.pow(r(), 1.3), r(), r()], i * 4); // angle, height, radius jitter, speed jitter
  devilGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DEVIL_N * 3), 3));
  devilGeo.setAttribute('seed', new THREE.BufferAttribute(dv, 4));
  const devils = [];
  for (let k = 0; k < DEVILS; k++) {
    const m = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, height: { value: 90 }, width: { value: 6 }, alpha: { value: 0 }, color: { value: new THREE.Color('#c09a68') } },
      vertexShader: /* glsl */`
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute vec4 seed;
        uniform float time, height, width;
        varying float vA;
        void main() {
          float h = seed.y;
          float rad = width * (0.25 + h * h * 2.2) * (0.7 + seed.z * 0.6);
          float a = seed.x + time * (5.0 - h * 3.0) * (0.8 + seed.w * 0.4);
          float sway = sin(time * 0.7 + h * 3.0) * width * h * 0.8;
          vec3 p = vec3(cos(a) * rad + sway, h * height, sin(a) * rad + cos(time * 0.5 + h * 2.0) * width * h * 0.6);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vA = (1.0 - smoothstep(0.65, 1.0, h)) * smoothstep(0.0, 0.05, h);
          gl_PointSize = clamp((900.0 + h * 1400.0) / -mv.z, 1.0, 60.0);
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */`
        #include <logdepthbuf_pars_fragment>
        uniform float alpha; uniform vec3 color;
        varying float vA;
        void main() {
          #include <logdepthbuf_fragment>
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(color, alpha * vA * (1.0 - d * 2.0) * 0.5);
        }`,
      transparent: true, depthWrite: false,
    });
    const p = new THREE.Points(devilGeo, m);
    p.frustumCulled = false;
    p.renderOrder = 4;
    p.visible = false;
    group.add(p);
    devils.push(p);
  }
  // a devil in grid cell (i, j) during hour h, or null: where it starts, how it drifts, how long it lasts
  function devilIn(i, j, h) {
    const q = rng((i * 73856093) ^ (j * 19349663) ^ (h * 83492791));
    if (q() > 0.45) return null;
    const t0 = h * HOUR + q() * 50 * MIN, life = (5 + q() * 10) * MIN;
    return { t0, t1: t0 + life, x: (i + 0.15 + q() * 0.7) * CELL, z: (j + 0.15 + q() * 0.7) * CELL, height: 60 + q() * 110, width: 5 + q() * 6, seed: q() * 100 };
  }

  // ---------- lightning: a jagged bolt from the cloud base to the ground, and a flash ----------
  const boltMat = new THREE.LineBasicMaterial({ color: '#e8eeff', transparent: true, opacity: 0, fog: false, toneMapped: false });
  const boltGeo = new THREE.BufferGeometry();
  boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 80), 3));
  const bolt = new THREE.LineSegments(boltGeo, boltMat);
  bolt.frustumCulled = false;
  bolt.renderOrder = 5;
  group.add(bolt);
  let flash = 0, nextStrike = 0, strikeT = -1;
  function strike(cam) {
    // somewhere 2 to 12 km away, in any direction
    const a = Math.random() * Math.PI * 2, d = 2000 + Math.random() * 10000;
    const gx = cam.x + Math.cos(a) * d, gz = cam.z + Math.sin(a) * d, gy = getHeight(gx, gz);
    const pts = [];
    let x = gx + (Math.random() - 0.5) * 600, y = gy + 2600, z = gz + (Math.random() - 0.5) * 600;
    const steps = 18;
    for (let s = 0; s < steps; s++) {
      const f = (s + 1) / steps;
      const nx = gx + (x - gx) * 0.5 * (1 - f) + (Math.random() - 0.5) * 260 * (1 - f * 0.7);
      const ny = gy + 2600 * (1 - f);
      const nz = gz + (z - gz) * 0.5 * (1 - f) + (Math.random() - 0.5) * 260 * (1 - f * 0.7);
      pts.push(x, y, z, nx, ny, nz);
      // a branch now and then
      if (s > 2 && s < steps - 3 && Math.random() < 0.3 && pts.length < 72 * 3) {
        pts.push(nx, ny, nz, nx + (Math.random() - 0.5) * 500, ny - 200 - Math.random() * 300, nz + (Math.random() - 0.5) * 500);
      }
      x = nx; y = ny; z = nz;
    }
    const arr = boltGeo.attributes.position.array;
    arr.fill(0);
    arr.set(pts.slice(0, arr.length));
    boltGeo.attributes.position.needsUpdate = true;
    boltGeo.setDrawRange(0, Math.min(pts.length, arr.length) / 3);
    strikeT = 0;
  }

  // ---------- the weather at time t ----------
  function scheduled(t) {
    const d = dayIndex(t);
    const out = { overcast: 0, rain: 0, storm: 0, dust: 0 };
    let name = 'clear', end = null;
    for (const day of [d - 1, d]) {
      const e = eventOn(day);
      if (!e) continue;
      const ramp = 45 * MIN;
      if (t < e.t0 - ramp || t > e.t1 + ramp) continue;
      const k = Math.min(1, (t - (e.t0 - ramp)) / ramp, ((e.t1 + ramp) - t) / ramp);
      const m = MIX[e.kind];
      for (const key in out) out[key] = Math.max(out[key], m[key] * k);
      if (t >= e.t0 && t <= e.t1) { name = e.kind; end = e.t1; }
    }
    return { mix: out, name, end };
  }
  function nextEvent(t) {
    const d = dayIndex(t);
    for (let day = d; day < d + 5; day++) { const e = eventOn(day); if (e && e.t0 > t) return e; }
    return null;
  }

  const wind = new THREE.Vector2(3, 1.2);
  let elapsed = 0;
  const camPos = new THREE.Vector3();

  function update(t, realDt) {
    const dt = Math.min(realDt, 0.1);
    elapsed += dt;
    camera.getWorldPosition(camPos);
    // target: the schedule, or the weather picked by hand
    let target, name;
    if (MODES[mode] === 'auto') {
      const s = scheduled(t);
      target = s.mix; name = s.name; until = s.end;
    } else { name = MODES[mode]; target = MIX[name]; until = null; }
    label = WEATHER_NAMES[name];
    // ease toward it (a few seconds when picked by hand; the schedule ramps itself)
    const k = 1 - Math.exp(-dt * (MODES[mode] === 'auto' ? 4 : 0.8));
    for (const key in cur) cur[key] += (target[key] - cur[key]) * k;

    // wind picks up with storms and dust
    const gust = 3 + cur.storm * 6 + cur.dust * 14 + Math.sin(elapsed * 0.3) * (1 + cur.dust * 4);
    wind.set(Math.cos(0.4) * gust, Math.sin(0.4) * gust);

    // rain
    const ground = getHeight(camPos.x, camPos.z);
    rainMat.uniforms.time.value = elapsed;
    rainMat.uniforms.camPos.value.copy(camPos);
    rainMat.uniforms.wind.value.copy(wind);
    rainMat.uniforms.alpha.value = 0.22 + 0.28 * cur.storm;
    rainGeo.setDrawRange(0, Math.floor(RAIN_N * Math.min(1, cur.rain)) * 2);
    rain.visible = cur.rain > 0.02 && camPos.y - ground < 900;

    // blowing dust
    dustMat.uniforms.time.value = elapsed;
    dustMat.uniforms.camPos.value.copy(camPos);
    dustMat.uniforms.wind.value.copy(wind);
    dustMat.uniforms.alpha.value = cur.dust;
    dustMat.uniforms.groundY.value = ground;
    dust.visible = cur.dust > 0.02 && camPos.y - ground < 400;

    // dust devils: hot clear afternoons, in the cells around the camera
    const hourOfDay = ((t - dayStart(dayIndex(t))) / HOUR);
    const devilAmt = (1 - cur.overcast) * (1 - cur.rain) * (1 - cur.dust) * Math.max(0, Math.min(1, (hourOfDay - 10.5) * 1.2, (18.5 - hourOfDay) * 1.2));
    const active = [];
    if (devilAmt > 0.02) {
      const ci = Math.floor(camPos.x / CELL), cj = Math.floor(camPos.z / CELL), h = Math.floor(t / HOUR);
      for (let i = ci - 3; i <= ci + 3; i++) for (let j = cj - 3; j <= cj + 3; j++) for (const hh of [h - 1, h]) {
        const dvl = devilIn(i, j, hh);
        if (!dvl || t < dvl.t0 || t > dvl.t1) continue;
        const age = (t - dvl.t0) / 1000;
        const x = dvl.x + wind.x * 0.4 * age, z = dvl.z + wind.y * 0.4 * age;
        const life = Math.min(1, (t - dvl.t0) / 40000, (dvl.t1 - t) / 40000);
        active.push({ ...dvl, x, z, life, dist: Math.hypot(x - camPos.x, z - camPos.z) });
      }
      active.sort((a, b) => a.dist - b.dist);
    }
    devils.forEach((p, n) => {
      const a = active[n];
      p.visible = !!a && a.dist < 9000;
      if (!p.visible) return;
      p.position.set(a.x, getHeight(a.x, a.z), a.z);
      const u = p.material.uniforms;
      u.time.value = elapsed + a.seed; u.height.value = a.height; u.width.value = a.width; u.alpha.value = devilAmt * a.life;
    });

    // lightning
    if (cur.storm > 0.4 && elapsed > nextStrike) {
      strike(camPos);
      nextStrike = elapsed + 3 + Math.random() * 12 / cur.storm;
    }
    if (strikeT >= 0) {
      strikeT += dt;
      // two quick flickers, then gone
      const on = strikeT < 0.08 || (strikeT > 0.14 && strikeT < 0.24);
      boltMat.opacity = on ? 1 : 0;
      if (on) flash = Math.max(flash, 1);
      if (strikeT > 0.3) strikeT = -1;
    }
    flash *= Math.exp(-dt * 9);

    return { ...cur, devils: devilAmt, flash, wind: [wind.x, wind.y] };
  }

  function describe(t) {
    const tag = MODES[mode] === 'auto' ? '' : ' <span style="opacity:.6">(set by hand, Z)</span>';
    if (MODES[mode] !== 'auto') return `${label}${tag}`;
    if (until) return `${label} &middot; clears ${localClock(new Date(until))}`;
    const n = nextEvent(t);
    return `${label}${n && n.t0 - t < 12 * HOUR ? ` &middot; ${WEATHER_NAMES[n.kind].toLowerCase()} at ${localClock(new Date(n.t0))}` : ''}`;
  }

  return {
    group, update, describe,
    cycle() { mode = (mode + 1) % MODES.length; return MODES[mode]; },
    get mode() { return MODES[mode]; },
  };
}

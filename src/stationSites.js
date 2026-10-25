import { HALCYON, IRONWOOD, CITY_GRID, IRON_GRID, TOWN_Z } from './heightfield.js';

// Where each town's first responders are based: a police station, a fire station and an EMS
// station per town, and Halcyon's hospital. Halcyon and Ironwood each give up whole blocks (the city
// builders skip anything inside these lots, see isStationLot); Saltbrush's sit on open ground at the
// north end of Main Street. Each site: { city, kind, x, z (center), w, d (lot size), face: [fx, fz] (the street the
// doors open onto, as a unit direction), street: point on that street in front of the doors }.
const hal = (i, j) => [HALCYON.x + (i + 0.5) * CITY_GRID, HALCYON.z + (j + 0.5) * CITY_GRID];
const irn = (i, j) => [IRONWOOD.x + (i + 0.5) * IRON_GRID, IRONWOOD.z + (j + 0.5) * IRON_GRID];
const T = TOWN_Z;

function site(city, kind, [x, z], w, d, face, streetOff) {
  return { city, kind, x, z, w, d, face, street: [x + face[0] * streetOff, z + face[1] * streetOff] };
}

export const STATION_SITES = [
  // Saltbrush: both sides of Main Street (x = 0), north of the houses, doors onto Main
  site('saltbrush', 'police', [48, T - 575], 40, 44, [-1, 0], 48),
  site('saltbrush', 'fire', [-50, T - 570], 44, 40, [1, 0], 50),
  site('saltbrush', 'ems', [-50, T - 640], 40, 34, [1, 0], 50),
  // Halcyon: three midtown blocks east of the freeway's end, doors onto the street to the south
  site('halcyon', 'police', hal(11, 5), 120, 120, [0, 1], 70),
  site('halcyon', 'fire', hal(12, 5), 120, 120, [0, 1], 70),
  site('halcyon', 'ems', hal(11, 6), 120, 120, [0, 1], 70),
  // the hospital every town's ambulances take patients to, next door to Halcyon EMS
  site('halcyon', 'hospital', hal(12, 6), 120, 120, [0, 1], 70),
  // Ironwood: a row of industrial blocks north of the rail yard, doors onto the street to the south
  site('ironwood', 'police', irn(-3, 5), 80, 80, [0, 1], 50),
  site('ironwood', 'fire', irn(-2, 5), 80, 80, [0, 1], 50),
  site('ironwood', 'ems', irn(-4, 5), 80, 80, [0, 1], 50),
];

// Inside a station's lot (the city builders leave these empty).
export const isStationLot = (x, z) => STATION_SITES.some((s) => s.city !== 'saltbrush' && Math.abs(x - s.x) < s.w / 2 && Math.abs(z - s.z) < s.d / 2);

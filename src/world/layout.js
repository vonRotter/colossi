// Points of interest shared by terrain generation, props and gameplay.
export const WORLD_HALF = 800;
export const WATER_LEVEL = 0;

export const SHRINE = { x: 0, z: 0, r: 34, fall: 40, h: 14 };

export const ARENAS = {
  golem: { x: 250, z: -300, r: 90, fall: 60, h: 8 },
  turtle: { x: -300, z: 250, r: 85, fall: 50, h: 4 },
};

export const LAKES = [
  { x: -430, z: 380, r: 95, depth: -6 },
  { x: 180, z: 260, r: 55, depth: -4 },
];

// Dirt paths from the shrine to each arena (polyline points).
export const PATHS = [
  [[0, 0], [60, -80], [150, -170], [250, -300]],
  [[0, 0], [-90, 60], [-200, 150], [-300, 250]],
];

export function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + dx * t;
  const cz = az + dz * t;
  return Math.hypot(px - cx, pz - cz);
}

export function distToPaths(x, z) {
  let best = Infinity;
  for (const path of PATHS) {
    for (let i = 0; i < path.length - 1; i++) {
      const d = distToSegment(x, z, path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]);
      if (d < best) best = d;
    }
  }
  return best;
}

// Static circular obstacles (tree trunks, boulders, pillars) in a uniform grid.
const CELL = 16;

export class Colliders {
  constructor() {
    this.grid = new Map();
  }

  key(i, j) {
    return i * 100003 + j;
  }

  add(x, z, r, top = Infinity) {
    const c = { x, z, r, top };
    const i0 = Math.floor((x - r) / CELL);
    const i1 = Math.floor((x + r) / CELL);
    const j0 = Math.floor((z - r) / CELL);
    const j1 = Math.floor((z + r) / CELL);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = this.key(i, j);
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(c);
      }
    }
  }

  nearby(x, z) {
    return this.grid.get(this.key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? [];
  }

  /** Pushes a circle at pos (mutates pos.x/z). Returns true if it collided. */
  resolve(pos, radius, feetY = -Infinity) {
    let hit = false;
    for (const c of this.nearby(pos.x, pos.z)) {
      if (feetY > c.top) continue;
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const min = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 0.0001;
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
        hit = true;
      }
    }
    return hit;
  }

  /** Highest collider top under (x, z), used to let the player stand on boulders. */
  topAt(x, z, radius) {
    let best = -Infinity;
    for (const c of this.nearby(x, z)) {
      if (c.top === Infinity) continue;
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.r + radius * 0.3 && c.top > best) best = c.top;
    }
    return best;
  }
}

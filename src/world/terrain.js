import * as THREE from 'three';
import { Noise2D, smoothstep, lerp, clamp } from './noise.js';
import { WORLD_HALF, SHRINE, ARENAS, LAKES, distToPaths, WATER_LEVEL } from './layout.js';
import { toonMaterial } from '../materials.js';

const SEG = 400;
const SIZE = WORLD_HALF * 2;
const CELL = SIZE / SEG;
const N = SEG + 1;

const COLORS = {
  grassA: new THREE.Color(0x86c94f),
  grassB: new THREE.Color(0x5fae3e),
  meadow: new THREE.Color(0xa3d35c),
  sand: new THREE.Color(0xeedc9c),
  dirt: new THREE.Color(0xc9a46a),
  rock: new THREE.Color(0xa59f92),
  rockDark: new THREE.Color(0x857f76),
  snow: new THREE.Color(0xf6f9ff),
  shore: new THREE.Color(0xb7c96a),
};

export class Terrain {
  constructor(seed = 7) {
    this.noise = new Noise2D(seed);
    this.heights = new Float32Array(N * N);
    this.grass = new Float32Array(N * N);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = -WORLD_HALF + i * CELL;
        const z = -WORLD_HALF + j * CELL;
        this.heights[j * N + i] = this.rawHeight(x, z);
      }
    }
    this.mesh = this.buildMesh();
    this.heightTexture = this.buildTexture();
  }

  rawHeight(x, z) {
    const n = this.noise;
    let h = 7 + n.fbm(x * 0.0035, z * 0.0035, 4) * 16 + n.fbm(x * 0.016 + 100, z * 0.016, 3) * 2.5;
    // Gentle rolling bumps
    h += Math.max(0, n.noise(x * 0.008 - 40, z * 0.008 + 70)) * 10;
    // Ring of mountains around the valley keeps the player inside.
    const r = Math.hypot(x, z);
    const m = smoothstep(520, 770, r);
    h += m * (70 + 55 * n.fbm(x * 0.006 + 50, z * 0.006 - 20, 5));

    const flatten = (f) => {
      const d = Math.hypot(x - f.x, z - f.z);
      const t = 1 - smoothstep(f.r, f.r + f.fall, d);
      h = lerp(h, f.h + n.noise(x * 0.03, z * 0.03) * 0.6, t);
    };
    flatten(SHRINE);
    flatten(ARENAS.golem);
    flatten(ARENAS.turtle);

    // Paths are gently smoothed so the horse can gallop along them.
    const pd = distToPaths(x, z);
    if (pd < 14) {
      const t = (1 - smoothstep(4, 14, pd)) * 0.35;
      h = lerp(h, 6 + n.fbm(x * 0.0035, z * 0.0035, 2) * 6, t);
    }

    for (const L of LAKES) {
      const d = Math.hypot(x - L.x, z - L.z) + n.noise(x * 0.02, z * 0.02) * 12;
      const t = 1 - smoothstep(L.r * 0.45, L.r, d);
      h = lerp(h, L.depth, t);
    }
    return h;
  }

  /** Height of the rendered triangle mesh at (x, z). */
  getHeight(x, z) {
    const fx = clamp((x + WORLD_HALF) / CELL, 0, SEG - 1e-4);
    const fz = clamp((z + WORLD_HALF) / CELL, 0, SEG - 1e-4);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const H = this.heights;
    const h00 = H[j * N + i];
    const h10 = H[j * N + i + 1];
    const h01 = H[(j + 1) * N + i];
    const h11 = H[(j + 1) * N + i + 1];
    if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
    return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  }

  getNormal(x, z, target = new THREE.Vector3()) {
    const e = 1.0;
    const hl = this.getHeight(x - e, z);
    const hr = this.getHeight(x + e, z);
    const hd = this.getHeight(x, z - e);
    const hu = this.getHeight(x, z + e);
    return target.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  buildMesh() {
    const positions = new Float32Array(N * N * 3);
    const colors = new Float32Array(N * N * 3);
    const H = this.heights;
    const c = new THREE.Color();
    const nrm = new THREE.Vector3();
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        const x = -WORLD_HALF + i * CELL;
        const z = -WORLD_HALF + j * CELL;
        const h = H[k];
        positions[k * 3] = x;
        positions[k * 3 + 1] = h;
        positions[k * 3 + 2] = z;

        // Slope from neighbouring grid heights.
        const hl = H[j * N + Math.max(0, i - 1)];
        const hr = H[j * N + Math.min(SEG, i + 1)];
        const hd = H[Math.max(0, j - 1) * N + i];
        const hu = H[Math.min(SEG, j + 1) * N + i];
        nrm.set(hl - hr, 2 * CELL, hd - hu).normalize();
        const slope = nrm.y;

        const v = this.noise.noise(x * 0.02, z * 0.02) * 0.5 + 0.5;
        const v2 = this.noise.noise(x * 0.004 + 9, z * 0.004 - 3) * 0.5 + 0.5;
        c.copy(COLORS.grassB).lerp(COLORS.grassA, v);
        c.lerp(COLORS.meadow, smoothstep(0.55, 0.9, v2) * 0.6);
        let grass = 1;

        const pd = distToPaths(x, z);
        if (pd < 4.5) {
          const t = 1 - smoothstep(2.5, 4.5, pd);
          c.lerp(COLORS.dirt, t);
          grass *= 1 - t;
        }
        if (h < WATER_LEVEL + 2.2) {
          const t = 1 - smoothstep(WATER_LEVEL + 0.6, WATER_LEVEL + 2.2, h);
          c.lerp(COLORS.sand, t);
          grass *= 1 - t;
        }
        if (slope < 0.8) {
          const t = 1 - smoothstep(0.62, 0.8, slope);
          c.lerp(v > 0.5 ? COLORS.rock : COLORS.rockDark, t);
          grass *= 1 - t;
        }
        if (h > 85) {
          const t = smoothstep(85, 100, h + v * 8);
          c.lerp(COLORS.snow, t);
          grass *= 1 - t;
        }
        const sd = Math.hypot(x - SHRINE.x, z - SHRINE.z);
        if (sd < 26) {
          const t = 1 - smoothstep(18, 26, sd);
          c.lerp(new THREE.Color(0xd8d2c0), t);
          grass *= 1 - t;
        }
        colors[k * 3] = c.r;
        colors[k * 3 + 1] = c.g;
        colors[k * 3 + 2] = c.b;
        this.grass[k] = grass;
      }
    }
    const index = new Uint32Array(SEG * SEG * 6);
    let p = 0;
    for (let j = 0; j < SEG; j++) {
      for (let i = 0; i < SEG; i++) {
        const a = j * N + i; // v00
        const b = j * N + i + 1; // v10
        const d = (j + 1) * N + i; // v01
        const e = (j + 1) * N + i + 1; // v11
        index[p++] = a; index[p++] = d; index[p++] = b;
        index[p++] = b; index[p++] = d; index[p++] = e;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mat = toonMaterial(0xffffff, { vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    return mesh;
  }

  buildTexture() {
    const data = new Float32Array(N * N * 4);
    for (let k = 0; k < N * N; k++) {
      data[k * 4] = this.heights[k];
      data[k * 4 + 1] = this.grass[k];
      data[k * 4 + 2] = 0;
      data[k * 4 + 3] = 1;
    }
    const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    return tex;
  }

  grassAt(x, z) {
    const i = Math.round((x + WORLD_HALF) / CELL);
    const j = Math.round((z + WORLD_HALF) / CELL);
    if (i < 0 || j < 0 || i > SEG || j > SEG) return 0;
    return this.grass[j * N + i];
  }
}

// GLSL helper shared by grass + water so they match the CPU triangle interpolation.
export const TERRAIN_GLSL = /* glsl */ `
  uniform sampler2D uHeightTex;
  const float T_HALF = ${WORLD_HALF.toFixed(1)};
  const float T_CELL = ${CELL.toFixed(4)};
  const float T_SEG = ${SEG.toFixed(1)};
  vec2 terrainSample(vec2 xz) {
    vec2 f = clamp((xz + T_HALF) / T_CELL, vec2(0.0), vec2(T_SEG - 0.0001));
    ivec2 ij = ivec2(floor(f));
    vec2 uv = f - vec2(ij);
    vec2 a = texelFetch(uHeightTex, ij, 0).rg;
    vec2 b = texelFetch(uHeightTex, ij + ivec2(1, 0), 0).rg;
    vec2 c = texelFetch(uHeightTex, ij + ivec2(0, 1), 0).rg;
    vec2 d = texelFetch(uHeightTex, ij + ivec2(1, 1), 0).rg;
    if (uv.x + uv.y <= 1.0) return a + (b - a) * uv.x + (c - a) * uv.y;
    return d + (c - d) * (1.0 - uv.x) + (b - d) * (1.0 - uv.y);
  }
`;

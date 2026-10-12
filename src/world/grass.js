import * as THREE from 'three';
import { TERRAIN_GLSL } from './terrain.js';

// Infinite-feeling grass: a fixed grid of blades that scrolls with the camera.
// Blade positions are hashed from world cells so they stay put as the grid moves.
export class Grass {
  constructor(terrain, { spacing = 0.42, radius = 38 } = {}) {
    this.spacing = spacing;
    this.radius = radius;
    const count1d = Math.ceil((radius * 2) / spacing);
    const offsets = [];
    for (let j = 0; j < count1d; j++) {
      for (let i = 0; i < count1d; i++) {
        const ox = i - count1d / 2;
        const oz = j - count1d / 2;
        if (Math.hypot(ox, oz) * spacing > radius) continue;
        offsets.push(ox, oz);
      }
    }
    this.count = offsets.length / 2;

    // Blade: 2 quads + tip triangle, y in [0,1], x in [-0.5,0.5]
    const base = new THREE.BufferGeometry();
    const pos = [
      -0.5, 0, 0, 0.5, 0, 0,
      -0.38, 0.45, 0, 0.38, 0.45, 0,
      0, 1, 0,
    ];
    base.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    base.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4]);

    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.attributes.position = base.attributes.position;
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(offsets), 2));
    geo.instanceCount = this.count;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.uniforms = {
      uHeightTex: { value: terrain.heightTexture },
      uCenterCell: { value: new THREE.Vector2() },
      uSpacing: { value: spacing },
      uRadius: { value: radius },
      uTime: { value: 0 },
      uPlayer: { value: new THREE.Vector3(1e5, 0, 0) },
      uHorse: { value: new THREE.Vector3(1e5, 0, 0) },
      uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
      uFogColor: { value: new THREE.Color() },
      uFogNear: { value: 100 },
      uFogFar: { value: 800 },
      uBase: { value: new THREE.Color(0x3f8a32) },
      uTip: { value: new THREE.Color(0xb6e070) },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        ${TERRAIN_GLSL}
        attribute vec2 aOffset;
        uniform vec2 uCenterCell;
        uniform float uSpacing;
        uniform float uRadius;
        uniform float uTime;
        uniform vec3 uPlayer;
        uniform vec3 uHorse;
        varying float vY;
        varying float vShade;
        varying float vFogDepth;
        varying float vTint;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

        void main() {
          vec2 cell = uCenterCell + aOffset;
          float r1 = hash(cell);
          float r2 = hash(cell + 17.3);
          float r3 = hash(cell - 9.1);
          vec2 xz = (cell + vec2(r1, r2)) * uSpacing;
          vec2 t = terrainSample(xz);
          float h = t.x;
          float density = t.y;

          float dist = length(xz - uCenterCell * uSpacing);
          float fade = 1.0 - smoothstep(uRadius * 0.7, uRadius, dist);
          float alive = step(r3, density * 1.05) * step(0.25, h);
          float height = mix(0.3, 0.72, r2) * fade * alive * (0.75 + density * 0.3);

          float ang = r1 * 6.2831;
          vec3 p = position;
          p.x *= 0.11 * (0.7 + r3 * 0.6);
          p.y *= height;
          float c = cos(ang), s = sin(ang);
          p.xz = mat2(c, -s, s, c) * p.xz;

          float bend = position.y * position.y;
          vec2 wind = vec2(
            sin(uTime * 1.7 + xz.x * 0.12 + xz.y * 0.05),
            cos(uTime * 1.3 + xz.y * 0.11)
          ) * 0.18 + vec2(0.12, 0.05) * sin(uTime * 0.6 + xz.x * 0.02);
          vec2 away = xz - uPlayer.xz;
          float d = length(away);
          vec2 push = d < 1.3 ? normalize(away + 0.0001) * (1.3 - d) * 0.9 : vec2(0.0);
          vec2 awayH = xz - uHorse.xz;
          float dh = length(awayH);
          push += dh < 2.2 ? normalize(awayH + 0.0001) * (2.2 - dh) * 0.7 : vec2(0.0);
          p.xz += (wind + push) * bend * height;
          p.y -= length(push) * bend * 0.4 * height;

          vec3 world = vec3(xz.x, h, xz.y) + p;
          vY = position.y;
          vTint = r3;
          vShade = 0.85 + 0.15 * sin(xz.x * 0.05 + xz.y * 0.03);
          vec4 mv = viewMatrix * vec4(world, 1.0);
          vFogDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uBase;
        uniform vec3 uTip;
        uniform vec3 uFogColor;
        uniform float uFogNear;
        uniform float uFogFar;
        varying float vY;
        varying float vShade;
        varying float vFogDepth;
        varying float vTint;
        void main() {
          vec3 tip = mix(uTip, vec3(0.86, 0.9, 0.45), vTint * 0.35);
          vec3 col = mix(uBase, tip, smoothstep(0.0, 1.0, vY)) * vShade;
          float fogF = smoothstep(uFogNear, uFogFar, vFogDepth);
          gl_FragColor = vec4(mix(col, uFogColor, fogF), 1.0);
          #include <colorspace_fragment>
        }
      `,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'grass';
  }

  update(dt, camera, playerPos, horsePos, fog) {
    this.uniforms.uTime.value += dt;
    const s = this.spacing;
    this.uniforms.uCenterCell.value.set(Math.floor(camera.position.x / s), Math.floor(camera.position.z / s));
    this.uniforms.uPlayer.value.copy(playerPos);
    if (horsePos) this.uniforms.uHorse.value.copy(horsePos);
    if (fog) {
      this.uniforms.uFogColor.value.copy(fog.color);
      this.uniforms.uFogNear.value = fog.near;
      this.uniforms.uFogFar.value = fog.far;
    }
  }
}

import * as THREE from 'three';

export class Sky {
  constructor(sunDir) {
    this.uniforms = {
      uTop: { value: new THREE.Color(0x3d9be9) },
      uHorizon: { value: new THREE.Color(0xc9ecfb) },
      uBottom: { value: new THREE.Color(0xe6f6ff) },
      uSunDir: { value: sunDir.clone() },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop;
        uniform vec3 uHorizon;
        uniform vec3 uBottom;
        uniform vec3 uSunDir;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float y = d.y;
          vec3 col = y > 0.0 ? mix(uHorizon, uTop, pow(smoothstep(0.0, 0.65, y), 0.8)) : mix(uHorizon, uBottom, smoothstep(0.0, -0.2, y));
          float sd = max(dot(d, normalize(uSunDir)), 0.0);
          col += vec3(1.0, 0.92, 0.7) * pow(sd, 18.0) * 0.35;
          col = mix(col, vec3(1.0, 0.98, 0.9), smoothstep(0.9975, 0.9985, sd));
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }
      `,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  update(camera) {
    this.mesh.position.copy(camera.position);
  }
}

export class Water {
  constructor(terrain, size) {
    this.uniforms = {
      uHeightTex: { value: terrain.heightTexture },
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(0x2c8fc9) },
      uShallow: { value: new THREE.Color(0x5fd3e0) },
      uFogColor: { value: new THREE.Color() },
      uFogNear: { value: 100 },
      uFogFar: { value: 800 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        varying float vFogDepth;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          vec4 mv = viewMatrix * w;
          vFogDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uHeightTex;
        uniform float uTime;
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform vec3 uFogColor;
        uniform float uFogNear;
        uniform float uFogFar;
        varying vec3 vWorld;
        varying float vFogDepth;
        ${''}
        const float T_HALF = 800.0;
        const float T_CELL = 4.0;
        float heightAt(vec2 xz) {
          vec2 f = clamp((xz + T_HALF) / T_CELL, vec2(0.0), vec2(399.999));
          ivec2 ij = ivec2(floor(f));
          vec2 uv = f - vec2(ij);
          float a = texelFetch(uHeightTex, ij, 0).r;
          float b = texelFetch(uHeightTex, ij + ivec2(1, 0), 0).r;
          float c = texelFetch(uHeightTex, ij + ivec2(0, 1), 0).r;
          float d = texelFetch(uHeightTex, ij + ivec2(1, 1), 0).r;
          if (uv.x + uv.y <= 1.0) return a + (b - a) * uv.x + (c - a) * uv.y;
          return d + (c - d) * (1.0 - uv.x) + (b - d) * (1.0 - uv.y);
        }
        float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
        float vnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
        }
        void main() {
          float depth = -heightAt(vWorld.xz);
          if (depth < -0.2) discard;
          vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 4.0, depth));
          float n = vnoise(vWorld.xz * 0.35 + vec2(uTime * 0.4, uTime * 0.25)) + vnoise(vWorld.xz * 0.5 - vec2(uTime * 0.3, -uTime * 0.2));
          col += vec3(0.85, 0.97, 1.0) * smoothstep(1.55, 1.7, n) * 0.6;
          float foam = smoothstep(0.55, 0.0, depth + sin(uTime * 1.5 + vWorld.x * 0.3 + vWorld.z * 0.2) * 0.12);
          col = mix(col, vec3(1.0), foam * 0.85);
          float alpha = mix(0.7, 0.92, smoothstep(0.0, 3.0, depth));
          float fogF = smoothstep(uFogNear, uFogFar, vFogDepth);
          gl_FragColor = vec4(mix(col, uFogColor, fogF), max(alpha, foam));
          #include <colorspace_fragment>
        }
      `,
    });
    const geo = new THREE.PlaneGeometry(size, size, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = 0;
    this.mesh.renderOrder = 2;
  }

  update(dt, fog) {
    this.uniforms.uTime.value += dt;
    this.uniforms.uFogColor.value.copy(fog.color);
    this.uniforms.uFogNear.value = fog.near;
    this.uniforms.uFogFar.value = fog.far;
  }
}

import * as THREE from 'three';

let gradient = null;
export function toonGradient() {
  if (gradient) return gradient;
  // Three soft bands give the cel-shaded storybook look.
  const data = new Uint8Array([90, 170, 235, 255]);
  gradient = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

const cache = new Map();
export function toonMaterial(color, opts = {}) {
  const key = opts.shared === false ? null : `${color}|${JSON.stringify(opts)}`;
  if (key && cache.has(key)) return cache.get(key);
  const { shared, rim, ...rest } = opts;
  const mat = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...rest });
  if (rim !== false) addRimLight(mat, rim ?? 0.25);
  if (key) cache.set(key, mat);
  return mat;
}

/** Soft fresnel rim so silhouettes pop against the sky, like a painted look. */
export function addRimLight(mat, strength = 0.25) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = { value: strength };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRim;')
      .replace(
        '#include <opaque_fragment>',
        `float rimF = 1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);
         outgoingLight += vec3(1.0, 0.97, 0.88) * smoothstep(0.55, 0.95, rimF) * uRim;
         #include <opaque_fragment>`
      );
  };
  mat.customProgramCacheKey = () => `rim${strength}`;
  return mat;
}

const outlineMats = new Map();
function outlineMaterial(width, color) {
  const key = `${width}|${color}`;
  if (outlineMats.has(key)) return outlineMats.get(key);
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uOutline = { value: width };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uOutline;')
      .replace('#include <begin_vertex>', 'vec3 transformed = position + normalize(normal) * uOutline;');
  };
  mat.customProgramCacheKey = () => `outline${width}`;
  outlineMats.set(key, mat);
  return mat;
}

/** Inverted-hull outline. Works best on geometry with smooth normals. */
export function addOutline(mesh, width = 0.04, color = 0x2a2438) {
  const o = new THREE.Mesh(mesh.geometry, outlineMaterial(width, color));
  o.raycast = () => {};
  o.userData.isOutline = true;
  o.castShadow = false;
  o.receiveShadow = false;
  mesh.add(o);
  return o;
}

export function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let glowTex = null;
export function makeGlowSprite(color, size) {
  glowTex ??= glowTexture();
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  s.scale.setScalar(size);
  return s;
}

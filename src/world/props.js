import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { SHRINE, ARENAS, LAKES, distToPaths, WATER_LEVEL } from './layout.js';
import { toonMaterial, addOutline, makeGlowSprite } from '../materials.js';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpE = new THREE.Euler();
const tmpC = new THREE.Color();

function blocked(x, z, extra = 0) {
  if (Math.hypot(x - SHRINE.x, z - SHRINE.z) < SHRINE.r + 6 + extra) return true;
  for (const a of Object.values(ARENAS)) if (Math.hypot(x - a.x, z - a.z) < a.r + 8 + extra) return true;
  if (distToPaths(x, z) < 7 + extra) return true;
  return false;
}

export function buildProps(scene, terrain, colliders, seed = 3) {
  const rand = mulberry32(seed);
  const n = terrain.noise;
  const group = new THREE.Group();
  scene.add(group);

  // ---------- Broadleaf trees ----------
  const trunks = [];
  const crowns = [];
  const pines = [];
  let tries = 0;
  while ((trunks.length < 1500 || pines.length < 700) && tries++ < 60000) {
    const x = (rand() * 2 - 1) * 720;
    const z = (rand() * 2 - 1) * 720;
    if (blocked(x, z)) continue;
    const h = terrain.getHeight(x, z);
    if (h < WATER_LEVEL + 2) continue;
    const nrm = terrain.getNormal(x, z);
    if (nrm.y < 0.82) continue;
    const forest = n.fbm(x * 0.006 + 300, z * 0.006 - 200, 3);
    const r = Math.hypot(x, z);
    if (h > 40 || r > 560) {
      if (pines.length < 700 && forest > -0.1 && h < 95) pines.push({ x, z, h, s: 0.8 + rand() * 0.7 });
      continue;
    }
    if (forest < 0.12 && rand() > 0.04) continue;
    if (trunks.length >= 1500) continue;
    trunks.push({ x, z, h, s: 0.8 + rand() * 0.8, rot: rand() * Math.PI * 2 });
  }

  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 4, 7);
  trunkGeo.translate(0, 2, 0);
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, toonMaterial(0x8a5a3b), trunks.length + pines.length);
  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  const crownMesh = new THREE.InstancedMesh(crownGeo, toonMaterial(0xffffff, { rim: 0.18 }), trunks.length * 3);
  const crownColors = [0x5fb548, 0x74c454, 0x4fa040, 0x8acb57, 0x68b74e];
  let ti = 0;
  let ci = 0;
  for (const t of trunks) {
    tmpS.set(t.s, t.s, t.s);
    tmpQ.setFromEuler(tmpE.set(0, t.rot, (rand() - 0.5) * 0.1));
    tmpM.compose(tmpP.set(t.x, t.h - 0.2, t.z), tmpQ, tmpS);
    trunkMesh.setMatrixAt(ti++, tmpM);
    colliders.add(t.x, t.z, 0.45 * t.s);
    const base = crownColors[Math.floor(rand() * crownColors.length)];
    const blobs = [
      [0, 5.2, 0, 2.6],
      [1.3, 4.4, 0.6, 1.8],
      [-1.1, 4.6, -0.7, 1.9],
    ];
    for (const [bx, by, bz, br] of blobs) {
      const cs = Math.cos(t.rot);
      const sn = Math.sin(t.rot);
      tmpP.set(t.x + (bx * cs - bz * sn) * t.s, t.h + by * t.s, t.z + (bx * sn + bz * cs) * t.s);
      tmpS.set(br * t.s, br * t.s * 0.85, br * t.s);
      tmpQ.setFromEuler(tmpE.set(rand(), rand(), rand()));
      tmpM.compose(tmpP, tmpQ, tmpS);
      crownMesh.setMatrixAt(ci, tmpM);
      crownMesh.setColorAt(ci, tmpC.set(base).offsetHSL((rand() - 0.5) * 0.03, 0, (rand() - 0.5) * 0.08));
      ci++;
    }
  }

  // ---------- Pines ----------
  const pineGeo = new THREE.ConeGeometry(1.8, 3.4, 7);
  const pineMesh = new THREE.InstancedMesh(pineGeo, toonMaterial(0xffffff, { rim: 0.15 }), pines.length * 3);
  let pi = 0;
  for (const t of pines) {
    tmpS.set(t.s * 0.8, t.s * 1.2, t.s * 0.8);
    tmpQ.identity();
    tmpM.compose(tmpP.set(t.x, t.h - 0.2, t.z), tmpQ, tmpS);
    trunkMesh.setMatrixAt(ti++, tmpM);
    colliders.add(t.x, t.z, 0.4 * t.s);
    const col = tmpC.set(0x3f8f5a).offsetHSL((rand() - 0.5) * 0.04, 0, (rand() - 0.5) * 0.06);
    for (let k = 0; k < 3; k++) {
      const sc = (1.25 - k * 0.3) * t.s;
      tmpS.set(sc, sc, sc);
      tmpQ.setFromEuler(tmpE.set(0, rand() * 6, 0));
      tmpM.compose(tmpP.set(t.x, t.h + (3.2 + k * 1.9) * t.s, t.z), tmpQ, tmpS);
      pineMesh.setMatrixAt(pi, tmpM);
      pineMesh.setColorAt(pi, col);
      pi++;
    }
  }
  for (const m of [trunkMesh, crownMesh, pineMesh]) {
    m.castShadow = true;
    m.receiveShadow = true;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    group.add(m);
  }

  // ---------- Boulders ----------
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rocks = [];
  tries = 0;
  while (rocks.length < 380 && tries++ < 20000) {
    const x = (rand() * 2 - 1) * 700;
    const z = (rand() * 2 - 1) * 700;
    if (blocked(x, z, 2)) continue;
    const h = terrain.getHeight(x, z);
    if (h < WATER_LEVEL - 1) continue;
    rocks.push({ x, z, h, s: 0.6 + rand() * rand() * 3.2 });
  }
  const rockMesh = new THREE.InstancedMesh(rockGeo, toonMaterial(0xffffff), rocks.length);
  rocks.forEach((r, i) => {
    tmpQ.setFromEuler(tmpE.set(rand() * 3, rand() * 3, rand() * 3));
    tmpS.set(r.s * 1.2, r.s * 0.8, r.s);
    tmpM.compose(tmpP.set(r.x, r.h + r.s * 0.2, r.z), tmpQ, tmpS);
    rockMesh.setMatrixAt(i, tmpM);
    rockMesh.setColorAt(i, tmpC.set(0xaaa69c).offsetHSL(0, 0, (rand() - 0.5) * 0.12));
    if (r.s > 0.9) colliders.add(r.x, r.z, r.s * 0.95);
  });
  rockMesh.castShadow = true;
  rockMesh.receiveShadow = true;
  group.add(rockMesh);

  // ---------- Flowers ----------
  const flowerGeo = new THREE.OctahedronGeometry(0.18, 0);
  flowerGeo.scale(1, 0.5, 1);
  const flowerColors = [0xffffff, 0xfff27a, 0xff9bc8, 0x9fc8ff, 0xffb35c];
  const flowers = [];
  tries = 0;
  while (flowers.length < 7000 && tries++ < 60000) {
    const cx = (rand() * 2 - 1) * 600;
    const cz = (rand() * 2 - 1) * 600;
    if (n.noise(cx * 0.01 + 5, cz * 0.01) < 0.25) continue;
    const color = flowerColors[Math.floor(rand() * flowerColors.length)];
    for (let k = 0; k < 14; k++) {
      const x = cx + (rand() - 0.5) * 9;
      const z = cz + (rand() - 0.5) * 9;
      if (terrain.grassAt(x, z) < 0.7) continue;
      flowers.push({ x, z, h: terrain.getHeight(x, z), color });
    }
  }
  const flowerMesh = new THREE.InstancedMesh(flowerGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), flowers.length);
  flowers.forEach((f, i) => {
    tmpM.compose(tmpP.set(f.x, f.h + 0.5 + rand() * 0.2, f.z), tmpQ.identity(), tmpS.setScalar(0.8 + rand() * 0.6));
    flowerMesh.setMatrixAt(i, tmpM);
    flowerMesh.setColorAt(i, tmpC.set(f.color));
  });
  group.add(flowerMesh);

  // ---------- Clouds ----------
  const cloudGeo = new THREE.IcosahedronGeometry(1, 2);
  const cloudMat = toonMaterial(0xffffff, { emissive: 0x9fb8cc, rim: 0.4 });
  const clouds = new THREE.Group();
  const cloudMesh = new THREE.InstancedMesh(cloudGeo, cloudMat, 60 * 7);
  let k = 0;
  const cloudData = [];
  for (let c = 0; c < 60; c++) {
    const cx = (rand() * 2 - 1) * 1300;
    const cz = (rand() * 2 - 1) * 1300;
    const cy = 190 + rand() * 90;
    const scale = 10 + rand() * 14;
    for (let b = 0; b < 7; b++) {
      cloudData.push({
        x: cx + (rand() - 0.5) * scale * 3,
        y: cy + rand() * scale * 0.4,
        z: cz + (rand() - 0.5) * scale * 1.2,
        s: scale * (0.6 + rand() * 0.6),
      });
      k++;
    }
  }
  clouds.add(cloudMesh);
  group.add(clouds);
  const updateClouds = (t) => {
    cloudData.forEach((c, i) => {
      let x = c.x + t * 4;
      x = ((x + 1400) % 2800 + 2800) % 2800 - 1400;
      tmpM.compose(tmpP.set(x, c.y, c.z), tmpQ.identity(), tmpS.set(c.s, c.s * 0.6, c.s));
      cloudMesh.setMatrixAt(i, tmpM);
    });
    cloudMesh.instanceMatrix.needsUpdate = true;
  };
  updateClouds(0);
  cloudMesh.frustumCulled = false;

  // ---------- Shrine ----------
  const shrine = buildShrine();
  shrine.position.set(SHRINE.x, terrain.getHeight(SHRINE.x, SHRINE.z), SHRINE.z);
  group.add(shrine);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    colliders.add(SHRINE.x + Math.cos(a) * 16, SHRINE.z + Math.sin(a) * 16, 1.3);
  }
  colliders.add(SHRINE.x, SHRINE.z, 2.4);

  // ---------- Ruins (arches + pillars) for landmarks ----------
  const ruinSpots = [
    [120, 60], [-150, -120], [330, 80], [-60, -330], [420, -120], [-380, -60], [60, 380], [-200, 420], [500, 300],
  ];
  for (const [x, z] of ruinSpots) {
    if (blocked(x, z)) continue;
    const h = terrain.getHeight(x, z);
    if (h < 1) continue;
    const ruin = buildRuin(rand);
    ruin.position.set(x, h - 0.3, z);
    ruin.rotation.y = rand() * Math.PI;
    ruin.updateMatrixWorld(true);
    ruin.children.forEach((c) => {
      if (!c.userData.pillar) return;
      const p = c.getWorldPosition(new THREE.Vector3());
      colliders.add(p.x, p.z, 1.1);
    });
    group.add(ruin);
  }

  // Lakes get lily pads
  const lilyGeo = new THREE.CircleGeometry(0.7, 10, 0.4, Math.PI * 1.8);
  lilyGeo.rotateX(-Math.PI / 2);
  const lilyMesh = new THREE.InstancedMesh(lilyGeo, toonMaterial(0x4fae4a, { side: THREE.DoubleSide }), 200);
  let li = 0;
  for (const L of LAKES) {
    for (let i = 0; i < 100; i++) {
      const a = rand() * Math.PI * 2;
      const r = L.r * (0.3 + rand() * 0.45);
      const x = L.x + Math.cos(a) * r;
      const z = L.z + Math.sin(a) * r;
      if (terrain.getHeight(x, z) > -0.5) continue;
      tmpM.compose(tmpP.set(x, 0.05, z), tmpQ.setFromEuler(tmpE.set(0, rand() * 6, 0)), tmpS.setScalar(0.7 + rand()));
      lilyMesh.setMatrixAt(li++, tmpM);
      if (li >= 200) break;
    }
  }
  lilyMesh.count = li;
  group.add(lilyMesh);

  return { group, update: (t) => updateClouds(t), shrine };
}

function buildShrine() {
  const g = new THREE.Group();
  const stone = toonMaterial(0xe8e1cf);
  const stone2 = toonMaterial(0xcfc6b0);
  const roof = toonMaterial(0x4d8fd6);
  const gold = toonMaterial(0xf2c14e, { emissive: 0x6b4a00 });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(20, 22, 1.2, 40), stone2);
  base.position.y = 0.4;
  base.receiveShadow = true;
  g.add(base);
  const step = new THREE.Mesh(new THREE.CylinderGeometry(9, 10, 1.0, 32), stone);
  step.position.y = 1.4;
  step.receiveShadow = true;
  step.castShadow = true;
  g.add(step);

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.2, 9, 12), stone);
    p.position.set(Math.cos(a) * 16, 5, Math.sin(a) * 16);
    p.castShadow = true;
    g.add(p);
    addOutline(p, 0.08);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.8, 2.8), stone2);
    cap.position.set(p.position.x, 9.7, p.position.z);
    cap.rotation.y = -a;
    cap.castShadow = true;
    g.add(cap);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 4), toonMaterial(i % 2 ? 0x4d8fd6 : 0xf2c14e, { side: THREE.DoubleSide }));
    banner.position.set(Math.cos(a) * 14.7, 6.5, Math.sin(a) * 14.7);
    banner.rotation.y = -a + Math.PI / 2;
    g.add(banner);
  }

  // Central statue: a friendly guardian idol holding a light orb
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 2.5, 16), stone2);
  ped.position.y = 3.1;
  ped.castShadow = true;
  g.add(ped);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.4, 2.2, 6, 12), stone);
  body.position.y = 6.2;
  body.castShadow = true;
  g.add(body);
  addOutline(body, 0.07);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12), stone);
  head.position.y = 8.9;
  head.castShadow = true;
  g.add(head);
  addOutline(head, 0.07);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.6, 16), roof);
  hat.position.y = 10.3;
  g.add(hat);
  addOutline(hat, 0.07);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 12), gold);
  orb.position.set(0, 7, 1.6);
  g.add(orb);
  const glow = makeGlowSprite(0xffe08a, 6);
  glow.position.copy(orb.position);
  g.add(glow);
  g.userData.orb = orb;
  g.userData.glow = glow;
  return g;
}

function buildRuin(rand) {
  const g = new THREE.Group();
  const stone = toonMaterial(0xc9c2b0);
  const moss = toonMaterial(0x6fb34f);
  const type = rand();
  const pillar = (x, z, h) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.05, h, 10), stone);
    p.position.set(x, h / 2, z);
    p.castShadow = true;
    p.receiveShadow = true;
    p.userData.pillar = true;
    g.add(p);
    addOutline(p, 0.06);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.5, 10), moss);
    m.position.set(x, h - 0.1, z);
    g.add(m);
    return p;
  };
  if (type < 0.5) {
    pillar(-4, 0, 9);
    pillar(4, 0, 9);
    const top = new THREE.Mesh(new THREE.BoxGeometry(11, 1.6, 2.2), stone);
    top.position.set(0, 9.6, 0);
    top.castShadow = true;
    g.add(top);
  } else {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      pillar(Math.cos(a) * 7, Math.sin(a) * 7, 3 + rand() * 7);
    }
  }
  return g;
}

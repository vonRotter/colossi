import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { toonMaterial, addOutline, makeGlowSprite } from '../materials.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Vector3();

// Soft leafy clumps that make moss read as "grabbable fur".
const tuftGeo = (() => {
  const g = new THREE.IcosahedronGeometry(0.22, 0);
  g.scale(1, 0.55, 1);
  g.translate(0, 0.04, 0);
  return g;
})();

/**
 * A colossus is a moving, climbable dungeon. Subclasses build a hierarchy of
 * parts and drive it procedurally; this base class handles the shared rules:
 * climbable moss, weak-point crystals, shaking, body collision and being freed.
 */
export class Colossus {
  constructor(game, cfg) {
    this.game = game;
    this.cfg = cfg;
    this.name = cfg.name;
    this.title = cfg.title;
    this.home = new THREE.Vector3(cfg.home.x, 0, cfg.home.z);
    this.root = new THREE.Group();
    this.root.name = cfg.name;
    this.meshes = [];
    this.capsules = [];
    this.weakPoints = [];
    this.eyes = [];
    this.shake = 0;
    this.shakeTimer = 0;
    this.shakeStrength = 0;
    this.freed = false;
    this.freedTimer = 0;
    this.aggro = false;
    this.time = Math.random() * 10;
    this.flash = 0;
    this.stoneMat = toonMaterial(cfg.stone ?? 0xb8b2a6, { shared: false });
    this.stoneDark = toonMaterial(cfg.stoneDark ?? 0x8f897f, { shared: false });
    this.mossMat = toonMaterial(cfg.moss ?? 0x6fbf4a, { shared: false });
    this.tuftMat = toonMaterial(cfg.tuft ?? 0x8fd65a);
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0xc77dff });
  }

  get maxHp() {
    return this.weakPoints.reduce((s, w) => s + w.maxHp, 0);
  }
  get hp() {
    return this.weakPoints.reduce((s, w) => s + Math.max(0, w.hp), 0);
  }

  // --- building helpers ------------------------------------------------------
  part(parent, geo, mat, x, y, z, { collide = true, outline = 0.09, climbable = false, shadow = true } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    m.userData.climbable = climbable;
    m.userData.colossus = this;
    parent.add(m);
    if (outline) addOutline(m, outline);
    if (collide) this.meshes.push(m);
    return m;
  }

  moss(parent, geo, x, y, z, { tufts = 1, outline = 0.07, scale = null } = {}) {
    const m = this.part(parent, geo, this.mossMat, x, y, z, { climbable: true, outline });
    if (scale) m.scale.set(...scale);
    if (tufts > 0) this.addTufts(m, tufts);
    return m;
  }

  addTufts(mesh, density) {
    const geo = mesh.geometry;
    geo.computeBoundingBox();
    const sampler = new MeshSurfaceSampler(new THREE.Mesh(geo)).build();
    const pos = geo.attributes.position;
    const idx = geo.index;
    let area = 0;
    const tri = new THREE.Triangle();
    const triCount = idx ? idx.count / 3 : pos.count / 3;
    for (let i = 0; i < triCount; i++) {
      const i0 = idx ? idx.getX(i * 3) : i * 3;
      const i1 = idx ? idx.getX(i * 3 + 1) : i * 3 + 1;
      const i2 = idx ? idx.getX(i * 3 + 2) : i * 3 + 2;
      tri.a.fromBufferAttribute(pos, i0);
      tri.b.fromBufferAttribute(pos, i1);
      tri.c.fromBufferAttribute(pos, i2);
      area += tri.getArea();
    }
    const s = mesh.scale;
    area *= (s.x * s.y + s.y * s.z + s.x * s.z) / 3;
    const count = Math.min(900, Math.floor(area * 2.2 * density));
    if (count <= 0) return;
    const inst = new THREE.InstancedMesh(tuftGeo, this.tuftMat, count);
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const M = new THREE.Matrix4();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      sampler.sample(p, n);
      q.setFromUnitVectors(up, n);
      const k = 0.7 + Math.random() * 0.8;
      sc.set(k / s.x, k / s.y, k / s.z);
      M.compose(p, q, sc);
      inst.setMatrixAt(i, M);
    }
    inst.raycast = () => {};
    inst.castShadow = false;
    mesh.add(inst);
  }

  crystal(parent, x, y, z, { hp = 100, size = 1, onBreak = null, label = '' } = {}) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    const geo = new THREE.OctahedronGeometry(0.9 * size, 0);
    geo.scale(1, 1.6, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff5fcf });
    const mesh = new THREE.Mesh(geo, mat);
    g.add(mesh);
    addOutline(mesh, 0.06, 0x5a1a5a);
    const glow = makeGlowSprite(0xff7be0, 4.5 * size);
    g.add(glow);
    const wp = { colossus: this, mesh: g, crystal: mesh, glow, hp, maxHp: hp, broken: false, onBreak, size, label, hitFlash: 0 };
    this.weakPoints.push(wp);
    return wp;
  }

  eye(parent, x, y, z, r = 0.5) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), this.eyeMat);
    m.position.set(x, y, z);
    parent.add(m);
    const glow = makeGlowSprite(0xc77dff, r * 5);
    m.add(glow);
    this.eyes.push({ m, glow });
    return m;
  }

  /** Capsule between two anchor objects (world-space each frame), for ground collision. */
  capsule(objA, offA, objB, offB, r) {
    this.capsules.push({ objA, offA: new THREE.Vector3(...offA), objB, offB: new THREE.Vector3(...offB), r, a: new THREE.Vector3(), b: new THREE.Vector3() });
  }

  // --- runtime ----------------------------------------------------------------
  refreshCapsules() {
    for (const c of this.capsules) {
      c.a.copy(c.offA).applyMatrix4(c.objA.matrixWorld);
      c.b.copy(c.offB).applyMatrix4(c.objB.matrixWorld);
    }
  }

  nearBody(pos, margin) {
    _c.copy(this.root.position);
    _c.y += this.cfg.centerY;
    return _c.distanceTo(pos) < this.cfg.radius + margin;
  }

  /** Push a body (feet position) out of the colossus' collision capsules. */
  pushOut(pos, radius, horizontal) {
    if (!this.nearBody(pos, 3)) return false;
    let hit = false;
    _p.copy(pos);
    _p.y += 0.9;
    for (const c of this.capsules) {
      const ab = _b.subVectors(c.b, c.a);
      const t = Math.max(0, Math.min(1, _a.subVectors(_p, c.a).dot(ab) / Math.max(ab.lengthSq(), 1e-6)));
      const closest = _a.copy(c.a).addScaledVector(ab, t);
      const d = _b.subVectors(_p, closest);
      if (horizontal) {
        if (Math.abs(d.y) > c.r + 0.9) continue;
        const vert = Math.min(Math.abs(d.y), c.r);
        const rr = Math.sqrt(Math.max(0, c.r * c.r - vert * vert));
        d.y = 0;
        const len = d.length();
        const min = rr + radius;
        if (len < min) {
          if (len < 1e-4) d.set(1, 0, 0);
          else d.multiplyScalar(1 / len);
          pos.x += d.x * (min - len);
          pos.z += d.z * (min - len);
          _p.x = pos.x;
          _p.z = pos.z;
          hit = true;
        }
      } else {
        const len = d.length();
        const min = c.r + radius;
        if (len < min) {
          if (len < 1e-4) d.set(0, 1, 0);
          else d.multiplyScalar(1 / len);
          pos.addScaledVector(d, min - len);
          _p.addScaledVector(d, min - len);
          hit = true;
        }
      }
    }
    return hit;
  }

  startShake(duration, strength = 1) {
    const active = this.shakeTimer > 0;
    this.shakeTimer = Math.max(this.shakeTimer, duration);
    this.shakeStrength = active ? Math.max(this.shakeStrength, strength) : strength;
  }

  playerOnMe() {
    const p = this.game.player;
    return p.state === 'climb' && p.attach && p.attach.colossus === this;
  }

  playerPart() {
    const p = this.game.player;
    return this.playerOnMe() ? p.attach.mesh : null;
  }

  hitWeakPoint(wp, dmg, power) {
    if (wp.broken || this.freed) return;
    const g = this.game;
    wp.hp -= dmg;
    wp.hitFlash = 1;
    const pos = wp.mesh.getWorldPosition(new THREE.Vector3());
    g.particles.burst(pos, 14 + Math.floor(power * 30), 0xff8fe0, { speed: 6 + power * 6, size: 0.5, life: 0.9, gravity: -4, up: 3 });
    g.particles.burst(pos, 6 + Math.floor(power * 10), 0xfff3c4, { speed: 4, size: 0.4, life: 0.7, gravity: -2, up: 2 });
    g.cameraRig.addShake(0.2 + power * 0.5);
    this.startShake(1.4 + power, 1.2);
    this.flash = 1;
    g.audio.groan();
    g.hitStop(0.05 + power * 0.08);
    if (wp.hp <= 0) {
      wp.broken = true;
      wp.crystal.visible = false;
      wp.glow.visible = false;
      g.audio.shatter();
      g.particles.burst(pos, 60, 0xff9be6, { speed: 10, size: 0.7, life: 1.4, gravity: -5, up: 4 });
      g.particles.burst(pos, 30, 0xfff6b0, { speed: 6, size: 0.6, life: 1.6, gravity: -2, up: 4 });
      // A tiny golden flower grows where the gloom crystal was.
      const flower = new THREE.Mesh(new THREE.OctahedronGeometry(0.5 * wp.size, 0), toonMaterial(0xffd84a, { emissive: 0x7a5a00 }));
      flower.scale.y = 0.5;
      wp.mesh.add(flower);
      wp.mesh.add(makeGlowSprite(0xffe08a, 3 * wp.size));
      wp.onBreak?.();
      if (this.weakPoints.every((w) => w.broken)) this.free();
      else g.hud.toast(`Crystal purified! ${this.weakPoints.filter((w) => !w.broken).length} left.`);
    }
  }

  free() {
    this.freed = true;
    this.freedTimer = 0;
    this.shakeTimer = 0;
    this.eyeMat.color.set(0xffe08a);
    for (const e of this.eyes) e.glow.material.color.set(0xffe08a);
    this.game.onColossusFreed(this);
  }

  updateCommon(dt) {
    this.time += dt;
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      this.shake = Math.min(1, this.shakeStrength) * Math.min(1, this.shakeTimer * 2);
    } else this.shake = Math.max(0, this.shake - dt * 3);

    this.flash = Math.max(0, this.flash - dt * 3);
    const tint = this.flash * 0.6;
    this.stoneMat.emissive.setRGB(tint, tint * 0.4, tint * 0.8);
    this.mossMat.emissive.setRGB(tint * 0.6, tint * 0.2, tint * 0.6);

    for (const wp of this.weakPoints) {
      if (wp.broken) {
        wp.mesh.rotation.y += dt;
        continue;
      }
      wp.hitFlash = Math.max(0, wp.hitFlash - dt * 4);
      const pulse = 1 + Math.sin(this.time * 4) * 0.08 + wp.hitFlash * 0.4;
      wp.crystal.scale.setScalar(pulse);
      wp.crystal.rotation.y += dt * 0.8;
      wp.crystal.material.color.setRGB(1, 0.37 + wp.hitFlash * 0.6, 0.81 + wp.hitFlash * 0.2);
      wp.glow.material.opacity = 0.6 + Math.sin(this.time * 4) * 0.25;
    }

    // Gloom wisps drift off a restless guardian.
    if (!this.freed && this.meshes.length && Math.random() < dt * 10) {
      const m = this.meshes[Math.floor(Math.random() * this.meshes.length)];
      m.getWorldPosition(_a);
      _a.x += (Math.random() - 0.5) * 3;
      _a.z += (Math.random() - 0.5) * 3;
      this.game.particles.spawn(_a, _b.set(0, 1.5 + Math.random(), 0), 0x9a5cff, 1.2, 2.2, 0);
    }
    if (this.freed) {
      this.freedTimer += dt;
      if (this.freedTimer < 6 && Math.random() < dt * 30) {
        const m = this.meshes[Math.floor(Math.random() * this.meshes.length)];
        m.getWorldPosition(_a);
        _a.x += (Math.random() - 0.5) * 4;
        _a.z += (Math.random() - 0.5) * 4;
        this.game.particles.spawn(_a, _b.set(0, 2 + Math.random() * 2, 0), Math.random() < 0.5 ? 0xffe08a : 0xffffff, 0.8, 2.5, 0);
      }
    }
    for (const e of this.eyes) e.glow.material.opacity = 0.7 + Math.sin(this.time * 2) * 0.2;

    this.root.updateMatrixWorld(true);
    this.refreshCapsules();
  }

  /** World-space point the focus camera aims at. */
  focusPoint(target) {
    return target.copy(this.root.position).setY(this.root.position.y + this.cfg.centerY);
  }
}

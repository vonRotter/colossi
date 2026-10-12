import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Colossus } from './Colossus.js';
import { lerpAngle } from '../player.js';

const rb = (w, h, d, r = 0.5) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

// Bramblestone: a towering biped with mossy "trousers" up the back of its legs.
export class Golem extends Colossus {
  constructor(game, home) {
    super(game, {
      name: 'Bramblestone',
      title: 'The Sleepy Sentinel',
      home,
      centerY: 11,
      radius: 15,
      stone: 0xbdb4a4,
      stoneDark: 0x958c7e,
      moss: 0x67b84a,
    });
    this.heading = Math.PI * 0.75;
    this.walkPhase = 0;
    this.speed = 0;
    this.state = 'idle';
    this.stateTimer = 0;
    this.shakeCooldown = 4;
    this.kneelTimer = 0;
    this.kneel = 0;
    this.stomp = null;
    this.stompCooldown = 2;
    this.build();
  }

  build() {
    const S = this.stoneMat;
    const D = this.stoneDark;
    const pelvis = new THREE.Group();
    pelvis.position.y = 10.8;
    this.root.add(pelvis);
    this.part(pelvis, rb(6.2, 2.6, 3.6, 0.8), D, 0, 0, 0);
    this.moss(pelvis, rb(5.2, 2.4, 0.7, 0.3), 0, -0.1, -1.85);

    const legs = [];
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(1.9 * side, -0.7, 0);
      pelvis.add(hip);
      this.part(hip, rb(2.5, 5.2, 2.7, 0.9), S, 0, -2.5, 0);
      this.moss(hip, rb(2.1, 5.0, 0.7, 0.3), 0, -2.6, -1.35);
      const knee = new THREE.Group();
      knee.position.y = -5.1;
      hip.add(knee);
      this.part(knee, new THREE.SphereGeometry(1.35, 14, 10), D, 0, 0, 0);
      this.part(knee, rb(2.3, 4.6, 2.4, 0.8), S, 0, -2.4, 0);
      this.moss(knee, rb(1.9, 4.6, 0.7, 0.3), 0, -2.2, -1.2);
      const ankle = new THREE.Group();
      ankle.position.y = -4.6;
      knee.add(ankle);
      const foot = this.part(ankle, rb(3.0, 1.2, 4.4, 0.5), D, 0, -0.5, 0.6);
      legs.push({ hip, knee, ankle, foot, side });
    }
    this.legs = legs;

    const spine = new THREE.Group();
    spine.position.y = 1.0;
    pelvis.add(spine);
    this.part(spine, rb(8.2, 7.2, 4.8, 1.6), S, 0, 3.8, 0);
    // Chest emblem
    this.part(spine, new THREE.CylinderGeometry(1.2, 1.2, 0.4, 20).rotateX(Math.PI / 2), D, 0, 4.2, 2.45, { outline: 0.05 });
    this.moss(spine, rb(6.4, 7.3, 0.8, 0.35), 0, 3.35, -2.45);
    this.moss(spine, rb(7.2, 0.9, 4.6, 0.35), 0, 7.45, -0.62);
    // Shoulder pads
    for (const side of [-1, 1]) {
      this.part(spine, new THREE.SphereGeometry(1.9, 16, 12), D, 4.3 * side, 6.4, 0);
    }

    const neck = new THREE.Group();
    neck.position.set(0, 7.8, 0.4);
    spine.add(neck);
    this.part(neck, rb(3.4, 3.1, 3.3, 1.0), S, 0, 1.6, 0);
    this.moss(neck, rb(3.0, 0.6, 3.0, 0.25), 0, 3.2, -0.1);
    this.moss(neck, rb(2.8, 2.6, 0.6, 0.25), 0, 1.6, -1.75);
    this.eye(neck, -0.75, 1.9, 1.62, 0.42);
    this.eye(neck, 0.75, 1.9, 1.62, 0.42);
    // A little stone nose and leafy sprout on top
    this.part(neck, new THREE.SphereGeometry(0.4, 10, 8), D, 0, 1.3, 1.7, { collide: false, outline: 0.04 });
    const sprout = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 6), this.tuftMat);
    sprout.position.set(0.9, 3.9, 0.6);
    sprout.rotation.z = -0.4;
    neck.add(sprout);

    const arms = [];
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(4.9 * side, 6.0, 0);
      spine.add(shoulder);
      this.part(shoulder, rb(2.2, 5.0, 2.2, 0.8), S, 0, -2.5, 0);
      const elbow = new THREE.Group();
      elbow.position.y = -5.0;
      shoulder.add(elbow);
      this.part(elbow, rb(2.0, 4.4, 2.0, 0.8), S, 0, -2.2, 0);
      const hand = this.part(elbow, rb(2.7, 2.5, 2.7, 0.9), D, 0, -5.0, 0);
      arms.push({ shoulder, elbow, hand, side });
    }
    this.arms = arms;
    this.pelvis = pelvis;
    this.spine = spine;
    this.neck = neck;

    // Weak points
    const [legL] = legs;
    this.crystal(legL.knee, 0, -3.3, -1.75, {
      hp: 70,
      size: 0.8,
      label: 'calf',
      onBreak: () => {
        this.kneelTimer = 9;
        this.game.hud.toast('Bramblestone stumbles to one knee!');
      },
    });
    this.crystal(spine, 0, 5.4, -2.95, { hp: 100, label: 'back' });
    this.crystal(neck, 0, 3.75, 0.2, { hp: 110, size: 1.1, label: 'head' });

    // Collision capsules (for walking into it on the ground)
    for (const L of legs) {
      this.capsule(L.hip, [0, 0, 0], L.knee, [0, 0, 0], 1.45);
      this.capsule(L.knee, [0, 0, 0], L.ankle, [0, 0, 0], 1.3);
      this.capsule(L.ankle, [0, -0.4, -0.6], L.ankle, [0, -0.4, 2.0], 0.8);
    }
    for (const A of arms) this.capsule(A.elbow, [0, 0, 0], A.elbow, [0, -5.0, 0], 1.3);
    this.capsule(pelvis, [-2, 0, 0], pelvis, [2, 0, 0], 1.6);
    this.capsule(spine, [0, 2, 0], spine, [0, 6, 0], 2.6);
  }

  place(terrain) {
    this.terrain = terrain;
    this.root.position.set(this.home.x, terrain.getHeight(this.home.x, this.home.z), this.home.z);
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    const toPlayer = _v.subVectors(p.position, this.root.position).setY(0);
    const dist = toPlayer.length();
    const onMe = this.playerOnMe();
    let targetSpeed = 0;
    this.aggro = !this.freed && (onMe || (dist < 110 && p.state !== 'ko'));

    if (this.freed) {
      this.kneel = Math.min(1, this.kneel + dt * 0.5);
    } else {
      if (this.kneelTimer > 0) {
        this.kneelTimer -= dt;
        this.kneel = Math.min(1, this.kneel + dt * 1.2);
      } else this.kneel = Math.max(0, this.kneel - dt * 0.4);

      if (onMe) {
        this.shakeCooldown -= dt;
        const part = this.playerPart();
        const onHead = part && part.parent === this.neck;
        if (this.shakeCooldown <= 0) {
          this.startShake(2.4, onHead ? 1 : 0.85);
          this.shakeCooldown = (onHead ? 4 : 6.5) + Math.random() * 3;
          g.audio.groan();
          g.audio.rumble();
        }
      } else if (this.aggro && this.kneel < 0.05) {
        // Turn towards the player and lumber closer.
        const want = Math.atan2(toPlayer.x, toPlayer.z);
        // Slow to turn when you're right at its feet, so you can sneak behind.
        const turn = dist < 16 ? 0.12 : 0.55;
        this.heading = lerpAngle(this.heading, want, Math.min(1, dt * turn));
        if (dist > 11 && !this.stomp) targetSpeed = 2.6;
        this.stompCooldown -= dt;
        if (!this.stomp && this.stompCooldown <= 0 && p.state !== 'climb') this.tryStomp();
      } else if (!this.aggro) {
        // Wander back home slowly.
        const toHome = _v2.subVectors(this.home, this.root.position).setY(0);
        if (toHome.length() > 25) {
          this.heading = lerpAngle(this.heading, Math.atan2(toHome.x, toHome.z), Math.min(1, dt * 0.4));
          targetSpeed = 1.6;
        }
      }
    }

    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 1.5);
    if (this.speed > 0.05) {
      this.root.position.x += Math.sin(this.heading) * this.speed * dt;
      this.root.position.z += Math.cos(this.heading) * this.speed * dt;
      // Stay in the arena.
      const off = _v2.subVectors(this.root.position, this.home).setY(0);
      if (off.length() > 120) {
        off.setLength(120);
        this.root.position.x = this.home.x + off.x;
        this.root.position.z = this.home.z + off.z;
      }
      this.walkPhase += dt * this.speed * 0.42;
    }
    this.root.position.y = this.terrain.getHeight(this.root.position.x, this.root.position.z) - 0.1;
    this.root.rotation.y = this.heading;

    this.animate(dt);
    this.updateCommon(dt);
    this.updateStomp(dt);
  }

  tryStomp() {
    const p = this.game.player;
    let best = null;
    for (const L of this.legs) {
      const fp = L.foot.getWorldPosition(new THREE.Vector3());
      const d = Math.hypot(fp.x - p.position.x, fp.z - p.position.z);
      if (d < 9 && (!best || d < best.d)) best = { L, d };
    }
    if (best) {
      this.stomp = { L: best.L, t: 0 };
      this.game.audio.groan();
    }
  }

  updateStomp(dt) {
    const st = this.stomp;
    if (!st) return;
    st.t += dt;
    if (st.t > 1.55 && !st.slammed) {
      st.slammed = true;
      const g = this.game;
      const fp = st.L.foot.getWorldPosition(new THREE.Vector3());
      fp.y = g.terrain.getHeight(fp.x, fp.z);
      g.shockwaves.spawn(fp, 9);
      g.audio.stomp();
      g.cameraRig.addShake(0.8);
      g.particles.burst(fp, 40, 0xe9dcc0, { speed: 9, size: 1.1, life: 1.0, gravity: -3, up: 2 });
      const p = g.player;
      const d = Math.hypot(fp.x - p.position.x, fp.z - p.position.z);
      if (d < 6 && p.position.y - fp.y < 2.5 && p.state !== 'climb') p.damage(1, fp);
      else if (g.horse.position.distanceTo(fp) < 6 && p.state === 'mounted') p.damage(1, fp);
    }
    if (st.t > 2.4) {
      this.stomp = null;
      this.stompCooldown = 3 + Math.random() * 2;
    }
  }

  animate(dt) {
    const t = this.time;
    const k = Math.min(1, dt * 6);
    const ph = this.walkPhase;
    const walk = Math.min(1, this.speed / 2);
    const kn = this.kneel;
    const sh = this.shake;
    const lerp = (o, prop, v) => (o[prop] += (v - o[prop]) * k);

    for (const L of this.legs) {
      const off = L.side > 0 ? Math.PI : 0;
      let hip = -Math.sin(ph + off) * 0.38 * walk;
      let knee = Math.max(0, Math.cos(ph + off)) * 0.7 * walk;
      if (this.stomp && this.stomp.L === L) {
        const s = this.stomp.t;
        const lift = s < 1.1 ? Math.min(1, s / 0.9) : s < 1.55 ? 1 - (s - 1.1) / 0.45 : 0;
        const e = lift * lift * (3 - 2 * lift);
        hip = -0.75 * e;
        knee = 1.1 * e;
      }
      // Kneeling: left knee down, right foot planted.
      if (L.side < 0) {
        hip = hip * (1 - kn) + -0.25 * kn;
        knee = knee * (1 - kn) + 1.7 * kn;
      } else {
        hip = hip * (1 - kn) + -1.35 * kn;
        knee = knee * (1 - kn) + 1.45 * kn;
      }
      lerp(L.hip.rotation, 'x', hip);
      lerp(L.knee.rotation, 'x', knee);
      lerp(L.ankle.rotation, 'x', -(hip + knee) * 0.9);
    }
    const bob = Math.abs(Math.cos(ph)) * 0.35 * walk;
    lerp(this.pelvis.position, 'y', 10.8 - bob - kn * 4.2);
    this.pelvis.rotation.z = Math.sin(ph) * 0.04 * walk;

    // Spine: breathing, kneel lean, shaking.
    const shakeX = Math.sin(t * 17) * 0.09 * sh + Math.sin(t * 7.3) * 0.05 * sh;
    const shakeZ = Math.sin(t * 13.1) * 0.11 * sh;
    this.spine.rotation.x = 0.06 + kn * 0.3 + Math.sin(t * 0.8) * 0.015 + shakeX;
    this.spine.rotation.z = shakeZ;
    this.spine.rotation.y = Math.sin(t * 9) * 0.05 * sh;
    this.neck.rotation.x = kn * 0.25 + (this.freed ? 0.3 : 0) + Math.sin(t * 11) * 0.12 * sh;
    this.neck.rotation.y = Math.sin(t * 5) * 0.25 * sh;

    for (const A of this.arms) {
      const swing = Math.sin(ph + (A.side > 0 ? 0 : Math.PI)) * 0.3 * walk;
      let ax = swing + Math.sin(t * 6 + A.side) * 0.5 * sh;
      let az = A.side * (0.12 + sh * 0.5 * Math.abs(Math.sin(t * 4)));
      let ex = -0.25 - sh * 0.6;
      if (kn > 0) {
        ax = ax * (1 - kn) + -0.5 * kn;
        ex = ex * (1 - kn) + -0.9 * kn;
      }
      lerp(A.shoulder.rotation, 'x', ax);
      lerp(A.shoulder.rotation, 'z', az);
      lerp(A.elbow.rotation, 'x', ex);
    }
  }
}

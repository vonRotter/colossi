import * as THREE from 'three';
import { toonMaterial, addOutline } from './materials.js';
import { WATER_LEVEL } from './world/layout.js';
import { lerpAngle } from './player.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

// Clover, a sturdy little pony who comes when you whistle.
export class Horse {
  constructor(game) {
    this.game = game;
    this.position = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.speed = 0;
    this.vy = 0;
    this.onGround = true;
    this.state = 'idle'; // idle | follow | ridden
    this.phase = 0;
    this.idleTimer = 0;
    this.wanderYaw = 0;
    this.build();
  }

  build() {
    const coat = toonMaterial(0xf4e6cf);
    const spots = toonMaterial(0xc98a55);
    const mane = toonMaterial(0x9b5a34);
    const hoof = toonMaterial(0x4a3a35);
    const saddle = toonMaterial(0xd2483f);
    const dark = new THREE.MeshBasicMaterial({ color: 0x2a2030 });

    const g = new THREE.Group();
    const body = new THREE.Group();
    body.position.y = 1.35;
    g.add(body);
    const add = (parent, geo, mat, x, y, z, o = 0.035) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      if (o) addOutline(m, o);
      return m;
    };
    const torsoGeo = new THREE.CapsuleGeometry(0.5, 1.2, 6, 14);
    torsoGeo.rotateX(Math.PI / 2);
    add(body, torsoGeo, coat, 0, 0, 0);
    add(body, new THREE.SphereGeometry(0.3, 10, 8), spots, 0.32, 0.18, -0.3, 0).scale.set(0.6, 0.9, 1.2);
    add(body, new THREE.SphereGeometry(0.25, 10, 8), spots, -0.33, 0.1, 0.25, 0).scale.set(0.6, 0.9, 1.2);
    const saddleGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.6, 14, 1, true, -Math.PI / 2 - 0.9, 1.8);
    saddleGeo.rotateZ(Math.PI / 2);
    const s = add(body, saddleGeo, saddle, 0, 0.04, -0.05, 0);
    s.material = toonMaterial(0xd2483f, { side: THREE.DoubleSide });

    const neck = new THREE.Group();
    neck.position.set(0, 0.25, 0.85);
    body.add(neck);
    const neckGeo = new THREE.CapsuleGeometry(0.26, 0.6, 5, 10);
    neckGeo.translate(0, 0.35, 0);
    add(neck, neckGeo, coat, 0, 0, 0);
    neck.rotation.x = 0.55;
    const head = new THREE.Group();
    head.position.set(0, 0.8, 0.05);
    neck.add(head);
    const headGeo = new THREE.CapsuleGeometry(0.22, 0.45, 5, 10);
    headGeo.rotateX(Math.PI / 2);
    const hd = add(head, headGeo, coat, 0, 0, 0.25);
    hd.rotation.x = 0.9 - 0.55;
    add(head, new THREE.SphereGeometry(0.05, 8, 6), dark, 0.19, 0.08, 0.15, 0);
    add(head, new THREE.SphereGeometry(0.05, 8, 6), dark, -0.19, 0.08, 0.15, 0);
    const earGeo = new THREE.ConeGeometry(0.07, 0.22, 6);
    add(head, earGeo, coat, 0.12, 0.27, 0.0, 0.02).rotation.z = -0.3;
    add(head, earGeo, coat, -0.12, 0.27, 0.0, 0.02).rotation.z = 0.3;
    for (let i = 0; i < 5; i++) {
      add(neck, new THREE.SphereGeometry(0.14, 8, 6), mane, 0, 0.15 + i * 0.16, -0.18, 0.02).scale.set(0.6, 1, 1);
    }
    const tail = new THREE.Group();
    tail.position.set(0, 0.25, -0.98);
    body.add(tail);
    const tailGeo = new THREE.ConeGeometry(0.16, 0.9, 8);
    tailGeo.translate(0, -0.45, 0);
    add(tail, tailGeo, mane, 0, 0, 0, 0.02);
    tail.rotation.x = 0.5;

    const legs = [];
    const legGeo = new THREE.CapsuleGeometry(0.11, 0.55, 4, 8);
    legGeo.translate(0, -0.35, 0);
    const shinGeo = new THREE.CapsuleGeometry(0.09, 0.4, 4, 8);
    shinGeo.translate(0, -0.25, 0);
    for (const [x, z, front] of [[0.28, 0.65, 1], [-0.28, 0.65, 1], [0.28, -0.7, 0], [-0.28, -0.7, 0]]) {
      const hip = new THREE.Group();
      hip.position.set(x, -0.2, z);
      body.add(hip);
      add(hip, legGeo, coat, 0, 0, 0, 0.025);
      const knee = new THREE.Group();
      knee.position.y = -0.68;
      hip.add(knee);
      add(knee, shinGeo, coat, 0, 0, 0, 0.025);
      add(knee, new THREE.CylinderGeometry(0.11, 0.13, 0.14, 8), hoof, 0, -0.5, 0, 0.02);
      legs.push({ hip, knee, front, side: x > 0 ? 1 : -1 });
    }
    this.legs = legs;
    this.body = body;
    this.neck = neck;
    this.head = head;
    this.tail = tail;
    this.root = g;
  }

  spawn(pos, yaw) {
    this.position.copy(pos);
    this.yaw = yaw;
    this.speed = 0;
  }

  canMount(p) {
    return this.state !== 'ridden' && this.position.distanceTo(p) < 3.2;
  }

  mount() {
    this.state = 'ridden';
    this.game.audio.tone(520, 0.2, { type: 'triangle', vol: 0.06, slide: 1.3 });
  }

  dismount() {
    this.state = 'idle';
    this.idleTimer = 2;
  }

  whistle(playerPos) {
    if (this.state === 'ridden') return;
    const d = this.position.distanceTo(playerPos);
    if (d > 220) {
      // Too far to hear clearly: trot in from just out of sight.
      const dir = _v.subVectors(this.position, playerPos).setY(0).normalize();
      this.position.copy(playerPos).addScaledVector(dir, 70);
      this.position.y = this.game.terrain.getHeight(this.position.x, this.position.z);
    }
    this.state = 'follow';
  }

  saddle(target) {
    const up = _v.set(0, 1.62, -0.08);
    up.applyAxisAngle(_v2.set(1, 0, 0), this.pitch);
    up.applyAxisAngle(_v2.set(0, 1, 0), this.yaw);
    target.copy(this.position).add(up);
    target.y += this.body.position.y - 1.35;
    return target;
  }

  update(dt) {
    const g = this.game;
    const input = g.input;
    let targetSpeed = 0;
    let turnTo = null;

    if (this.state === 'ridden') {
      const mv = g.player.moveVector(_v);
      const mag = Math.min(1, mv.length());
      if (mag > 0.1) {
        turnTo = Math.atan2(mv.x, mv.z);
        targetSpeed = input.held('sprint') ? 19 : mag > 0.6 ? 10.5 : 4.5;
      }
      if (input.pressed('jump') && this.onGround && this.speed > 2) {
        this.vy = 6.8;
        this.onGround = false;
        g.audio.jump();
      }
    } else if (this.state === 'follow') {
      const to = _v.subVectors(g.player.position, this.position).setY(0);
      const d = to.length();
      if (d < 3.5) {
        this.state = 'idle';
        this.idleTimer = 4;
      } else {
        turnTo = Math.atan2(to.x, to.z);
        targetSpeed = d > 30 ? 18 : d > 10 ? 10 : 4;
      }
    } else {
      this.idleTimer -= dt;
      if (this.idleTimer < 0) {
        this.idleTimer = 3 + Math.random() * 5;
        this.wanderYaw = this.yaw + (Math.random() - 0.5) * 2;
        this.wandering = Math.random() < 0.5;
      }
      if (this.wandering) {
        turnTo = this.wanderYaw;
        targetSpeed = 1.2;
      }
    }

    if (turnTo !== null) {
      const turnRate = this.speed > 14 ? 2.4 : 4;
      const before = this.yaw;
      this.yaw = lerpAngle(this.yaw, turnTo, 1 - Math.exp(-dt * turnRate));
      this.turnVel = (this.yaw - before) / dt;
    } else this.turnVel = 0;

    const accel = targetSpeed > this.speed ? 9 : 14;
    this.speed += Math.max(-accel * dt, Math.min(accel * dt, targetSpeed - this.speed));

    const fwd = _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    // Refuse deep water.
    const ahead = g.terrain.getHeight(this.position.x + fwd.x * 2.5, this.position.z + fwd.z * 2.5);
    if (ahead < WATER_LEVEL - 0.8 && this.speed > 0) {
      this.speed = Math.max(0, this.speed - 40 * dt);
      if (this.state === 'ridden' && Math.random() < dt * 2) g.hud.toast('Clover won\'t swim that deep!');
    }
    // Uphill slowdown
    const slope = (ahead - g.terrain.getHeight(this.position.x, this.position.z)) / 2.5;
    if (slope > 0.6) this.speed *= Math.max(0.2, 1 - (slope - 0.6) * 2 * dt * 10);

    this.position.addScaledVector(fwd, this.speed * dt);
    const r = Math.hypot(this.position.x, this.position.z);
    if (r > 735) {
      this.position.x *= 735 / r;
      this.position.z *= 735 / r;
    }
    if (g.colliders.resolve(this.position, 0.75)) this.speed *= 0.9;
    for (const c of g.colossi) c.pushOut(this.position, 0.9, true);

    const h = g.terrain.getHeight(this.position.x, this.position.z);
    if (!this.onGround) {
      this.vy -= 24 * dt;
      this.position.y += this.vy * dt;
      if (this.position.y <= h) {
        this.position.y = h;
        this.onGround = true;
        this.vy = 0;
        g.particles.burst(_v2.copy(this.position), 10, 0xe9e1c8, { speed: 3, size: 0.5, life: 0.6, gravity: 0, up: 0.5 });
      }
    } else {
      this.position.y = h;
    }
    const hf = g.terrain.getHeight(this.position.x + fwd.x, this.position.z + fwd.z);
    const hb = g.terrain.getHeight(this.position.x - fwd.x, this.position.z - fwd.z);
    const targetPitch = -Math.atan2(hf - hb, 2) * 0.8;
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 8);

    this.animate(dt);
  }

  animate(dt) {
    const sp = this.speed;
    const gallop = sp > 12;
    this.phase += dt * (gallop ? 9.5 : 3 + sp * 0.7);
    const amp = Math.min(1, sp / 6) * (gallop ? 0.9 : 0.6);
    for (const L of this.legs) {
      let off;
      if (gallop) off = L.front ? (L.side > 0 ? 0 : 0.4) : L.side > 0 ? Math.PI : Math.PI + 0.4;
      else off = (L.front ? 0 : Math.PI) + (L.side > 0 ? 0 : Math.PI);
      const s = Math.sin(this.phase + off);
      L.hip.rotation.x = s * amp;
      L.knee.rotation.x = Math.max(0, Math.cos(this.phase + off)) * amp * (L.front ? -1.2 : 1.2);
    }
    const bob = gallop ? Math.abs(Math.sin(this.phase)) * 0.18 : Math.abs(Math.sin(this.phase)) * 0.05 * amp;
    this.body.position.y = 1.35 + bob;
    this.body.rotation.x = gallop ? Math.sin(this.phase) * 0.08 : 0;
    this.body.rotation.z = -(this.turnVel || 0) * 0.03;
    const t = performance.now() / 1000;
    this.neck.rotation.x = 0.55 + (gallop ? Math.sin(this.phase) * 0.12 : 0) + (sp < 0.5 && this.state === 'idle' ? Math.max(0, Math.sin(t * 0.4)) * 0.9 : 0);
    this.tail.rotation.x = 0.5 + Math.min(1, sp / 15) * 0.7;
    this.tail.rotation.z = Math.sin(t * 3) * 0.2;
    this.root.position.copy(this.position);
    this.root.rotation.set(0, this.yaw, 0);
    this.root.rotateX(this.pitch);
  }
}

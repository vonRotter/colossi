import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Colossus } from './Colossus.js';
import { lerpAngle } from '../player.js';
import { makeGlowSprite } from '../materials.js';

const rb = (w, h, d, r = 0.5) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

function capsuleZ(r, len) {
  const g = new THREE.CapsuleGeometry(r, len, 6, 16);
  g.rotateX(Math.PI / 2); // along +z
  return g;
}

// Mossback: a lumbering island-turtle. Climb its swishing tail to reach the shell.
export class Turtle extends Colossus {
  constructor(game, home) {
    super(game, {
      name: 'Mossback',
      title: 'The Wandering Hill',
      home,
      centerY: 7,
      radius: 26,
      stone: 0xb9b6a0,
      stoneDark: 0x8d8a74,
      moss: 0x5fb64e,
    });
    this.heading = -Math.PI / 3;
    this.speed = 0;
    this.walkPhase = 0;
    this.wanderTarget = new THREE.Vector3().copy(this.home);
    this.wanderTimer = 0;
    this.buckCooldown = 6;
    this.buck = 0;
    this.buckTimer = 0;
    this.bubbleCooldown = 3;
    this.bubbles = [];
    this.slam = null;
    this.slamCooldown = 3;
    this.build();
  }

  build() {
    const S = this.stoneMat;
    const D = this.stoneDark;

    // Pivot at the rear so the turtle can rear up on its back legs.
    const pivot = new THREE.Group();
    pivot.position.set(0, 4.6, -8);
    this.root.add(pivot);
    const body = new THREE.Group();
    body.position.set(0, 2.4, 8);
    pivot.add(body);

    const shellGeo = new THREE.SphereGeometry(1, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.62);
    const shellMat = this.stoneMat.clone();
    shellMat.side = THREE.DoubleSide;
    this.shellMat = shellMat;
    const shell = this.part(body, shellGeo, shellMat, 0, 0, 0, { outline: 0 });
    shell.scale.set(11, 6.5, 14);
    const capGeo = new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.5);
    this.moss(body, capGeo, 0, 1.5, 0, { tufts: 1.2, outline: 0, scale: [10.9, 5.4, 13.9] });
    // Rim of shell plates
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 8, 40), D);
    rim.rotation.x = Math.PI / 2;
    rim.scale.set(10.3, 13.2, 6);
    rim.position.y = -2.2;
    body.add(rim);
    // Decorative stone knobs on the shell (not solid)
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const knob = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1, 0), D);
      knob.position.set(Math.cos(a) * 7.5, 4.6, Math.sin(a) * 9.5);
      knob.castShadow = true;
      body.add(knob);
    }

    this.part(body, rb(15, 2.6, 21, 1.2), D, 0, -3.2, 0);

    const legs = [];
    for (const [x, z] of [[7, 8.5], [-7, 8.5], [7, -8.5], [-7, -8.5]]) {
      const hip = new THREE.Group();
      hip.position.set(x, -3.4, z);
      body.add(hip);
      this.part(hip, rb(3.8, 4.6, 3.8, 1.4), S, 0, -1.6, 0);
      this.part(hip, rb(4.4, 1.4, 4.8, 0.6), D, 0, -3.6, 0.4);
      legs.push({ hip, front: z > 0, side: Math.sign(x) });
    }
    this.legs = legs;

    // Neck and head
    const neck = new THREE.Group();
    neck.position.set(0, -0.5, 12.0);
    body.add(neck);
    const neckGeo = capsuleZ(1.8, 5.5);
    neckGeo.translate(0, 0, 3.6);
    this.moss(neck, neckGeo, 0, 0, 0, { tufts: 1.3 });
    const head = new THREE.Group();
    head.position.set(0, 0, 8.2);
    neck.add(head);
    this.part(head, rb(4.4, 3.4, 5.4, 1.4), S, 0, 0.4, 1.6);
    this.part(head, rb(3.6, 1.2, 3.6, 0.5), D, 0, -1.0, 2.4);
    this.moss(head, rb(3.6, 0.6, 3.6, 0.25), 0, 2.3, 1.2);
    this.eye(head, 2.05, 1.0, 3.0, 0.55);
    this.eye(head, -2.05, 1.0, 3.0, 0.55);
    this.mouth = new THREE.Object3D();
    this.mouth.position.set(0, -0.3, 5.0);
    head.add(this.mouth);

    // Tail: a mossy ramp up to the shell
    const tail1 = new THREE.Group();
    tail1.position.set(0, 1.2, -12.2);
    body.add(tail1);
    const t1 = capsuleZ(1.7, 5.2);
    t1.rotateY(Math.PI); // along -z
    t1.translate(0, 0, -3.0);
    this.moss(tail1, t1, 0, 0, 0, { tufts: 1.3, scale: [1.7, 0.85, 1] });
    const tail2 = new THREE.Group();
    tail2.position.set(0, 0, -6.6);
    tail1.add(tail2);
    const t2 = capsuleZ(1.6, 4.4);
    t2.rotateY(Math.PI);
    t2.translate(0, 0, -2.6);
    this.moss(tail2, t2, 0, 0, 0, { tufts: 1.3, scale: [1.6, 0.85, 1] });
    tail1.rotation.x = -0.7;
    tail2.rotation.x = 0.1;

    this.pivot = pivot;
    this.body = body;
    this.neck = neck;
    this.head = head;
    this.tail1 = tail1;
    this.tail2 = tail2;

    this.crystal(body, 0, 7.25, -1.5, {
      hp: 120,
      size: 1.2,
      label: 'shell',
      onBreak: () => this.game.hud.toast('Mossback rumbles... one more crystal on its head!'),
    });
    this.crystal(head, 0, 3.0, 1.2, { hp: 110, size: 1.0, label: 'head' });

    for (const L of legs) this.capsule(L.hip, [0, 0.5, 0], L.hip, [0, -3.6, 0.4], 2.3);
    this.capsule(body, [0, -2.5, -7], body, [0, -2.5, 7], 7.6);
    this.capsule(neck, [0, 0, 0], neck, [0, 0, 7], 1.8);
    this.capsule(head, [0, 0.4, 0], head, [0, 0.4, 3.5], 2.2);
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
    this.aggro = !this.freed && (onMe || (dist < 95 && p.state !== 'ko'));
    let targetSpeed = 0;

    if (!this.freed) {
      if (onMe) {
        this.buckCooldown -= dt;
        const part = this.playerPart();
        const onTail = part && (part.parent === this.tail1 || part.parent === this.tail2);
        if (this.buckCooldown <= 0) {
          if (onTail) {
            this.startShake(1.8, 0.9);
            this.tailFlick = 1.8;
          } else {
            this.buckTimer = 3.2;
            this.startShake(3.2, 0.75);
          }
          g.audio.groan();
          g.audio.rumble();
          this.buckCooldown = 7 + Math.random() * 3;
        }
      } else if (this.aggro) {
        const want = Math.atan2(toPlayer.x, toPlayer.z);
        this.heading = lerpAngle(this.heading, want, Math.min(1, dt * 0.35));
        if (dist > 45) targetSpeed = 1.8;
        const facing = Math.abs(lerpAngle(0, want - this.heading, 1)) < 0.6;
        this.bubbleCooldown -= dt;
        if (this.bubbleCooldown <= 0 && facing && dist > 14 && p.state !== 'climb') {
          this.fireBubble();
          this.bubbleCooldown = 2.6 + Math.random() * 1.6;
        }
        this.slamCooldown -= dt;
        if (!this.slam && this.slamCooldown <= 0 && p.state !== 'climb') {
          const front = _v2.set(Math.sin(this.heading), 0, Math.cos(this.heading)).multiplyScalar(10).add(this.root.position);
          if (Math.hypot(front.x - p.position.x, front.z - p.position.z) < 12) {
            this.slam = { t: 0 };
            g.audio.groan();
          }
        }
      } else {
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0 || this.root.position.distanceTo(this.wanderTarget) < 6) {
          const a = Math.random() * Math.PI * 2;
          this.wanderTarget.set(this.home.x + Math.cos(a) * 35, 0, this.home.z + Math.sin(a) * 35);
          this.wanderTimer = 20;
        }
        const to = _v2.subVectors(this.wanderTarget, this.root.position).setY(0);
        this.heading = lerpAngle(this.heading, Math.atan2(to.x, to.z), Math.min(1, dt * 0.25));
        targetSpeed = 1.3;
      }
    }

    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 1.2);
    if (this.speed > 0.05) {
      this.root.position.x += Math.sin(this.heading) * this.speed * dt;
      this.root.position.z += Math.cos(this.heading) * this.speed * dt;
      this.walkPhase += dt * this.speed * 0.5;
      const off = _v2.subVectors(this.root.position, this.home).setY(0);
      if (off.length() > 90) {
        off.setLength(90);
        this.root.position.x = this.home.x + off.x;
        this.root.position.z = this.home.z + off.z;
      }
    }
    this.root.position.y = this.terrain.getHeight(this.root.position.x, this.root.position.z) - 0.2;
    this.root.rotation.y = this.heading;

    this.animate(dt);
    this.updateCommon(dt);
    this.updateSlam(dt);
    this.updateBubbles(dt);
  }

  fireBubble() {
    const g = this.game;
    const from = this.mouth.getWorldPosition(new THREE.Vector3());
    const target = g.player.position.clone();
    target.y += 1;
    const vel = target.sub(from).normalize().multiplyScalar(13);
    vel.y += 1.5;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xd59bff, transparent: true, opacity: 0.55 })
    );
    mesh.add(makeGlowSprite(0xc77dff, 4));
    mesh.position.copy(from);
    g.scene.add(mesh);
    this.bubbles.push({ mesh, vel, life: 6 });
    g.audio.bubble();
  }

  updateBubbles(dt) {
    const g = this.game;
    const p = g.player;
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.life -= dt;
      // Gentle homing makes them feel alive but dodgeable.
      const to = _v.copy(p.position).setY(p.position.y + 1).sub(b.mesh.position);
      b.vel.addScaledVector(to.normalize(), dt * 3);
      b.vel.y -= dt * 1.2;
      b.mesh.position.addScaledVector(b.vel, dt);
      b.mesh.scale.setScalar(1 + Math.sin(this.time * 10 + i) * 0.08);
      const ground = this.terrain.getHeight(b.mesh.position.x, b.mesh.position.z);
      const hitPlayer = b.mesh.position.distanceTo(_v2.copy(p.position).setY(p.position.y + 0.9)) < 1.7;
      if (hitPlayer && p.state !== 'climb') p.damage(1, b.mesh.position);
      if (hitPlayer || b.life <= 0 || b.mesh.position.y < ground + 0.5 || this.freed) {
        g.particles.burst(b.mesh.position, 20, 0xe2b8ff, { speed: 5, size: 0.5, life: 0.6, gravity: -4, up: 1 });
        g.audio.pop();
        g.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        b.mesh.material.dispose();
        this.bubbles.splice(i, 1);
      }
    }
  }

  updateSlam(dt) {
    const s = this.slam;
    if (!s) return;
    s.t += dt;
    if (s.t > 1.45 && !s.done) {
      s.done = true;
      const g = this.game;
      const fp = _v.set(Math.sin(this.heading), 0, Math.cos(this.heading)).multiplyScalar(9).add(this.root.position);
      fp.y = this.terrain.getHeight(fp.x, fp.z);
      g.shockwaves.spawn(fp, 13);
      g.audio.stomp();
      g.cameraRig.addShake(0.9);
      g.particles.burst(fp, 50, 0xe9dcc0, { speed: 10, size: 1.2, life: 1.1, gravity: -3, up: 2 });
      const p = g.player;
      const d = Math.hypot(fp.x - p.position.x, fp.z - p.position.z);
      if (d < 10 && p.state !== 'climb' && p.position.y - fp.y < 3) p.damage(1, fp);
    }
    if (s.t > 2.6) {
      this.slam = null;
      this.slamCooldown = 4 + Math.random() * 2;
    }
  }

  animate(dt) {
    const t = this.time;
    const k = Math.min(1, dt * 4);
    const walk = Math.min(1, this.speed / 1.5);
    const ph = this.walkPhase;
    const sh = this.shake;

    // Rearing up: from a periodic buck or a slam attack.
    let rear = 0;
    if (this.buckTimer > 0) {
      this.buckTimer -= dt;
      rear = Math.sin(Math.min(1, (3.2 - this.buckTimer) / 3.2) * Math.PI) * 0.33;
    }
    if (this.slam) {
      const s = this.slam.t;
      rear = Math.max(rear, s < 1.15 ? Math.sin(Math.min(1, s / 1.15) * Math.PI * 0.5) * 0.3 : Math.max(0, 0.3 * (1 - (s - 1.15) / 0.3)));
    }
    if (this.freed) rear = 0;
    this.buck += (rear - this.buck) * Math.min(1, dt * (this.slam && this.slam.t > 1.15 ? 14 : 3));
    this.pivot.rotation.x = -this.buck + Math.sin(t * 15) * 0.012 * sh;
    this.pivot.rotation.z = Math.sin(t * 11) * 0.04 * sh;
    this.pivot.position.y = 4.6 + Math.abs(Math.sin(ph * 2)) * 0.2 * walk - (this.freed ? Math.min(1, this.freedTimer * 0.4) * 1.6 : 0);

    for (const L of this.legs) {
      const off = (L.front ? 0 : Math.PI) + (L.side > 0 ? 0 : Math.PI);
      let x = Math.sin(ph + off) * 0.3 * walk;
      if (L.front && this.buck > 0.05) x = -this.buck * 1.5 + Math.sin(t * 5 + L.side) * 0.2;
      if (!L.front) x += this.buck * 1.0;
      L.hip.rotation.x += (x - L.hip.rotation.x) * k;
      L.hip.rotation.z = this.freed ? L.side * Math.min(1, this.freedTimer * 0.4) * 0.35 : 0;
    }

    // Head looks at the player; shakes when the player climbs it.
    const p = this.game.player;
    let yaw = 0;
    if (!this.freed && this.aggro) {
      const local = this.root.worldToLocal(_v.copy(p.position));
      yaw = Math.max(-0.7, Math.min(0.7, Math.atan2(local.x, local.z)));
    }
    const onHead = this.playerOnMe() && (this.playerPart()?.parent === this.head || this.playerPart()?.parent === this.neck);
    const headShake = onHead ? sh * 1.6 : sh * 0.5;
    this.neck.rotation.y += (yaw + Math.sin(t * 9) * 0.35 * headShake - this.neck.rotation.y) * k;
    const pitchTarget = (this.freed ? 0.35 : -0.25) + Math.sin(t * 0.7) * 0.05 + Math.sin(t * 13) * 0.15 * headShake;
    this.neck.rotation.x += (pitchTarget - this.neck.rotation.x) * k;
    this.head.rotation.x = this.slam ? -0.3 : 0;

    // Tail sway; flick throws off anyone not holding on.
    if (this.tailFlick > 0) this.tailFlick -= dt;
    const flick = this.tailFlick > 0 ? 1 : 0;
    this.tail1.rotation.y = Math.sin(t * 0.45) * 0.16 + Math.sin(t * 12) * 0.25 * flick;
    this.tail1.rotation.x = -0.7 - flick * 0.25 * Math.abs(Math.sin(t * 6)) + this.buck * 0.6;
    this.tail2.rotation.y = Math.sin(t * 0.6 + 1) * 0.1;
  }
}

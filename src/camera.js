import * as THREE from 'three';
import { lerpAngle } from './player.js';

const _t = new THREE.Vector3();
const _f = new THREE.Vector3();

export class CameraRig {
  constructor(camera, game) {
    this.camera = camera;
    this.game = game;
    this.yaw = Math.PI;
    this.pitch = 0.25;
    this.distance = 7;
    this.target = new THREE.Vector3();
    this.shakeAmt = 0;
    this.fov = 62;
    this.idleTime = 0;
  }

  addShake(a) {
    this.shakeAmt = Math.min(1.2, this.shakeAmt + a);
  }

  snap(target) {
    this.target.copy(target);
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    const input = g.input;

    this.yaw -= input.look.x;
    this.pitch += input.look.y;
    if (Math.abs(input.look.x) + Math.abs(input.look.y) > 0.0001) this.idleTime = 0;
    else this.idleTime += dt;

    // Focus on the nearest active colossus (SotC's "look at the giant" button).
    const focus = input.held('focus') ? g.nearestColossus(220) : null;
    if (focus) {
      const fp = focus.focusPoint(_f);
      const from = _t.copy(p.position);
      const dx = fp.x - from.x;
      const dz = fp.z - from.z;
      const wantYaw = Math.atan2(-dx, -dz);
      const horiz = Math.hypot(dx, dz);
      const wantPitch = Math.max(-0.5, Math.min(0.9, -Math.atan2(fp.y - from.y - 2, horiz) * 0.8 + 0.15));
      this.yaw = lerpAngle(this.yaw, wantYaw, 1 - Math.exp(-dt * 6));
      this.pitch += (wantPitch - this.pitch) * (1 - Math.exp(-dt * 4));
    } else if (p.state === 'mounted' && g.horse.speed > 6 && this.idleTime > 1.2) {
      // Drift behind the horse when riding without touching the camera.
      const behind = g.horse.yaw + Math.PI;
      this.yaw = lerpAngle(this.yaw, behind, 1 - Math.exp(-dt * 1.2));
    }
    this.pitch = Math.max(-0.6, Math.min(1.3, this.pitch));

    let dist = 7;
    let height = 1.5;
    if (p.state === 'mounted') {
      dist = 9 + g.horse.speed * 0.12;
      height = 1.2;
    } else if (p.state === 'climb') {
      dist = 9.5;
      height = 1.0;
    } else if (g.nearestColossus(60)) dist = 10;
    this.distance += (dist - this.distance) * (1 - Math.exp(-dt * 3));

    const tgt = _t.copy(p.position);
    tgt.y += height;
    const follow = p.state === 'climb' ? 10 : 14;
    this.target.lerp(tgt, 1 - Math.exp(-dt * follow));

    const cp = Math.cos(this.pitch);
    const off = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    const pos = this.camera.position.copy(this.target).addScaledVector(off, this.distance);

    // Keep the camera above the ground.
    const gh = g.terrain.getHeight(pos.x, pos.z) + 0.6;
    if (pos.y < gh) pos.y = gh;
    if (pos.y < 0.4 && g.terrain.getHeight(pos.x, pos.z) < 0) pos.y = 0.4;

    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.5);
    let shake = this.shakeAmt;
    for (const c of g.colossi) if (c.shake > 0 && c.playerOnMe()) shake = Math.max(shake, c.shake * 0.35);
    if (shake > 0) {
      const s = shake * 0.35;
      pos.x += (Math.random() - 0.5) * s;
      pos.y += (Math.random() - 0.5) * s;
      pos.z += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.target);

    const fov = 62 + (p.state === 'mounted' ? Math.max(0, g.horse.speed - 10) * 0.6 : 0);
    this.fov += (fov - this.fov) * (1 - Math.exp(-dt * 3));
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}

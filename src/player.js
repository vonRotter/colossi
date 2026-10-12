import * as THREE from 'three';
import { toonMaterial, addOutline, makeGlowSprite } from './materials.js';
import { WATER_LEVEL } from './world/layout.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _m3 = new THREE.Matrix3();
const _q = new THREE.Quaternion();

const WALK = 5.2;
const RUN = 9;
const GRAVITY = 24;
const JUMP = 7.6;
const RADIUS = 0.4;
const STAND_NY = 0.62;
// Hysteresis so rounded edges don't flicker between standing and hanging.
const STAND_ENTER = 0.66;
const STAND_EXIT = 0.56;

const GRAB_DIRS = [];
for (let i = 0; i < 8; i++) {
  const a = (i / 8) * Math.PI * 2;
  GRAB_DIRS.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
}
GRAB_DIRS.push(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 1, 0));

export class Player {
  constructor(game) {
    this.game = game;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.state = 'ground';
    this.maxHearts = 5;
    this.hearts = 5;
    this.maxStamina = 100;
    this.stamina = 100;
    this.exhausted = false;
    this.staminaDelay = 0;
    this.invuln = 0;
    this.koTimer = 0;
    this.attach = null;
    this.surfaceNormal = new THREE.Vector3(0, 1, 0);
    this.surfacePoint = new THREE.Vector3();
    this.prevSurfacePoint = new THREE.Vector3();
    this.surfaceVel = new THREE.Vector3();
    this.regrabCooldown = 0;
    this.knockTimer = 0;
    this.charge = 0;
    this.charging = false;
    this.stabTimer = 0;
    this.swingTimer = 0;
    this.walkPhase = 0;
    this.lastSafe = new THREE.Vector3();
    this.safeTimer = 0;
    this.nearWeakPoint = null;
    this.beamOn = false;
    this.airTime = 0;
    this.chargeTickLevel = 0;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.firstHitOnly = true;
    this.orient = new THREE.Quaternion();
    this.buildModel();
  }

  buildModel() {
    const tunic = toonMaterial(0x46b05a);
    const skin = toonMaterial(0xffd9b8);
    const hair = toonMaterial(0xf0b04a);
    const pants = toonMaterial(0xf3ead2);
    const boots = toonMaterial(0x8a5634);
    const scarfMat = toonMaterial(0xe8504a);
    const dark = new THREE.MeshBasicMaterial({ color: 0x2a2030 });
    const cheek = new THREE.MeshBasicMaterial({ color: 0xff9c9c });

    const m = new THREE.Group();
    const add = (parent, geo, mat, x, y, z, outline = 0.025) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      if (outline) addOutline(mesh, outline);
      return mesh;
    };

    const hips = new THREE.Group();
    hips.position.y = 0.88;
    m.add(hips);
    const body = new THREE.Group();
    hips.add(body);
    add(body, new THREE.CapsuleGeometry(0.27, 0.32, 6, 12), tunic, 0, 0.3, 0);
    const skirt = add(body, new THREE.ConeGeometry(0.36, 0.38, 12, 1, true), tunic, 0, 0.05, 0);
    skirt.material = toonMaterial(0x46b05a, { side: THREE.DoubleSide });
    add(body, new THREE.TorusGeometry(0.26, 0.05, 6, 16), boots, 0, 0.18, 0, 0).rotation.x = Math.PI / 2;
    const scarf = add(body, new THREE.TorusGeometry(0.2, 0.07, 6, 16), scarfMat, 0, 0.6, 0, 0.02);
    scarf.rotation.x = Math.PI / 2;
    const tailGeo = new THREE.BoxGeometry(0.14, 0.04, 0.5);
    tailGeo.translate(0, 0, -0.25);
    const scarfTail = add(body, tailGeo, scarfMat, 0.08, 0.6, -0.15, 0);
    this.scarfTail = scarfTail;

    const head = new THREE.Group();
    head.position.y = 0.92;
    body.add(head);
    add(head, new THREE.SphereGeometry(0.3, 18, 14), skin, 0, 0, 0, 0.03);
    const hairCap = add(head, new THREE.SphereGeometry(0.32, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.03, -0.02, 0.03);
    hairCap.rotation.x = -0.25;
    const hatGeo = new THREE.ConeGeometry(0.28, 0.7, 12);
    hatGeo.translate(0, 0.35, 0);
    const hat = add(head, hatGeo, tunic, 0, 0.2, -0.05, 0.025);
    hat.rotation.x = -1.1;
    this.hat = hat;
    add(head, new THREE.SphereGeometry(0.045, 8, 6), dark, -0.11, 0.0, 0.27, 0);
    add(head, new THREE.SphereGeometry(0.045, 8, 6), dark, 0.11, 0.0, 0.27, 0);
    add(head, new THREE.SphereGeometry(0.05, 8, 6), cheek, -0.18, -0.08, 0.22, 0).scale.set(1, 0.6, 0.4);
    add(head, new THREE.SphereGeometry(0.05, 8, 6), cheek, 0.18, -0.08, 0.22, 0).scale.set(1, 0.6, 0.4);

    const makeArm = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.33 * side, 0.55, 0);
      body.add(shoulder);
      const armGeo = new THREE.CapsuleGeometry(0.08, 0.32, 4, 8);
      armGeo.translate(0, -0.22, 0);
      add(shoulder, armGeo, tunic, 0, 0, 0);
      const hand = add(shoulder, new THREE.SphereGeometry(0.085, 10, 8), skin, 0, -0.48, 0);
      return { shoulder, hand };
    };
    this.armL = makeArm(-1);
    this.armR = makeArm(1);

    // Sword in the right hand
    const sword = new THREE.Group();
    sword.position.set(0, -0.5, 0.02);
    this.armR.shoulder.add(sword);
    const bladeGeo = new THREE.BoxGeometry(0.07, 0.95, 0.025);
    bladeGeo.translate(0, 0.62, 0);
    this.bladeMat = new THREE.MeshToonMaterial({ color: 0xd6efff, emissive: 0x3a7dc0, emissiveIntensity: 0.4 });
    add(sword, bladeGeo, this.bladeMat, 0, 0, 0, 0.012);
    add(sword, new THREE.BoxGeometry(0.28, 0.05, 0.07), toonMaterial(0xf2c14e), 0, 0.12, 0, 0.012);
    add(sword, new THREE.CylinderGeometry(0.035, 0.035, 0.22, 6), boots, 0, 0, 0, 0);
    sword.rotation.x = Math.PI / 2;
    this.sword = sword;
    this.swordGlow = makeGlowSprite(0x9fd8ff, 0.01);
    this.swordGlow.position.y = 1.1;
    sword.add(this.swordGlow);

    const makeLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(0.13 * side, 0.02, 0);
      hips.add(hip);
      const legGeo = new THREE.CapsuleGeometry(0.095, 0.42, 4, 8);
      legGeo.translate(0, -0.33, 0);
      add(hip, legGeo, pants, 0, 0, 0);
      const boot = add(hip, new THREE.BoxGeometry(0.17, 0.16, 0.28), boots, 0, -0.8, 0.04, 0.02);
      return { hip, boot };
    };
    this.legL = makeLeg(-1);
    this.legR = makeLeg(1);

    this.hips = hips;
    this.body = body;
    this.head = head;
    this.model = m;
    this.root = new THREE.Group();
    this.root.add(m);
  }

  spawn(pos, yaw = 0) {
    this.position.copy(pos);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.state = 'ground';
    this.attach = null;
    this.lastSafe.copy(pos);
  }

  get chest() {
    return _v3.copy(UP).applyQuaternion(this.orient).multiplyScalar(1.1).add(this.position);
  }

  // ---------------------------------------------------------------------------
  update(dt) {
    const g = this.game;
    const input = g.input;
    this.invuln = Math.max(0, this.invuln - dt);
    this.regrabCooldown = Math.max(0, this.regrabCooldown - dt);
    this.stabTimer = Math.max(0, this.stabTimer - dt);
    this.swingTimer = Math.max(0, this.swingTimer - dt);

    if (this.state === 'ko') {
      this.koTimer -= dt;
      if (this.koTimer <= 0) g.respawnPlayer();
      this.animate(dt, 0);
      return;
    }

    const gripHeld = input.held('grip') && !this.exhausted && this.stamina > 0;
    this.gripping = gripHeld;
    let staminaUse = 0;

    switch (this.state) {
      case 'mounted':
        this.updateMounted(dt);
        break;
      case 'climb':
        staminaUse = this.updateClimb(dt, gripHeld);
        break;
      case 'swim':
        staminaUse = this.updateSwim(dt);
        break;
      default:
        staminaUse = this.updateFree(dt, gripHeld);
    }

    this.updateCombat(dt);

    // Stamina bookkeeping (BotW-style: exhaustion until refilled a bit).
    if (staminaUse > 0) {
      this.stamina = Math.max(0, this.stamina - staminaUse * dt);
      this.staminaDelay = 0.6;
      if (this.stamina <= 0) {
        this.exhausted = true;
        g.audio.hurt();
      }
    } else {
      this.staminaDelay -= dt;
      if (this.staminaDelay <= 0) {
        const rate = this.state === 'climb' ? 22 : 34;
        this.stamina = Math.min(this.maxStamina, this.stamina + rate * dt);
      }
    }
    if (this.exhausted && this.stamina >= this.maxStamina * 0.35) this.exhausted = false;

    this.animate(dt, staminaUse);
  }

  // ---------------------------------------------------------------------------
  moveVector(target) {
    const cam = this.game.cameraRig;
    const mv = this.game.input.move;
    const sy = Math.sin(cam.yaw);
    const cy = Math.cos(cam.yaw);
    // camera forward = (-sin, 0, -cos); right = (cos, 0, -sin)
    return target.set(cy * mv.x - sy * mv.y, 0, -sy * mv.x - cy * mv.y);
  }

  updateFree(dt, gripHeld) {
    const g = this.game;
    const input = g.input;
    const onGround = this.state === 'ground';
    const mv = this.moveVector(_v1);
    const mag = Math.min(1, mv.length());
    let use = 0;

    const wantsRun = input.held('sprint') && !this.exhausted && mag > 0.3 && onGround;
    if (wantsRun) use = 16;
    const charging = this.charging;
    const speed = (wantsRun ? RUN : WALK) * mag * (charging ? 0.25 : 1);
    if (mag > 0.05) {
      mv.normalize();
      const targetYaw = Math.atan2(mv.x, mv.z);
      this.yaw = lerpAngle(this.yaw, targetYaw, 1 - Math.exp(-dt * 14));
    }
    const accel = onGround ? 40 : 7;
    const tx = mv.x * speed;
    const tz = mv.z * speed;
    this.velocity.x += clampMag(tx - this.velocity.x, accel * dt);
    this.velocity.z += clampMag(tz - this.velocity.z, accel * dt);

    if (onGround && input.pressed('jump') && !charging) {
      this.velocity.y = JUMP;
      this.state = 'air';
      this.airTime = 0;
      g.audio.jump();
    }

    this.velocity.y -= GRAVITY * dt;
    if (this.velocity.y < -45) this.velocity.y = -45;
    this.position.addScaledVector(this.velocity, dt);

    // World bounds: soft wall at the mountain ring.
    const r = Math.hypot(this.position.x, this.position.z);
    if (r > 740) {
      this.position.x *= 740 / r;
      this.position.z *= 740 / r;
    }

    g.colliders.resolve(this.position, RADIUS, this.position.y);
    for (const c of g.colossi) c.pushOut(this.position, RADIUS, this.state === 'ground');

    const h = g.terrain.getHeight(this.position.x, this.position.z);
    if (this.position.y <= h) {
      const impact = -this.velocity.y;
      this.position.y = h;
      if (this.state !== 'ground') {
        if (impact > 21) this.damage(impact > 30 ? 2 : 1, null, 'fall');
        g.particles.burst(_v2.copy(this.position), 6, 0xe9e1c8, { speed: 2, size: 0.35, life: 0.5, gravity: 0, up: 0.5 });
      }
      this.state = 'ground';
      this.velocity.y = 0;
      // Steep slopes push you back down.
      const n = g.terrain.getNormal(this.position.x, this.position.z, _v2);
      if (n.y < 0.7) {
        this.velocity.x += n.x * 30 * dt;
        this.velocity.z += n.z * 30 * dt;
      }
    } else if (this.state === 'ground') {
      // Stick to downhill slopes instead of hopping.
      if (this.position.y - h < 0.35 && this.velocity.y <= 0) this.position.y = h;
      else {
        this.state = 'air';
        this.airTime = 0;
      }
    }
    if (this.state === 'air') this.airTime += dt;

    // Water
    if (h < WATER_LEVEL - 1.1 && this.position.y < WATER_LEVEL - 0.9) {
      this.state = 'swim';
      this.velocity.y = 0;
      g.audio.splash();
      g.particles.burst(_v2.set(this.position.x, 0.2, this.position.z), 20, 0xe8fbff, { speed: 4, size: 0.4, life: 0.7, gravity: -10, up: 3 });
    }

    if (this.state === 'ground') {
      this.safeTimer -= dt;
      if (this.safeTimer <= 0 && h > WATER_LEVEL + 0.5 && !g.colossi.some((c) => c.nearBody(this.position, 30))) {
        this.lastSafe.copy(this.position);
        this.safeTimer = 0.5;
      }
    }

    // Try to grab a colossus or land on one.
    if (this.regrabCooldown <= 0) this.tryGrab(gripHeld);

    // Mount the horse
    const horse = g.horse;
    if (this.state === 'ground' && input.pressed('mount') && horse.canMount(this.position)) {
      this.mount();
    }

    const flat = Math.hypot(this.velocity.x, this.velocity.z);
    this.walkPhase += flat * dt * 1.7;
    this.orient.setFromAxisAngle(UP, this.yaw);
    return use;
  }

  tryGrab(gripHeld) {
    const g = this.game;
    const origin = _v2.copy(this.position);
    origin.y += 1.0;
    let best = null;
    for (const c of g.colossi) {
      if (!c.nearBody(this.position, 4)) continue;
      // Land on top surfaces even without gripping.
      if (this.state === 'air' && this.velocity.y <= 0) {
        const o = _v1.copy(this.position);
        o.y += 0.6;
        const hit = this.ray(c, o, _v3.set(0, -1, 0), 0.6 + Math.max(0.05, -this.velocity.y * 0.04));
        if (hit && hit.worldNormal.y > STAND_NY) best = { c, hit };
      }
      // Step up onto low colossus surfaces (feet, tail) while walking.
      if (!best && this.state === 'ground') {
        const flat = Math.hypot(this.velocity.x, this.velocity.z);
        if (flat > 0.5) {
          const o = _v1.set(this.velocity.x / flat, 0, this.velocity.z / flat).multiplyScalar(0.7).add(this.position);
          o.y += 2.2;
          const hit = this.ray(c, o, _v3.set(0, -1, 0), 2.4);
          if (hit && hit.worldNormal.y > STAND_NY) best = { c, hit };
        }
      }
      if (!best && gripHeld) {
        for (const d of GRAB_DIRS) {
          const hit = this.ray(c, origin, d, 1.05);
          if (hit && hit.object.userData.climbable && (!best || hit.distance < best.hit.distance)) best = { c, hit };
        }
      }
    }
    if (best) {
      this.attachTo(best.c, best.hit);
      g.audio.grab();
    }
  }

  ray(colossus, origin, dir, far) {
    const rc = this.raycaster;
    rc.set(origin, dir);
    rc.far = far;
    rc.near = 0;
    const hits = rc.intersectObjects(colossus.meshes, false);
    for (const h of hits) {
      if (!h.face) continue;
      _m3.getNormalMatrix(h.object.matrixWorld);
      h.worldNormal = h.face.normal.clone().applyMatrix3(_m3).normalize();
      // only accept surfaces facing the ray origin
      if (h.worldNormal.dot(dir) > 0.05) continue;
      return h;
    }
    return null;
  }

  /** True if something (front or back face) occupies the space above a standing spot. */
  blockedAbove(colossus, point, normal) {
    const rc = this.raycaster;
    rc.set(_v2.copy(point).addScaledVector(normal, 0.15), normal);
    rc.near = 0;
    rc.far = 1.6;
    return rc.intersectObjects(colossus.meshes, false).length > 0;
  }

  attachTo(colossus, hit) {
    this.state = 'climb';
    this.attach = {
      colossus,
      mesh: hit.object,
      localPoint: hit.object.worldToLocal(hit.point.clone()),
      localNormal: hit.face.normal.clone(),
    };
    this.surfacePoint.copy(hit.point);
    this.prevSurfacePoint.copy(hit.point);
    this.surfaceNormal.copy(hit.worldNormal);
    this.velocity.set(0, 0, 0);
    this.knockTimer = 0;
    colossus.onPlayerAttach?.();
  }

  detach(vel) {
    this.state = 'air';
    this.airTime = 0;
    this.attach = null;
    this.velocity.copy(vel);
    this.regrabCooldown = 0.25;
    this.yaw = Math.atan2(this.surfaceNormal.x, this.surfaceNormal.z);
  }

  surfaceWorld() {
    const a = this.attach;
    const p = this.surfacePoint.copy(a.localPoint).applyMatrix4(a.mesh.matrixWorld);
    _m3.getNormalMatrix(a.mesh.matrixWorld);
    this.surfaceNormal.copy(a.localNormal).applyMatrix3(_m3).normalize();
    return p;
  }

  updateClimb(dt, gripHeld) {
    const g = this.game;
    const input = g.input;
    const a = this.attach;
    const c = a.colossus;
    this.surfaceWorld();
    const n = this.surfaceNormal;
    // Velocity of the surface (for inheriting momentum when leaving).
    this.surfaceVel.subVectors(this.surfacePoint, this.prevSurfacePoint).divideScalar(Math.max(dt, 1e-3));
    if (this.surfaceVel.length() > 10) this.surfaceVel.setLength(10);
    this.prevSurfacePoint.copy(this.surfacePoint);

    const standing = n.y > (this.standing ? STAND_EXIT : STAND_ENTER);
    const climbable = a.mesh.userData.climbable;
    this.standing = standing;
    let use = 0;

    if (!standing && !(gripHeld && climbable)) {
      this.detach(_v1.copy(this.surfaceVel).multiplyScalar(0.5).addScaledVector(n, 2.5));
      return 0;
    }

    // Colossus shaking throws off anyone not holding on.
    const shake = c.shake;
    if (standing && !gripHeld && shake > 0.35) {
      this.knockTimer += dt;
      if (this.knockTimer > 0.3) {
        const side = _v1.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
        this.detach(side.multiplyScalar(5).addScaledVector(n, 7));
        g.hud.toast('Hold on! Grip when the guardian shakes.');
        return 0;
      }
    } else this.knockTimer = Math.max(0, this.knockTimer - dt);

    // Movement along the surface
    const mv = input.move;
    const mag = Math.min(1, Math.hypot(mv.x, mv.y));
    let moving = false;
    if (mag > 0.1 && !this.charging) {
      const dir = this.surfaceMoveDir(n, standing, _v1);
      const speed = standing ? (input.held('sprint') && !this.exhausted ? 6 : 4) : 2.6;
      if (dir.lengthSq() > 0.01) {
        moving = this.surfaceStep(dir.normalize(), speed * mag * dt, gripHeld);
        if (this.state !== 'climb') return 0;
      }
    }

    if (gripHeld && !standing) use += moving ? 9 : 4;
    if (gripHeld && shake > 0.2) use += shake * 14;
    if (standing && input.held('sprint') && moving) use += 10;

    // Jumping off or leaping upward
    if (input.pressed('jump') && !this.charging) {
      g.audio.jump();
      if (standing) {
        const fwd = this.surfaceMoveDir(n, true, _v2);
        this.detach(_v1.copy(this.surfaceVel).multiplyScalar(0.6).addScaledVector(UP, JUMP).addScaledVector(fwd, mag * 4));
      } else {
        const up = this.wallUp(n, _v2);
        const leapUp = input.move.y > 0.3;
        const v = _v1.copy(n).multiplyScalar(leapUp ? 2.2 : 5.5);
        if (leapUp) v.addScaledVector(up, 7.5);
        else v.y += 4;
        this.detach(v);
        if (leapUp) this.regrabCooldown = 0.22;
      }
      return use;
    }

    // Pose & position
    this.surfaceWorld();
    const pos = this.position.copy(this.surfacePoint);
    if (standing) {
      // Facing: towards the camera-relative move direction, projected on surface
      const fwd = this.surfaceMoveDir(n, true, _v2);
      if (fwd.lengthSq() > 0.01 && mag > 0.1) this.yaw = Math.atan2(fwd.x, fwd.z);
      const f = _v2.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      f.addScaledVector(n, -f.dot(n)).normalize();
      const x = _v3.crossVectors(n, f).normalize();
      _m4.makeBasis(x, n, f);
      _q.setFromRotationMatrix(_m4);
    } else {
      const up = this.wallUp(n, _v2);
      const f = _v3.copy(n).negate();
      const x = new THREE.Vector3().crossVectors(up, f).normalize();
      _m4.makeBasis(x, up, f);
      _q.setFromRotationMatrix(_m4);
      pos.addScaledVector(n, 0.32).addScaledVector(up, -0.85);
    }
    this.orient.slerp(_q, 1 - Math.exp(-dt * 12));
    this.walkPhase += moving ? dt * (standing ? 9 : 6) : 0;
    this.climbMoving = moving;
    return use;
  }

  wallUp(n, target) {
    // World up projected onto the surface; falls back to camera forward on ceilings.
    target.copy(UP).addScaledVector(n, -n.y);
    if (target.lengthSq() < 0.02) {
      const cam = this.game.cameraRig;
      target.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw)).addScaledVector(n, -0);
    }
    return target.normalize();
  }

  surfaceMoveDir(n, flat, target) {
    const cam = this.game.cameraRig;
    const mv = this.game.input.move;
    const camF = _v3.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
    const camR = new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
    if (flat || Math.abs(n.y) > 0.85 || (n.y > 0 && this.standing)) {
      camF.addScaledVector(n, -camF.dot(n)).normalize();
      camR.addScaledVector(n, -camR.dot(n)).normalize();
      return target.copy(camR).multiplyScalar(mv.x).addScaledVector(camF, mv.y);
    }
    const up = this.wallUp(n, new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(up, n); // = cross(-n, up)
    if (right.dot(camR) < 0) right.negate();
    // "Forward" always means away from the camera: on a wall facing away from
    // the camera (the far side of a shoulder or shell) that means climbing down.
    const fwdSign = n.dot(camF) > 0.25 ? -1 : 1;
    return target.copy(right).multiplyScalar(mv.x).addScaledVector(up, mv.y * fwdSign);
  }

  /** Move along the colossus surface, wrapping around edges and into corners. */
  surfaceStep(dir, dist, gripHeld, sliding = false) {
    const a = this.attach;
    const c = a.colossus;
    const s = this.surfacePoint;
    const n = this.surfaceNormal.clone();
    const wasStanding = this.standing;
    const o = new THREE.Vector3();

    let hit = null;
    let wallHit = false;
    // 0) reach for moss in front of the chest (e.g. from a foot onto the calf)
    if (gripHeld && (wasStanding || !a.mesh.userData.climbable)) {
      const flatDir = dir.clone().setY(0);
      if (flatDir.lengthSq() > 0.01) {
        flatDir.normalize();
        for (const h of [1.0, 1.6, 0.5]) {
          const reach = this.ray(c, o.copy(s).addScaledVector(n, h).addScaledVector(flatDir, -0.5), flatDir, 1.9);
          if (reach && reach.object.userData.climbable && reach.object !== a.mesh) {
            hit = reach;
            break;
          }
        }
      }
    }
    // Body check while walking: don't walk into a wall at chest height.
    if (!hit && wasStanding) {
      // Start behind the body so we still see walls we're already touching.
      const body = this.ray(c, o.copy(s).addScaledVector(n, 1.1).addScaledVector(dir, -0.4), dir, dist + 0.85);
      if (body) {
        if (gripHeld && body.object.userData.climbable) hit = body;
        else {
          // Slide along the wall instead of sticking to it.
          if (sliding) return false;
          const wn = body.worldNormal;
          const slide = dir.clone().addScaledVector(wn, -dir.dot(wn));
          slide.addScaledVector(n, -slide.dot(n));
          const len = slide.length();
          if (len < 0.25) return false;
          return this.surfaceStep(slide.divideScalar(len), dist * len, gripHeld, true);
        }
      }
    }
    if (!hit) {
      // 1) concave corner: a wall right in front
      const wall = this.ray(c, o.copy(s).addScaledVector(n, 0.3), dir, dist + 0.35);
      // 2) continue on the same (or a slightly protruding neighbouring) surface
      // On walls we probe horizontally so rounded edges can't bounce us back down.
      const inward = n.clone().negate();
      if (!wasStanding && Math.abs(n.y) < 0.85) inward.setY(0).normalize();
      let snap = null;
      for (const extra of [0, 0.3, 0.6]) {
        o.copy(s).addScaledVector(dir, dist + extra).addScaledVector(inward, -1.5);
        snap = this.ray(c, o, inward, 3.0);
        // Grazing the underside of an overhang: reach a little further for its outer face.
        if (!snap || wasStanding || snap.worldNormal.y > -0.5) break;
      }
      // Walls win, but the underside of a small overhang should be stepped around.
      if (wall && (wall.worldNormal.y > -0.3 || !snap)) {
        hit = wall;
        wallHit = true;
      } else hit = snap;
    }
    // Standing on a ramp and bumping into a low lip (e.g. a joint): step over it.
    if (wasStanding && hit && hit.worldNormal.y <= STAND_EXIT && !(gripHeld && hit.object.userData.climbable)) {
      o.copy(s).addScaledVector(dir, dist + 0.4).addScaledVector(UP, 1.3);
      const over = this.ray(c, o, _v3.set(0, -1, 0), 2.2);
      if (over && over.worldNormal.y > STAND_EXIT) {
        hit = over;
        wallHit = false;
      }
    }
    // 3) wrap around a convex edge
    if (!hit) {
      o.copy(s).addScaledVector(dir, dist + 0.15).addScaledVector(n, -0.5);
      hit = this.ray(c, o, dir.clone().negate(), dist + 0.9);
    }
    if (!hit) {
      if (wasStanding && !gripHeld) {
        // Walk off the edge.
        this.detach(dir.clone().multiplyScalar(4).add(this.surfaceVel));
        return true;
      }
      return false;
    }
    const nn = hit.worldNormal;
    if (nn.y > STAND_EXIT && this.blockedAbove(c, hit.point, nn)) return false;
    const newStanding = nn.y > (wasStanding ? STAND_EXIT : STAND_ENTER);
    const climbable = hit.object.userData.climbable;
    if (!newStanding && !(gripHeld && climbable)) {
      if (wasStanding && !gripHeld && !wallHit && nn.y < 0.45) {
        // Stepping off a ledge
        this.detach(dir.clone().multiplyScalar(4).add(this.surfaceVel));
        return true;
      }
      return false; // can't hold onto that
    }
    a.mesh = hit.object;
    a.localPoint.copy(hit.object.worldToLocal(hit.point.clone()));
    a.localNormal.copy(hit.face.normal);
    this.surfaceWorld();
    return true;
  }

  updateSwim(dt) {
    const g = this.game;
    const mv = this.moveVector(_v1);
    const mag = Math.min(1, mv.length());
    if (mag > 0.05) {
      mv.normalize();
      this.yaw = lerpAngle(this.yaw, Math.atan2(mv.x, mv.z), 1 - Math.exp(-dt * 8));
    }
    this.velocity.x += clampMag(mv.x * 3.4 * mag - this.velocity.x, 10 * dt);
    this.velocity.z += clampMag(mv.z * 3.4 * mag - this.velocity.z, 10 * dt);
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.position.y = WATER_LEVEL - 1.05 + Math.sin(performance.now() * 0.004) * 0.05;
    g.colliders.resolve(this.position, RADIUS);
    for (const c of g.colossi) c.pushOut(this.position, RADIUS, true);
    this.walkPhase += dt * 5;
    this.orient.setFromAxisAngle(UP, this.yaw);
    const h = g.terrain.getHeight(this.position.x, this.position.z);
    if (h > WATER_LEVEL - 1.05) {
      this.position.y = h;
      this.state = 'ground';
      return 0;
    }
    if (this.stamina <= 0.5) {
      g.hud.toast('Too tired to swim! Back to the shore...');
      this.damage(1, null, 'water');
      if (this.state !== 'ko') {
        this.spawn(this.lastSafe, this.yaw);
        this.stamina = this.maxStamina;
        this.exhausted = false;
      }
      return 0;
    }
    if (Math.random() < dt * 6) g.particles.spawn(_v2.set(this.position.x, 0.1, this.position.z), _v3.set(0, 0.6, 0), 0xe8fbff, 0.3, 0.6, 0);
    return mag > 0.1 ? 7 : 3;
  }

  // ---------------------------------------------------------------------------
  mount() {
    this.state = 'mounted';
    this.velocity.set(0, 0, 0);
    this.game.horse.mount();
  }

  dismount() {
    const horse = this.game.horse;
    horse.dismount();
    const side = _v1.set(Math.cos(horse.yaw), 0, -Math.sin(horse.yaw)).multiplyScalar(1.4);
    this.position.copy(horse.position).add(side);
    this.position.y = this.game.terrain.getHeight(this.position.x, this.position.z) + 0.6;
    this.state = 'air';
    this.velocity.set(0, 3, 0);
    this.yaw = horse.yaw;
  }

  updateMounted(dt) {
    const horse = this.game.horse;
    horse.saddle(this.position);
    this.yaw = horse.yaw;
    this.orient.setFromAxisAngle(UP, this.yaw);
    _q.setFromAxisAngle(_v1.set(1, 0, 0), horse.pitch);
    this.orient.multiply(_q);
    if (this.game.input.pressed('mount')) this.dismount();
  }

  // ---------------------------------------------------------------------------
  updateCombat(dt) {
    const g = this.game;
    const input = g.input;
    // Raise the sword to find the next guardian.
    this.beamOn = input.held('beam') && (this.state === 'ground' || this.state === 'mounted' || (this.state === 'climb' && this.standing));

    // Find nearest crystal in reach.
    this.nearWeakPoint = null;
    if (this.state !== 'mounted') {
      const chest = _v2.copy(this.chest);
      let best = 2.6;
      for (const c of g.colossi) {
        if (c.freed) continue;
        for (const wp of c.weakPoints) {
          if (wp.broken) continue;
          const d = wp.mesh.getWorldPosition(_v1).distanceTo(chest);
          if (d < best) {
            best = d;
            this.nearWeakPoint = wp;
          }
        }
      }
    }

    const canAttack = this.state !== 'mounted' && this.state !== 'swim' && !this.beamOn;
    if (canAttack && input.held('attack')) {
      if (!this.charging) {
        this.charging = true;
        this.charge = 0;
        this.chargeTickLevel = 0;
      }
      this.charge = Math.min(1, this.charge + dt / 1.1);
      const lvl = Math.floor(this.charge * 4);
      if (lvl > this.chargeTickLevel) {
        this.chargeTickLevel = lvl;
        g.audio.chargeTick(this.charge);
      }
    } else if (this.charging) {
      this.charging = false;
      this.release();
    }
    this.bladeMat.emissiveIntensity = 0.4 + this.charge * (this.charging ? 2.2 : 0) + (this.beamOn ? 2 : 0);
    const glowSize = this.charging ? this.charge * 1.8 : this.beamOn ? 1.6 : 0.01;
    this.swordGlow.scale.setScalar(glowSize);
  }

  release() {
    const g = this.game;
    const power = this.charge;
    this.charge = 0;
    const wp = this.nearWeakPoint;
    if (wp) {
      this.stabTimer = 0.35;
      const dmg = 10 + power * power * 42;
      g.audio.strike(power);
      wp.colossus.hitWeakPoint(wp, dmg, power);
      if (this.state === 'climb') this.stamina = Math.max(0, this.stamina - 6);
    } else {
      this.swingTimer = 0.3;
      g.audio.tone(600 + power * 300, 0.15, { type: 'triangle', vol: 0.05, slide: 0.6 });
      const tip = this.swordGlow.getWorldPosition(_v1);
      g.particles.burst(tip, 6 + Math.floor(power * 10), 0xbfe6ff, { speed: 3, size: 0.3, life: 0.4, gravity: 0, up: 0 });
    }
  }

  damage(amount, fromPos, cause = 'hit') {
    const g = this.game;
    if (this.invuln > 0 || this.state === 'ko') return;
    this.hearts = Math.max(0, this.hearts - amount);
    this.invuln = 1.4;
    g.audio.hurt();
    g.hud.flash();
    g.cameraRig.addShake(0.6);
    if (this.state === 'mounted') this.dismount();
    if (fromPos) {
      const away = _v1.subVectors(this.position, fromPos);
      away.y = 0;
      away.normalize();
      if (this.state === 'climb') this.detach(away.multiplyScalar(6).add(_v2.set(0, 5, 0)));
      else {
        this.velocity.copy(away.multiplyScalar(9));
        this.velocity.y = 7;
        this.state = 'air';
      }
    }
    if (this.hearts <= 0) {
      this.state = 'ko';
      this.koTimer = 2.2;
      this.attach = null;
      g.hud.toast(cause === 'water' ? 'Splash! Let\'s dry off and try again.' : 'Oof! Taking a little rest...');
    }
  }

  // ---------------------------------------------------------------------------
  animate(dt, staminaUse) {
    const t = performance.now() / 1000;
    const k = 1 - Math.exp(-dt * 14);
    const set = (obj, x, y, z) => {
      obj.rotation.x += (x - obj.rotation.x) * k;
      obj.rotation.y += (y - obj.rotation.y) * k;
      obj.rotation.z += (z - obj.rotation.z) * k;
    };
    const flat = Math.hypot(this.velocity.x, this.velocity.z);
    const ph = this.walkPhase;
    let legL = [0, 0, 0], legR = [0, 0, 0], armL = [0, 0, -0.1], armR = [0, 0, 0.1], body = [0, 0, 0];
    let swordX = Math.PI / 2;
    let hipsY = 0.88;

    switch (this.state) {
      case 'ground': {
        const s = Math.min(1, flat / RUN) * 1.1;
        legL = [Math.sin(ph) * 0.9 * s, 0, 0];
        legR = [-Math.sin(ph) * 0.9 * s, 0, 0];
        armL = [-Math.sin(ph) * 0.8 * s, 0, -0.15];
        armR = [Math.sin(ph) * 0.8 * s, 0, 0.15];
        body = [s * 0.18, 0, 0];
        hipsY = 0.88 + Math.abs(Math.cos(ph)) * 0.06 * s + Math.sin(t * 2) * 0.01;
        break;
      }
      case 'air':
        legL = [-0.6, 0, -0.1];
        legR = [0.3, 0, 0.1];
        armL = [-0.6, 0, -0.9];
        armR = [-0.6, 0, 0.9];
        break;
      case 'climb':
        if (this.standing) {
          const s = this.climbMoving ? 0.8 : 0;
          legL = [Math.sin(ph) * 0.9 * s, 0, 0];
          legR = [-Math.sin(ph) * 0.9 * s, 0, 0];
          armL = this.gripping ? [-0.3, 0, -0.9] : [-Math.sin(ph) * 0.7 * s, 0, -0.2];
          armR = this.gripping ? [-0.3, 0, 0.9] : [Math.sin(ph) * 0.7 * s, 0, 0.2];
          body = this.gripping ? [0.5, 0, 0] : [0, 0, 0];
          hipsY = this.gripping ? 0.6 : 0.88;
        } else {
          const s = this.climbMoving ? 1 : 0;
          armL = [-2.7 + Math.sin(ph) * 0.4 * s, 0, -0.25];
          armR = [-2.7 - Math.sin(ph) * 0.4 * s, 0, 0.25];
          legL = [-0.5 - Math.sin(ph) * 0.4 * s, 0, -0.1];
          legR = [-0.5 + Math.sin(ph) * 0.4 * s, 0, 0.1];
          if (staminaUse > 6 && this.stamina < 30) body = [0, Math.sin(t * 30) * 0.05, 0];
        }
        break;
      case 'swim':
        body = [1.2, 0, 0];
        armL = [-2.6 + Math.sin(ph) * 1.2, 0, -0.4];
        armR = [-2.6 - Math.sin(ph) * 1.2, 0, 0.4];
        legL = [Math.sin(ph * 2) * 0.4, 0, 0];
        legR = [-Math.sin(ph * 2) * 0.4, 0, 0];
        break;
      case 'mounted':
        legL = [-1.3, 0, -0.5];
        legR = [-1.3, 0, 0.5];
        armL = [-0.9, 0, -0.1];
        armR = [-0.9, 0, 0.1];
        body = [0.15 + this.game.horse.speed * 0.012, 0, 0];
        hipsY = 0.75;
        break;
      case 'ko':
        body = [-1.4, 0, 0];
        hipsY = 0.3;
        legL = [-1.4, 0, -0.2];
        legR = [-1.4, 0, 0.2];
        armL = [-0.3, 0, -1.2];
        armR = [-0.3, 0, 1.2];
        break;
    }

    if (this.charging) {
      armR = [-3.0, 0, 0.1];
      armL = [-2.9, 0, -0.1];
      swordX = -Math.PI / 2 - 0.2; // point the blade downwards
      if (this.state === 'ground') body = [0, 0, 0];
    } else if (this.stabTimer > 0) {
      armR = [-0.9, 0, 0.1];
      armL = [-0.8, 0, -0.1];
      swordX = -Math.PI / 2 - 0.6;
    } else if (this.swingTimer > 0) {
      armR = [-1.6, 0.8 - (1 - this.swingTimer / 0.3) * 2, 0.6];
    } else if (this.beamOn) {
      armR = [-3.1, 0, 0.05];
      swordX = 0;
    }

    set(this.legL.hip, ...legL);
    set(this.legR.hip, ...legR);
    set(this.armL.shoulder, ...armL);
    set(this.armR.shoulder, ...armR);
    set(this.body, ...body);
    this.sword.rotation.x += (swordX - this.sword.rotation.x) * k;
    this.hips.position.y += (hipsY - this.hips.position.y) * k;
    this.scarfTail.rotation.x = -0.3 - Math.min(1, flat / 10) * 0.9 + Math.sin(t * 9) * 0.15;
    this.scarfTail.rotation.y = Math.sin(t * 6) * 0.3;
    this.hat.rotation.x = -1.1 - Math.min(1, flat / 10) * 0.4 + Math.sin(t * 7) * 0.05;

    this.root.position.copy(this.position);
    this.root.quaternion.copy(this.orient);
    this.model.visible = !(this.invuln > 0 && Math.floor(t * 16) % 2 === 0 && this.state !== 'ko');
  }
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function clampMag(v, max) {
  return Math.max(-max, Math.min(max, v));
}

export { lerpAngle };

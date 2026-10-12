import * as THREE from 'three';
import { Terrain } from './world/terrain.js';
import { Grass } from './world/grass.js';
import { Sky, Water } from './world/sky.js';
import { Colliders } from './world/colliders.js';
import { buildProps } from './world/props.js';
import { SHRINE, ARENAS, WORLD_HALF } from './world/layout.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { Horse } from './horse.js';
import { CameraRig } from './camera.js';
import { Hud } from './hud.js';
import { Audio } from './audio.js';
import { Particles, Shockwaves } from './effects.js';
import { Golem } from './colossus/golem.js';
import { Turtle } from './colossus/turtle.js';

const SETTINGS_KEY = 'colossi-settings';
function loadSettings() {
  const defaults = { sensitivity: 1, invertY: false, muted: false };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return defaults;
  }
}
function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.settings = loadSettings();
    this.params = new URLSearchParams(location.search);
    const lowQuality = this.params.has('low');

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !lowQuality, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowQuality ? 1 : 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xc4e6f6, 140, 820);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 5000);

    this.sunDir = new THREE.Vector3(0.45, 0.8, 0.35).normalize();
    const hemi = new THREE.HemisphereLight(0xdff3ff, 0x7a9a55, 1.5);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -70;
    sc.right = 70;
    sc.top = 70;
    sc.bottom = -70;
    sc.near = 1;
    sc.far = 400;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.input = new Input(this.canvas, this.settings);
    this.audio = new Audio();
    this.hud = new Hud(this);
    this.timeScale = 1;
    this.hitStopTimer = 0;
    this.paused = true;
    this.started = false;
    this.elapsed = 0;
    this.fpsAcc = 0;
    this.fpsFrames = 0;
  }

  build() {
    this.terrain = new Terrain(7);
    this.scene.add(this.terrain.mesh);
    this.colliders = new Colliders();
    this.props = buildProps(this.scene, this.terrain, this.colliders, 11);
    this.sky = new Sky(this.sunDir);
    this.scene.add(this.sky.mesh);
    this.water = new Water(this.terrain, WORLD_HALF * 2);
    this.scene.add(this.water.mesh);
    this.grass = new Grass(this.terrain, this.params.has('low') ? { spacing: 0.6, radius: 30 } : {});
    this.scene.add(this.grass.mesh);
    this.particles = new Particles(3000);
    this.scene.add(this.particles.points);
    this.shockwaves = new Shockwaves(this.scene);

    this.player = new Player(this);
    this.scene.add(this.player.root);
    this.horse = new Horse(this);
    this.scene.add(this.horse.root);
    this.cameraRig = new CameraRig(this.camera, this);

    this.colossi = [new Golem(this, ARENAS.golem), new Turtle(this, ARENAS.turtle)];
    for (const c of this.colossi) {
      c.place(this.terrain);
      this.scene.add(c.root);
      c.root.updateMatrixWorld(true);
      c.refreshCapsules();
    }

    // Light beam from the raised sword
    const beamGeo = new THREE.CylinderGeometry(0.25, 1.6, 1, 12, 1, true);
    beamGeo.translate(0, 0.5, 0);
    beamGeo.rotateX(Math.PI / 2);
    this.beam = new THREE.Mesh(
      beamGeo,
      new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
    );
    this.beam.visible = false;
    this.scene.add(this.beam);

    const start = new THREE.Vector3(SHRINE.x + 4, 0, SHRINE.z + 24);
    start.y = this.terrain.getHeight(start.x, start.z);
    this.player.spawn(start, 0);
    this.player.lastSafe.copy(start);
    const hs = new THREE.Vector3(SHRINE.x - 6, 0, SHRINE.z + 30);
    hs.y = this.terrain.getHeight(hs.x, hs.z);
    this.horse.spawn(hs, 0.5);
    this.cameraRig.yaw = 0;
    this.cameraRig.snap(start);

    window.addEventListener('resize', () => this.resize());
    this.setupMenus();
    window.game = this;
    if (this.params.has('debug')) this.hud.fpsEl.classList.remove('hidden');
  }

  setupMenus() {
    const titleEl = document.getElementById('title');
    const pauseEl = document.getElementById('pause');
    const playBtn = document.getElementById('play');
    document.getElementById('loading').classList.add('hidden');
    playBtn.disabled = false;

    const sens = document.getElementById('sens');
    const invert = document.getElementById('invert');
    const mute = document.getElementById('mute');
    sens.value = this.settings.sensitivity;
    invert.checked = this.settings.invertY;
    mute.checked = this.settings.muted;
    sens.oninput = () => {
      this.settings.sensitivity = parseFloat(sens.value);
      saveSettings(this.settings);
    };
    invert.onchange = () => {
      this.settings.invertY = invert.checked;
      saveSettings(this.settings);
    };
    mute.onchange = () => {
      if (this.audio.muted !== mute.checked) this.audio.toggleMute();
      this.settings.muted = mute.checked;
      saveSettings(this.settings);
    };

    const resume = () => {
      pauseEl.classList.add('hidden');
      this.paused = false;
      this.audio.start();
      this.input.requestLock();
    };
    playBtn.onclick = () => {
      titleEl.classList.add('hidden');
      this.hud.show();
      this.started = true;
      this.audio.start();
      if (this.settings.muted && !this.audio.muted) this.audio.toggleMute();
      resume();
      this.hud.banner('The Valley of Guardians', 'Hold R to raise your sword. Its light points to a sleepy guardian.', 6);
    };
    document.getElementById('resume').onclick = resume;
    document.getElementById('again').onclick = () => {
      document.getElementById('victory').classList.add('hidden');
      resume();
    };
    this.canvas.addEventListener('click', () => {
      if (this.started && !this.paused && !this.input.locked) this.input.requestLock();
    });
    document.addEventListener('pointerlockchange', () => {
      if (!this.input.locked && !this.input.fallback && this.started && !this.paused && document.getElementById('victory').classList.contains('hidden')) {
        this.pause();
      }
    });
  }

  pause() {
    this.paused = true;
    document.getElementById('pause').classList.remove('hidden');
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  hitStop(t) {
    this.hitStopTimer = Math.max(this.hitStopTimer, t);
  }

  nearestColossus(range) {
    let best = null;
    let bd = Infinity;
    for (const c of this.colossi) {
      if (c.freed) continue;
      const d = c.root.position.distanceTo(this.player.position) - c.cfg.radius;
      if (d < range && d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  beamTarget() {
    let best = null;
    let bd = Infinity;
    for (const c of this.colossi) {
      if (c.freed) continue;
      const d = c.root.position.distanceTo(this.player.position);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  respawnPlayer() {
    const p = this.player;
    p.spawn(p.lastSafe, p.yaw);
    p.hearts = p.maxHearts;
    p.stamina = p.maxStamina;
    p.exhausted = false;
    p.invuln = 2;
    this.cameraRig.snap(p.position);
    this.hud.toast('Back on your feet! You can do it!');
  }

  onColossusFreed(c) {
    this.audio.fanfare();
    this.hud.banner(`${c.name} is free!`, 'The gloom melts away and the guardian smiles.', 6);
    // Meadow of flowers blooms around the guardian.
    const colors = [0xffffff, 0xfff27a, 0xff9bc8, 0x9fc8ff, 0xffb35c];
    const geo = new THREE.OctahedronGeometry(0.3, 0);
    geo.scale(1, 0.5, 1);
    const inst = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial(), 600);
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    for (let i = 0; i < 600; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 6 + Math.sqrt(Math.random()) * 40;
      const x = c.root.position.x + Math.cos(a) * r;
      const z = c.root.position.z + Math.sin(a) * r;
      m.makeTranslation(x, this.terrain.getHeight(x, z) + 0.45, z);
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, col.set(colors[i % colors.length]));
    }
    inst.scale.set(1, 0.01, 1);
    this.scene.add(inst);
    this.blooms = this.blooms || [];
    this.blooms.push({ inst, t: 0 });
    if (this.colossi.every((k) => k.freed)) {
      setTimeout(() => {
        document.getElementById('victory').classList.remove('hidden');
        document.exitPointerLock?.();
        this.audio.fanfare();
      }, 7000);
    }
  }

  updatePrompts() {
    const p = this.player;
    const i = this.input;
    const list = [];
    if (p.state === 'mounted') {
      list.push([i.label('mount'), 'Dismount']);
      list.push([i.label('sprint'), 'Gallop']);
    } else if (p.state !== 'ko') {
      if (p.nearWeakPoint) list.push([i.label('attack'), p.charging ? `Charging... ${Math.round(p.charge * 100)}%` : 'Hold to charge, release to strike!']);
      if (p.state === 'ground' && this.horse.canMount(p.position)) list.push([i.label('mount'), 'Ride Clover']);
      if (p.state === 'climb' && !p.standing) list.push([i.label('grip'), 'Keep holding to grip']);
      if (p.state === 'climb' && !p.standing) list.push([i.label('jump'), '+ Up: leap upward']);
      if (p.state === 'climb' && p.standing && this.colossi.some((c) => c.shake > 0.3 && c.playerOnMe())) list.push([i.label('grip'), 'Hold on!']);
      if ((p.state === 'ground' || p.state === 'air') && this.nearestColossus(8)) list.push([i.label('grip'), 'Grab the moss']);
      if (p.state !== 'climb' && this.horse.position.distanceTo(p.position) > 40) list.push([i.label('whistle'), 'Whistle for Clover']);
    }
    this.hud.setPrompts(list);
  }

  updateBeam() {
    const p = this.player;
    const target = p.beamOn ? this.beamTarget() : null;
    this.beam.visible = !!target;
    if (!target) return;
    const tip = p.swordGlow.getWorldPosition(_v);
    const goal = target.focusPoint(_v2);
    const dir = goal.sub(tip);
    const len = Math.min(dir.length(), 600);
    dir.normalize();
    this.beam.position.copy(tip);
    this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    this.beam.scale.set(1, 1, len);
    this.beam.material.opacity = 0.35 + Math.sin(this.elapsed * 8) * 0.1;
    if (Math.random() < 0.5) {
      const t = Math.random() * Math.min(len, 60);
      this.particles.spawn(_v2.copy(tip).addScaledVector(dir, t), new THREE.Vector3(0, 0.5, 0), 0xdff6ff, 0.4, 0.6, 0);
    }
  }

  update(dt) {
    const i = this.input;
    i.update(dt);
    if (i.pressed('pause') && this.started) {
      if (!this.paused) {
        document.exitPointerLock?.();
        this.pause();
      }
    }
    if (i.pressed('mute')) {
      const m = this.audio.toggleMute();
      this.settings.muted = m;
      document.getElementById('mute').checked = m;
      saveSettings(this.settings);
      this.hud.toast(m ? 'Sound off' : 'Sound on', 1.2);
    }
    if (this.paused) return;

    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= dt;
      dt *= 0.08;
    }
    this.elapsed += dt;

    if (i.pressed('whistle') && this.player.state !== 'mounted') {
      this.audio.whistle();
      this.horse.whistle(this.player.position);
      this.hud.toast('Fweet! Clover is on the way.', 1.5);
    }

    for (const c of this.colossi) c.update(dt);
    this.horse.update(dt);
    this.player.update(dt);
    this.cameraRig.update(dt);
    this.updateBeam();
    this.updatePrompts();

    // Shrine orb bobbing
    const orb = this.props.shrine.userData.orb;
    orb.position.y = 7 + Math.sin(this.elapsed * 1.5) * 0.25;
    this.props.shrine.userData.glow.position.y = orb.position.y;
    this.props.update(this.elapsed);

    if (this.blooms) {
      for (const b of this.blooms) {
        b.t += dt;
        b.inst.scale.y = Math.min(1, b.t * 0.4);
      }
    }

    const sp = this.player.state === 'mounted' ? this.horse.position : this.player.position;
    this.sun.position.copy(sp).addScaledVector(this.sunDir, 200);
    this.sun.target.position.copy(sp);
    this.grass.update(dt, this.camera, this.player.position, this.horse.position, this.scene.fog);
    this.water.update(dt, this.scene.fog);
    this.sky.update(this.camera);
    this.particles.update(dt, this.renderer.domElement.height);
    this.shockwaves.update(dt);
    this.hud.update(dt);

    const near = this.nearestColossus(140);
    this.audio.update(dt, {
      intensity: near && near.aggro ? 1 : 0,
      speed: this.player.state === 'mounted' ? this.horse.speed : 0,
    });
  }

  loop() {
    let last = performance.now();
    const frame = (now) => {
      const real = (now - last) / 1000;
      const dt = Math.min(0.05, real);
      last = now;
      this.update(dt);
      this.renderer.render(this.scene, this.camera);
      this.fpsAcc += real;
      this.fpsFrames++;
      if (this.fpsAcc > 0.5) {
        this.hud.fpsEl.textContent = `${Math.round(this.fpsFrames / this.fpsAcc)} fps`;
        this.fpsAcc = 0;
        this.fpsFrames = 0;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}

const game = new Game();
// Let the title screen paint before the heavier world generation.
requestAnimationFrame(() =>
  setTimeout(() => {
    game.build();
    game.loop();
  }, 30)
);

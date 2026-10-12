import * as THREE from 'three';

const HEART = '<svg viewBox="0 0 32 30"><path d="M16 29 C 4 20, 0 13, 0 8 A 8 8 0 0 1 16 5 A 8 8 0 0 1 32 8 C 32 13, 28 20, 16 29 Z" fill="#ff5b6e" stroke="#2a2438" stroke-width="2.5"/></svg>';
const _v = new THREE.Vector3();

export class Hud {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('hud');
    this.heartsEl = document.getElementById('hearts');
    this.stamina = document.getElementById('stamina');
    this.staminaFg = this.stamina.querySelector('.fg');
    this.circ = 2 * Math.PI * 22;
    this.staminaFg.style.strokeDasharray = `${this.circ}`;
    this.boss = document.getElementById('boss');
    this.bossName = document.getElementById('boss-name');
    this.bossTitle = document.getElementById('boss-title');
    this.bossFill = document.getElementById('boss-fill');
    this.prompts = document.getElementById('prompts');
    this.toastEl = document.getElementById('toast');
    this.bannerEl = document.getElementById('banner');
    this.progressEl = document.getElementById('progress');
    this.flashEl = document.getElementById('flash');
    this.fpsEl = document.getElementById('fps');
    this.toastTimer = 0;
    this.bannerTimer = 0;
    this.lastHearts = -1;
    this.lastPrompts = '';
    this.staminaVisible = 0;
  }

  show() {
    this.el.classList.remove('hidden');
  }

  toast(msg, time = 2.6) {
    if (this.toastEl.textContent === msg && this.toastTimer > 0.5) return;
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    this.toastTimer = time;
  }

  banner(big, small, time = 5) {
    document.getElementById('banner-big').textContent = big;
    document.getElementById('banner-small').textContent = small;
    this.bannerEl.classList.add('show');
    this.bannerTimer = time;
  }

  flash() {
    this.flashEl.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => this.flashEl.classList.remove('on')));
  }

  setPrompts(list) {
    const key = list.map((p) => p.join('|')).join(';');
    if (key === this.lastPrompts) return;
    this.lastPrompts = key;
    this.prompts.innerHTML = list.map(([k, text]) => `<div class="prompt"><kbd>${k}</kbd>${text}</div>`).join('');
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    if (p.hearts !== this.lastHearts) {
      this.lastHearts = p.hearts;
      this.heartsEl.innerHTML = Array.from({ length: p.maxHearts }, (_, i) => `<div class="heart ${i < p.hearts ? '' : 'empty'}">${HEART}</div>`).join('');
    }

    // Stamina wheel floats next to the hero, BotW-style.
    const full = p.stamina >= p.maxStamina - 0.01;
    this.staminaVisible = full ? Math.max(0, this.staminaVisible - dt * 1.5) : 1;
    _v.copy(p.position);
    _v.y += 1.6;
    _v.project(g.camera);
    const x = (_v.x * 0.5 + 0.5) * window.innerWidth + 55;
    const y = (-_v.y * 0.5 + 0.5) * window.innerHeight - 10;
    this.stamina.style.left = `${x}px`;
    this.stamina.style.top = `${y}px`;
    this.stamina.style.opacity = _v.z < 1 ? this.staminaVisible : 0;
    this.staminaFg.style.strokeDashoffset = `${this.circ * (1 - p.stamina / p.maxStamina)}`;
    this.stamina.classList.toggle('exhausted', p.exhausted);
    this.stamina.classList.toggle('low', !p.exhausted && p.stamina < 30);

    const c = g.nearestColossus(130);
    if (c) {
      this.boss.classList.remove('hidden');
      this.bossName.textContent = c.name;
      this.bossTitle.textContent = c.title;
      this.bossFill.style.width = `${(c.hp / c.maxHp) * 100}%`;
    } else this.boss.classList.add('hidden');

    const freed = g.colossi.filter((k) => k.freed).length;
    this.progressEl.textContent = `Guardians freed: ${freed} / ${g.colossi.length}`;

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove('show');
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.bannerEl.classList.remove('show');
    }
  }
}

// Unified keyboard / mouse / gamepad input with named actions.
const ACTIONS = {
  jump: { keys: ['Space'], pad: [0] },
  sprint: { keys: ['ShiftLeft', 'ShiftRight'], pad: [1, 10] },
  attack: { keys: [], mouse: [0], pad: [2] },
  grip: { keys: ['KeyF'], mouse: [2], pad: [5, 7] },
  mount: { keys: ['KeyE'], pad: [3] },
  whistle: { keys: ['KeyQ'], pad: [13, 12] },
  beam: { keys: ['KeyR'], pad: [6] },
  focus: { keys: ['Tab'], mouse: [1], pad: [4] },
  pause: { keys: ['Escape', 'KeyP'], pad: [9] },
  mute: { keys: ['KeyM'], pad: [] },
};

export class Input {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.keys = new Set();
    this.tapped = new Set();
    this.mouse = new Set();
    this.mouseTapped = new Set();
    this.lookDX = 0;
    this.lookDY = 0;
    this.state = {};
    this.prev = {};
    for (const a in ACTIONS) {
      this.state[a] = false;
      this.prev[a] = false;
    }
    this.move = { x: 0, y: 0 };
    this.look = { x: 0, y: 0 };
    this.usingPad = false;
    this.locked = false;
    this.fallback = false;

    window.addEventListener('keydown', (e) => {
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.tapped.add(e.code);
      this.usingPad = false;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.clear();
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.mouse.add(e.button);
      this.mouseTapped.add(e.button);
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => this.mouse.delete(e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.lookDX += e.movementX;
      this.lookDY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas || this.fallback;
      if (!this.locked) this.mouse.clear();
    });
    // Some embeds block pointer lock: fall back to free mouse look.
    document.addEventListener('pointerlockerror', () => {
      this.fallback = true;
      this.locked = true;
    });
  }

  requestLock() {
    try {
      const p = this.canvas.requestPointerLock?.({ unadjustedMovement: false });
      if (p && p.catch) p.catch(() => {});
    } catch {
      /* pointer lock unavailable */
    }
  }

  pad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  update(dt) {
    const pad = this.pad();
    const padButton = (i) => !!(pad && pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.4));
    if (pad && (pad.buttons.some((b) => b.pressed) || pad.axes.some((a) => Math.abs(a) > 0.3))) this.usingPad = true;

    for (const a in ACTIONS) {
      const def = ACTIONS[a];
      let held = def.keys.some((k) => this.keys.has(k) || this.tapped.has(k));
      if (def.mouse) held ||= def.mouse.some((b) => this.mouse.has(b) || this.mouseTapped.has(b));
      if (def.pad) held ||= def.pad.some(padButton);
      this.prev[a] = this.state[a];
      this.state[a] = held;
    }
    this.tapped.clear();
    this.mouseTapped.clear();

    // Movement
    let mx = 0;
    let my = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) my += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) my -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
    if (pad) {
      const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
      mx += dz(pad.axes[0] ?? 0);
      my -= dz(pad.axes[1] ?? 0);
    }
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    this.move.x = mx;
    this.move.y = my;

    // Look
    const sens = this.settings.sensitivity;
    const inv = this.settings.invertY ? -1 : 1;
    let lx = this.lookDX * 0.0022 * sens;
    let ly = this.lookDY * 0.0022 * sens * inv;
    this.lookDX = 0;
    this.lookDY = 0;
    if (pad) {
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
      lx += dz(pad.axes[2] ?? 0) * 2.6 * dt * sens;
      ly += dz(pad.axes[3] ?? 0) * 2.0 * dt * sens * inv;
    }
    this.look.x = lx;
    this.look.y = ly;
  }

  held(a) {
    return this.state[a];
  }
  pressed(a) {
    return this.state[a] && !this.prev[a];
  }
  released(a) {
    return !this.state[a] && this.prev[a];
  }

  label(action) {
    const pad = {
      jump: 'A', sprint: 'B', attack: 'X', grip: 'RB', mount: 'Y', whistle: 'D-pad', beam: 'LT', focus: 'LB', pause: 'Start',
    };
    const kb = {
      jump: 'Space', sprint: 'Shift', attack: 'Left Click', grip: 'Right Click / F', mount: 'E', whistle: 'Q', beam: 'R', focus: 'Tab / Middle Click', pause: 'Esc',
    };
    return this.usingPad ? pad[action] : kb[action];
  }
}

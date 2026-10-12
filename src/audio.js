// Tiny WebAudio synth: no audio files needed.
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicTimer = 0;
    this.intensity = 0;
    this.beat = 0;
  }

  start() {
    if (this.ctx) {
      this.ctx.resume?.();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);

    // Gentle wind bed
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.05;
    src.connect(f).connect(this.windGain).connect(this.master);
    src.start();

    this.delay = this.ctx.createDelay();
    this.delay.delayTime.value = 0.38;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.35;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(this.master);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  tone(freq, dur = 0.3, { type = 'sine', vol = 0.2, attack = 0.01, delay = 0, echo = false, slide = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    if (echo) g.connect(this.delay);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dur = 0.3, { vol = 0.3, freq = 800, type = 'lowpass', delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  whistle() {
    this.tone(1320, 0.18, { vol: 0.12 });
    this.tone(1760, 0.3, { vol: 0.12, delay: 0.16, echo: true });
  }
  jump() {
    this.tone(420, 0.12, { type: 'triangle', vol: 0.06, slide: 1.6 });
  }
  grab() {
    this.noise(0.08, { vol: 0.12, freq: 2000 });
  }
  hurt() {
    this.tone(300, 0.25, { type: 'square', vol: 0.07, slide: 0.5 });
  }
  strike(power) {
    this.tone(880 + power * 600, 0.4, { type: 'triangle', vol: 0.15, echo: true });
    this.noise(0.15, { vol: 0.2, freq: 3000, type: 'highpass' });
  }
  chargeTick(level) {
    this.tone(500 + level * 700, 0.08, { vol: 0.04 });
  }
  shatter() {
    [0, 4, 7, 12, 16].forEach((s, i) => this.tone(660 * Math.pow(2, s / 12), 0.7, { vol: 0.1, delay: i * 0.06, echo: true }));
    this.noise(0.5, { vol: 0.25, freq: 4000, type: 'highpass' });
  }
  stomp() {
    this.tone(70, 0.6, { type: 'sine', vol: 0.5, slide: 0.5 });
    this.noise(0.5, { vol: 0.35, freq: 300 });
  }
  rumble() {
    this.tone(55, 1.2, { type: 'sawtooth', vol: 0.06, slide: 0.8 });
  }
  groan() {
    this.tone(90, 1.4, { type: 'sawtooth', vol: 0.08, slide: 0.7, attack: 0.3 });
    this.tone(135, 1.4, { type: 'triangle', vol: 0.06, slide: 0.7, attack: 0.3 });
  }
  bubble() {
    this.tone(300, 0.2, { vol: 0.08, slide: 2.5 });
  }
  pop() {
    this.tone(900, 0.12, { vol: 0.08, slide: 0.4 });
  }
  fanfare() {
    const notes = [0, 4, 7, 12, 7, 12, 16, 19];
    notes.forEach((s, i) => this.tone(523 * Math.pow(2, s / 12), 0.6, { type: 'triangle', vol: 0.12, delay: i * 0.14, echo: true }));
  }
  splash() {
    this.noise(0.4, { vol: 0.2, freq: 1200 });
  }

  update(dt, { intensity = 0, speed = 0 } = {}) {
    if (!this.ctx || this.muted) return;
    this.intensity += (intensity - this.intensity) * Math.min(1, dt * 0.8);
    if (this.windGain) this.windGain.gain.value = 0.04 + Math.min(speed / 20, 1) * 0.08;
    this.musicTimer -= dt;
    if (this.musicTimer <= 0) {
      const fight = this.intensity > 0.4;
      this.musicTimer = fight ? 0.25 : 0.55 + Math.random() * 0.9;
      const root = fight ? 220 : 392;
      if (fight) {
        this.beat = (this.beat + 1) % 8;
        if (this.beat % 4 === 0) this.tone(65, 0.3, { vol: 0.25 * this.intensity, slide: 0.6 });
        if (this.beat % 2 === 1) this.tone(root * Math.pow(2, PENTA[(this.beat * 3) % 5] / 12), 0.22, { type: 'square', vol: 0.025 });
        if (Math.random() < 0.3) this.tone(root * 2 * Math.pow(2, PENTA[Math.floor(Math.random() * 6)] / 12), 0.5, { type: 'triangle', vol: 0.05, echo: true });
      } else if (Math.random() < 0.75) {
        const s = PENTA[Math.floor(Math.random() * PENTA.length)];
        this.tone(root * Math.pow(2, s / 12), 1.6, { type: 'sine', vol: 0.045, attack: 0.05, echo: true });
        if (Math.random() < 0.25) this.tone((root / 2) * Math.pow(2, PENTA[Math.floor(Math.random() * 4)] / 12), 2.5, { type: 'triangle', vol: 0.03, attack: 0.3 });
      }
    }
  }
}

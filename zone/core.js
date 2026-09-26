'use strict';
// Утилиты, пространственная сетка, звук (WebAudio, без файлов)
const U = {
  rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; },
  clamp: (v, a, b) => v < a ? a : v > b ? b : v,
  lerp: (a, b, t) => a + (b - a) * t,
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; },
  angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); },
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  wpick(arr, w) { let s = 0; for (const x of w) s += x; let r = Math.random() * s; for (let i = 0; i < arr.length; i++) { r -= w[i]; if (r <= 0) return arr[i]; } return arr[arr.length - 1]; },
};

class Grid {
  constructor(c) { this.c = c; this.m = new Map(); }
  add(o) { const k = Math.floor(o.x / this.c) + ',' + Math.floor(o.y / this.c); let a = this.m.get(k); if (!a) this.m.set(k, a = []); a.push(o); }
  query(x, y, r, fn) {
    const c = this.c;
    for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++)
      for (let j = Math.floor((y - r) / c); j <= Math.floor((y + r) / c); j++) {
        const a = this.m.get(i + ',' + j); if (a) for (const o of a) fn(o);
      }
  }
}

const Snd = {
  ctx: null, vol: 0.6,
  init() {
    if (this.ctx) return;
    try {
      const c = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = c.createGain(); this.master.gain.value = this.vol; this.master.connect(c.destination);
      const len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.nb = b;
      // ветер
      const w = c.createBufferSource(); w.buffer = b; w.loop = true;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
      const g = c.createGain(); g.gain.value = 0.05;
      w.connect(f); f.connect(g); g.connect(this.master); w.start();
      const l = c.createOscillator(); l.frequency.value = 0.12; const lg = c.createGain(); lg.gain.value = 0.03;
      l.connect(lg); lg.connect(g.gain); l.start();
      this.windG = g;
      // дождь
      const rs = c.createBufferSource(); rs.buffer = b; rs.loop = true;
      const rf = c.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 3000; rf.Q.value = 0.4;
      this.rainG = c.createGain(); this.rainG.gain.value = 0; rs.connect(rf); rf.connect(this.rainG); this.rainG.connect(this.master); rs.start();
      // гул аномалии рядом
      this.hum = c.createOscillator(); this.hum.type = 'sawtooth'; this.hum.frequency.value = 60;
      this.humG = c.createGain(); this.humG.gain.value = 0;
      const hf = c.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 300;
      this.hum.connect(hf); hf.connect(this.humG); this.humG.connect(this.master); this.hum.start();
      // сирена выброса
      this.sir = c.createOscillator(); this.sir.type = 'sawtooth'; this.sir.frequency.value = 520;
      this.sirG = c.createGain(); this.sirG.gain.value = 0;
      const sl = c.createOscillator(); sl.frequency.value = 0.35; const slg = c.createGain(); slg.gain.value = 120;
      sl.connect(slg); slg.connect(this.sir.frequency);
      const sf = c.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 900;
      this.sir.connect(sf); sf.connect(this.sirG); this.sirG.connect(this.master); this.sir.start(); sl.start();
    } catch (e) { this.ctx = null; }
  },
  noise(dur, vol, freq, type = 'lowpass') {
    if (!this.ctx) return; const c = this.ctx, s = c.createBufferSource(); s.buffer = this.nb;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(0, Math.random(), dur + 0.05);
  },
  blip(freq, dur, vol = 0.12, type = 'sine', slide = 0) {
    if (!this.ctx) return; const c = this.ctx, o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), c.currentTime + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g); g.connect(this.master); o.start(); o.stop(c.currentTime + dur + 0.02);
  },
  shot() { this.noise(0.18, 0.5, 2200); this.blip(120, 0.12, 0.2, 'square', -80); },
  tick() { this.blip(1400, 0.05, 0.08, 'square'); },
  clink() { this.blip(2100, 0.09, 0.07, 'triangle', -600); },
  zap() { this.noise(0.25, 0.4, 5000, 'highpass'); this.blip(90, 0.2, 0.2, 'sawtooth', 300); },
  hit() { this.noise(0.1, 0.3, 500); },
  growl() { this.blip(70, 0.35, 0.12, 'sawtooth', -20); },
  geiger() { this.noise(0.012, 0.15, 3500, 'highpass'); },
  pick() { this.blip(700, 0.08, 0.1, 'triangle', 300); },
  boom() { this.noise(1.6, 0.7, 200); this.blip(45, 1.4, 0.3, 'sine', -20); },
  setHum(f, v) { if (!this.ctx) return; this.hum.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.1); this.humG.gain.setTargetAtTime(v, this.ctx.currentTime, 0.15); },
  setWeather(rain, wind) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.rainG.gain.setTargetAtTime(rain * 0.09, t, 0.8); this.windG.gain.setTargetAtTime(0.05 + wind * 0.08, t, 1);
  },
  step(mode) { this.noise(0.05, mode === 2 ? 0.09 : mode === 0 ? 0.02 : 0.05, mode === 2 ? 900 : 600); },
  thunder(delay) { setTimeout(() => { this.noise(2.2, 0.8, 160); this.blip(38, 1.8, 0.35, 'sine', -8); }, delay * 1000); },
  grind() { this.noise(1.0, 0.35, 900, 'bandpass'); this.blip(70, 1.0, 0.15, 'sawtooth', 40); },
  chirp() { const f = 2200 + Math.random() * 1400; this.blip(f, 0.07, 0.03, 'sine', 500); setTimeout(() => this.blip(f + 300, 0.06, 0.03, 'sine', 400), 90); },
  cricket() { this.blip(4300, 0.03, 0.02, 'square'); setTimeout(() => this.blip(4300, 0.03, 0.02, 'square'), 60); },
  crackle() { this.noise(0.03, 0.04, 2500, 'highpass'); },
  beat() { this.blip(55, 0.12, 0.25, 'sine', -15); setTimeout(() => this.blip(50, 0.1, 0.18, 'sine', -15), 160); },
  // звук существа на расстоянии от игрока
  at(kind, x, y) {
    if (!this.ctx) return; const d = Math.hypot(x - P.x, y - P.y), v = Math.max(0, 1 - d / 520); if (v <= 0.03) return;
    switch (kind) {
      case 'click': this.blip(3200, 0.02, 0.12 * v, 'square'); setTimeout(() => this.blip(2800, 0.02, 0.1 * v, 'square'), 70); break;
      case 'clank': this.blip(260, 0.14, 0.2 * v, 'square', -120); this.noise(0.08, 0.2 * v, 3500, 'highpass'); break;
      case 'chime': this.blip(1300, 0.4, 0.1 * v, 'sine', -400); break;
      case 'whisper': this.noise(0.7, 0.16 * v, 1700, 'bandpass'); break;
      case 'yelp': this.blip(600, 0.15, 0.14 * v, 'sawtooth', -300); break;
      case 'rumble': this.blip(55, 0.5, 0.12 * v, 'sawtooth', -15); break;
      case 'crunch': this.noise(0.1, 0.25 * v, 1800); this.blip(200, 0.06, 0.1 * v, 'square'); break;
      case 'shot': this.noise(0.15, 0.35 * v, 2000); break;
      case 'die': this.blip(220, 0.35, 0.16 * v, 'sawtooth', -170); break;
    }
  },
  siren(on) { if (!this.ctx) return; this.sirG.gain.setTargetAtTime(on ? 0.12 : 0, this.ctx.currentTime, 0.3); },
};

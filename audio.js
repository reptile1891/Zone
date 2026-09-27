'use strict';
// Звук и музыка (дополнение к Snd из core.js): живой фон, который зависит от места, времени суток и опасности, и новые эффекты.
//   Музыка — процедурная (Web Audio, без файлов): пад из трёх голосов со сменой аккордов, низкий «гул тревоги», редкие ноты (у костра — тёплые,
//   ночью — далёкий звон), при погоне — глухой пульс. Режим и напряжение считает Snd.mood() (чистая функция: тестируется без звука).
//   Настройки — в меню (громкость, музыка вкл/выкл, громкость музыки), хранятся в localStorage 'zone_snd'.
Object.assign(Snd, {
  musOn: true, musVol: 0.6,
  // (root, ratios): корни аккордов по режимам и их окраска
  MODES: {
    camp: { roots: [65.4, 55, 49, 55], ratio: [1, 1.26, 1.498], mul: 0.75, flt: 900 },
    day: { roots: [55, 49, 43.7, 49], ratio: [1, 1.189, 1.498], mul: 0.9, flt: 700 },
    night: { roots: [41.2, 36.7, 43.7, 36.7], ratio: [1, 1.189, 1.498], mul: 1, flt: 420 },
    deep: { roots: [32.7, 34.6, 32.7, 30.9], ratio: [1, 1.06, 1.414], mul: 1, flt: 320 },
  },
  loadPrefs() { try { const o = JSON.parse(localStorage.getItem('zone_snd') || '{}'); if (typeof o.vol === 'number') this.vol = U.clamp(o.vol, 0, 1); if (o.mus != null) this.musOn = !!o.mus; if (typeof o.mv === 'number') this.musVol = U.clamp(o.mv, 0, 1); } catch (e) { /* без настроек */ } },
  savePrefs() { try { localStorage.setItem('zone_snd', JSON.stringify({ vol: this.vol, mus: this.musOn ? 1 : 0, mv: this.musVol })); } catch (e) { /* без настроек */ } },
  // Режим музыки и напряжение 0..1: погоня, стрельба, выброс, низкое здоровье, глубина
  mood() {
    const camp = G.scene === 'camp' || G.scene === 'interior' || (G.scene === 'zone' && inCamp()), mode = camp ? 'camp' : G.scene === 'dungeon' ? 'deep' : G.night > 0.5 ? 'night' : 'day';
    let ten = 0;
    if (!camp) {
      if (G.emi && (G.emi.s === 'warn' || G.emi.s === 'blast')) ten += 0.85;
      if (G.scene === 'dungeon') { for (const e of Dungeon.enemies || []) if (!e.dead && e.state === 'hunt' && Math.hypot(e.x - P.x, e.y - P.y) < 300) ten += 0.3; }
      else {
        for (const m of Mutants.list) if (!m.dead && m.state === 'hunt' && Math.abs(m.x - P.x) < 420 && Math.abs(m.y - P.y) < 420 && Math.hypot(m.x - P.x, m.y - P.y) < 420) ten += 0.28;
        for (const s of Stalkers.list) if (!s.dead && s.state === 'combat' && Math.hypot(s.x - P.x, s.y - P.y) < 420) ten += 0.3;
        ten += (W.danger(P.x, P.y) - 1) * 0.05;
      }
      if (P.hp < 35) ten += 0.25; if (P.stress > 75) ten += 0.15; ten += G.night * 0.08;
    }
    return { mode, ten: U.clamp(ten, 0, 1) };
  },
  initMusic() {
    const c = this.ctx; if (!c || this.musG) return;
    this.musG = c.createGain(); this.musG.gain.value = 0; this.musG.connect(this.master);
    this.musF = c.createBiquadFilter(); this.musF.type = 'lowpass'; this.musF.frequency.value = 600; this.musF.connect(this.musG);
    this.pad = [0.5, 0.34, 0.24].map((v, i) => { const o = c.createOscillator(); o.type = i === 2 ? 'triangle' : 'sine'; o.frequency.value = 55 * [1, 1.189, 1.498][i]; const g = c.createGain(); g.gain.value = v; o.connect(g); g.connect(this.musF); o.start(); return o; });
    const l = c.createOscillator(); l.frequency.value = 0.06; const lg = c.createGain(); lg.gain.value = 160; l.connect(lg); lg.connect(this.musF.frequency); l.start();
    this.tenO = c.createOscillator(); this.tenO.type = 'sawtooth'; this.tenO.frequency.value = 41;
    const tf = c.createBiquadFilter(); tf.type = 'lowpass'; tf.frequency.value = 180; this.tenG = c.createGain(); this.tenG.gain.value = 0;
    this.tenO.connect(tf); tf.connect(this.tenG); this.tenG.connect(this.master); this.tenO.start();
    this.chord = 0; this.chordT = 0; this.pluckT = 4; this.beatT = 0;
  },
  // вызывается каждый кадр (update): плавно ведёт громкости и меняет аккорды
  tickMusic(dt) {
    if (!this.ctx || !this.musG || !G.started) return;
    if ((this._mt = (this._mt || 0) - dt) > 0) return; this._mt = 0.25;
    const t = this.ctx.currentTime, m = this.mood(), M = this.MODES[m.mode], on = this.musOn && !G.dead;
    this.musG.gain.setTargetAtTime(on ? this.musVol * 0.16 * M.mul * (1 - m.ten * 0.35) : 0, t, 1.2);
    this.musF.frequency.setTargetAtTime(M.flt * (1 + m.ten * 0.5), t, 1.5);
    this.tenG.gain.setTargetAtTime(on ? m.ten * m.ten * 0.09 * this.musVol : 0, t, 0.8); this.tenO.frequency.setTargetAtTime(38 + m.ten * 9, t, 1);
    this.chordT -= 0.25;
    if (this.chordT <= 0 || this._mode !== m.mode) {
      this._mode = m.mode; this.chordT = 12 + Math.random() * 8; this.chord = (this.chord + 1) % M.roots.length;
      const r = M.roots[this.chord] * (m.mode === 'day' || m.mode === 'camp' ? 2 : 1); this.pad.forEach((o, i) => o.frequency.setTargetAtTime(r * M.ratio[i], t, 2.5));
      this._root = r;
    }
    if (!on) return;
    this.pluckT -= 0.25;
    if (this.pluckT <= 0) {
      const r = this._root || 110;
      if (m.mode === 'camp') { const sc = [1, 1.125, 1.26, 1.498, 1.68, 2]; this.pluckT = 3 + Math.random() * 6; this.blip(r * 2 * sc[Math.floor(Math.random() * sc.length)], 1.8, 0.05 * this.musVol, 'triangle'); }
      else if (m.mode === 'night') { this.pluckT = 9 + Math.random() * 14; this.blip(r * 8 * (Math.random() < 0.5 ? 1 : 1.498), 3, 0.025 * this.musVol, 'sine'); }
      else if (m.mode === 'day' && m.ten < 0.3) { this.pluckT = 7 + Math.random() * 12; this.blip(r * 4 * (Math.random() < 0.5 ? 1 : 1.189), 2.2, 0.03 * this.musVol, 'triangle'); }
      else this.pluckT = 4;
    }
    if (m.ten > 0.55) { this.beatT -= 0.25; if (this.beatT <= 0) { this.beatT = 0.75 - m.ten * 0.3; this.blip(52, 0.16, 0.12 * this.musVol * m.ten, 'sine', -14); } }
  },
  // ---- новые эффекты ----
  whoosh() { this.noise(0.22, 0.13, 1600, 'bandpass'); this.blip(420, 0.16, 0.03, 'sine', -250); },
  hookCatch() { this.blip(1500, 0.07, 0.11, 'square'); setTimeout(() => this.blip(900, 0.12, 0.09, 'triangle', -300), 70); this.noise(0.15, 0.15, 3000, 'highpass'); },
  hookFail() { this.blip(320, 0.22, 0.09, 'sawtooth', -200); this.noise(0.1, 0.1, 800); },
  achieve() { [0, 4, 7, 12].forEach((s, i) => setTimeout(() => this.blip(523 * Math.pow(2, s / 12), 0.42, 0.08, 'triangle'), i * 110)); },
  sector(n) { this.blip(60 / Math.max(1, n * 0.6), 1.3, 0.1, 'sawtooth', -10); this.noise(0.9, 0.12, 180); },
  evCargo() { this.blip(1900, 0.5, 0.06, 'sine', -1400); setTimeout(() => { this.noise(0.14, 0.2, 3200, 'bandpass'); this.blip(880, 0.1, 0.07, 'square'); this.blip(660, 0.1, 0.07, 'square'); }, 480); },
  evAmbush() { this.blip(82, 0.6, 0.15, 'sawtooth', -30); setTimeout(() => this.blip(78, 0.5, 0.13, 'sawtooth', -30), 320); this.noise(0.3, 0.1, 500); },
  evSurge() { this.noise(1.0, 0.22, 4200, 'highpass'); this.blip(180, 1.0, 0.1, 'sawtooth', 700); },
  evPeddler() { [0, 3, 7].forEach((s, i) => setTimeout(() => this.blip(1320 * Math.pow(2, s / 12), 0.28, 0.05, 'sine'), i * 130)); },
  menuRows() {
    return '<div class="row"><div class="nm">Музыка: <b>' + (this.musOn ? 'включена' : 'выключена') + '</b><div class="sub">фон меняется от места, времени суток и опасности</div></div>' + btn('mus:toggle', this.musOn ? 'Выкл' : 'Вкл') + '</div>' +
      '<div class="row"><div class="nm">Громкость музыки: <b>' + Math.round(this.musVol * 100) + '%</b></div>' + btn('mus:down', '−') + btn('mus:up', '+') + '</div>';
  },
});

(function () {
  Snd.loadPrefs();
  const _init = Snd.init; Snd.init = function () { const had = this.ctx; _init.call(this); if (!had && this.ctx) { this.master.gain.value = this.vol; this.initMusic(); } };
  // звук существа, погибшего в аномалии (запись «zapdie»): дальний треск и вскрик
  const _at = Snd.at; Snd.at = function (kind, x, y) {
    if (kind !== 'zapdie') return _at.call(this, kind, x, y);
    if (!this.ctx) return; const d = Math.hypot(x - P.x, y - P.y), v = Math.max(0, 1 - d / 520); if (v <= 0.03) return;
    this.noise(0.25, 0.3 * v, 4500, 'highpass'); this.blip(300, 0.3, 0.14 * v, 'sawtooth', -220);
  };
  const _upd = update; update = function (dt) { _upd(dt); Snd.tickMusic(dt); };
  const _click = Meta.click; Meta.click = function (a, arg, arg2, u) {
    if (a === 'mus') { if (arg === 'toggle') Snd.musOn = !Snd.musOn; else Snd.musVol = U.clamp(Math.round((Snd.musVol + (arg === 'up' ? 0.1 : -0.1)) * 10) / 10, 0, 1); Snd.savePrefs(); return true; }
    if (a === 'vol') setTimeout(() => Snd.savePrefs(), 0);   // громкость меняет panelClick, запоминаем после него
    return _click.call(this, a, arg, arg2, u);
  };
})();

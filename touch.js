'use strict';
// Управление на телефоне. Включается на устройствах с пальцем вместо мыши ((pointer: coarse)) или по адресу ?touch=1 (?touch=0 — выключить).
//  • левая половина экрана — плавающий стик движения (аналоговый: чем дальше, тем быстрее; keys.stick читает update в main.js);
//  • правая половина — стик прицела: тянешь — целишься и стреляешь (расстояние броска болта зависит от длины); короткий тап — один выстрел/применение;
//    долгое касание без сдвига — «осмотреться» (аналог правой кнопки мыши);
//  • кнопки: действие (E, показывает, что именно), рюкзак, карта, журнал, меню, красться, бег, полный экран;
//  • быстрые слоты — обычные, на второе касание слота 1 меняется оружие; портретная ориентация просит повернуть телефон.
// Всё остальное (панели, торговля) — обычные нажатия по кнопкам, для пальца они увеличены стилями body.touch.
const Touch = {
  on: false, R: 56, DEAD: 0.14, AIM_DEAD: 0.3, LONG: 450,
  L: null, A: null,            // активные касания: {id, ox, oy, x, y, t, moved, fired}
  inspect: false, lastAim: { x: 1, y: 0, n: 0.6 },

  // Вектор стика: x, y — с учётом длины (0..1), n — длина
  vec(dx, dy) { const l = Math.hypot(dx, dy), n = Math.min(1, l / this.R); return l ? { x: dx / l * n, y: dy / l * n, n } : { x: 0, y: 0, n: 0 }; },
  detect() {
    try {
      const q = new URLSearchParams(location.search); if (q.has('touch')) return q.get('touch') !== '0';
      return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    } catch (e) { return false; }
  },
  // Направить прицел по вектору стика: точка перед игроком, дальше — при сильнее оттянутом стике
  aim(v) {
    const l = Math.hypot(v.x, v.y) || 1, ux = v.x / l, uy = v.y / l, d = 80 + Math.min(1, v.n) * 320;
    mouse.x = P.x - cam.x + ux * d; mouse.y = P.y - cam.y + uy * d; this.lastAim = { x: ux, y: uy, n: v.n };
  },
  key(code) { dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true })); dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })); },

  // ---------- касания ----------
  down(e) {
    e.preventDefault(); const right = e.clientX > innerWidth * 0.5, s = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, t: performance.now(), moved: false, fired: false };
    if (!right && !this.L) { this.L = s; this.ring('L', s); } else if (right && !this.A) {
      this.A = s; this.ring('A', s);
      s.timer = setTimeout(() => { if (this.A === s && !s.moved) { this.inspect = true; mouse.x = s.x; mouse.y = s.y; mouse.r = true; } }, this.LONG);
    } else return;
    try { this.tz.setPointerCapture(e.pointerId); } catch (err) { /* не критично */ }
  },
  move(e) {
    const s = this.L && this.L.id === e.pointerId ? this.L : this.A && this.A.id === e.pointerId ? this.A : null; if (!s) return; e.preventDefault();
    s.x = e.clientX; s.y = e.clientY; const v = this.vec(s.x - s.ox, s.y - s.oy);
    if (s === this.L) { keys.stick = v.n > this.DEAD ? { x: v.x, y: v.y } : null; this.knob('L', s, v); return; }
    this.knob('A', s, v);
    if (v.n > this.AIM_DEAD) {
      s.moved = true; clearTimeout(s.timer); this.aim(v); mouse.l = true; if (!s.fired) { mouse.tap = true; s.fired = true; }
    } else if (s.moved) mouse.l = false;
  },
  up(e) {
    if (this.L && this.L.id === e.pointerId) { keys.stick = null; this.hideRing('L'); this.L = null; return; }
    const s = this.A; if (!s || s.id !== e.pointerId) return;
    clearTimeout(s.timer); mouse.l = false;
    if (this.inspect) { this.inspect = false; mouse.r = false; }
    else if (!s.moved && performance.now() - s.t < 300) { this.aim(this.lastAim); mouse.tap = true; }   // короткий тап: один выстрел туда, куда смотрел
    this.hideRing('A'); this.A = null;
  },
  release() { keys.stick = null; mouse.l = mouse.r = false; this.inspect = false; if (this.L) this.hideRing('L'); if (this.A) { clearTimeout(this.A.timer); this.hideRing('A'); } this.L = this.A = null; },

  // ---------- вид ----------
  ring(k, s) { const r = this.rings[k]; r.style.display = 'block'; r.style.left = s.ox - this.R + 'px'; r.style.top = s.oy - this.R + 'px'; this.knob(k, s, { x: 0, y: 0, n: 0 }); },
  knob(k, s, v) { const r = this.rings[k]; r.firstChild.style.transform = 'translate(' + v.x * this.R + 'px,' + v.y * this.R + 'px)'; },
  hideRing(k) { this.rings[k].style.display = 'none'; },
  mk(tag, id, css, parent) { const el = document.createElement(tag); if (id) el.id = id; if (css) el.className = css; (parent || document.body).appendChild(el); return el; },
  btn(parent, cls, label, title, fn) {
    const b = this.mk('div', null, 'tb ' + cls, parent); b.textContent = label; b.title = title || '';
    b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); fn(b); });
    return b;
  },
  toggle(code, b) { keys[code] = !keys[code]; b.classList.toggle('on', !!keys[code]); },
  init() {
    this.on = this.detect(); if (!this.on) return this;
    document.body.classList.add('touch');
    const tz = this.tz = this.mk('div', 'tz'), box = this.mk('div', 'tbtns');
    this.rings = { L: this.mk('div', null, 'tring'), A: this.mk('div', null, 'tring a') };
    for (const k in this.rings) this.mk('i', null, '', this.rings[k]);
    tz.addEventListener('pointerdown', e => this.down(e)); tz.addEventListener('pointermove', e => this.move(e));
    tz.addEventListener('pointerup', e => this.up(e)); tz.addEventListener('pointercancel', e => this.up(e)); tz.addEventListener('contextmenu', e => e.preventDefault());
    const top = this.mk('div', null, 'trow', box);
    this.btn(top, '', '🎒', 'Рюкзак', () => this.key('KeyI')); this.btn(top, '', '🗺', 'Карта', () => this.key('KeyM')); this.btn(top, '', '📖', 'Журнал', () => this.key('KeyJ')); this.btn(top, '', '📚', 'Справочник', () => this.key('KeyB')); this.btn(top, '', '☰', 'Меню', () => this.key('Escape'));
    this.btn(top, '', '⛶', 'Полный экран', () => { try { const d = document.documentElement; (d.requestFullscreen || d.webkitRequestFullscreen).call(d); if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (err) { /* не везде доступно */ } });
    const side = this.mk('div', null, 'tside', box);
    this.sneakB = this.btn(side, 'w', 'Красться', 'Красться (тихо)', b => { keys.ShiftLeft = false; this.runB.classList.remove('on'); this.toggle('KeyC', b); });
    this.runB = this.btn(side, 'w', 'Бег', 'Бег (тратит силы, шумно)', b => { keys.KeyC = false; this.sneakB.classList.remove('on'); this.toggle('ShiftLeft', b); });
    this.actB = this.btn(side, 'act', 'E', 'Действие', () => { if (G.near && !G.dead) G.near.fn(); });
    this.actB.style.display = 'none';
    this.rot = this.mk('div', 'trot'); this.rot.innerHTML = '<div>↻<br>Поверните телефон горизонтально</div>';
    const qk = document.getElementById('quick');   // второе касание слота 1 меняет оружие (на клавиатуре — повторное нажатие 1)
    if (qk) qk.addEventListener('click', e => { const q = e.target.closest('[data-q]'); if (q && +q.dataset.q === 0 && P.sel === 0) Meta.cycleWeapon(); }, true);
    const keysEl = document.querySelector('#splash .keys');
    if (keysEl) keysEl.innerHTML = '<div>Левый палец — движение</div><div>Правый палец — целиться и стрелять (тянуть)</div><div>Короткий тап справа — один выстрел</div><div>Долгое касание справа — осмотреться</div><div>Кнопка с зелёной подписью — действие (E)</div><div>Красться / Бег — переключатели</div><div>Слоты внизу — выбор предмета</div><div>🎒 🗺 📖 ☰ — рюкзак, карта, журнал, меню</div>';
    const loop = () => { this.tick(); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
    return this;
  },
  // Каждый кадр: показ элементов, автоповорот по движению, кнопка действия
  tick() {
    if (typeof G === 'undefined' || typeof P === 'undefined') return;
    const play = G.started && !G.ui && !G.dead;
    this.tz.style.display = play ? 'block' : 'none'; document.getElementById('tbtns').style.display = G.started ? 'block' : 'none';
    this.rot.style.display = innerHeight > innerWidth * 1.1 ? 'flex' : 'none';
    if (!play && (this.L || this.A || keys.stick)) this.release();
    if (!play) { this.actB.style.display = 'none'; return; }
    if (keys.stick && !this.A && (G.scene === 'zone' || G.scene === 'dungeon')) { this.aim({ x: keys.stick.x, y: keys.stick.y, n: 0.5 }); }   // без прицела смотрим по ходу движения
    const near = G.near; this.actB.style.display = near ? 'flex' : 'none'; if (near) { const t = '[E] ' + near.label; if (this.actB.textContent !== t) this.actB.textContent = t; }
  },
};
if (typeof document !== 'undefined' && document.body && typeof document.addEventListener === 'function' && typeof requestAnimationFrame === 'function') Touch.init();

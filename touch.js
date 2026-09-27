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
  // Настройки (localStorage 'zone_ui'): aim — автоприцел 0 выкл / 1 слабый / 2 сильный; ss, bs — размер стика и кнопок; left — левша; vib — вибрация
  set: { aim: 1, ss: 1, bs: 1, left: 0, vib: 1 }, AIMS: ['Выкл', 'Слабый', 'Сильный'], SIZES: [0.8, 1, 1.25, 1.5], SIZENAMES: ['малый', 'обычный', 'крупный', 'очень крупный'], target: null, buzzT: 0,
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
  // Цель для автоприцела: ближайший к направлению прицела враг в конусе (слабый ≈ 15°, сильный ≈ 29°) и в пределах дальности оружия. Только когда в руках оружие
  assist(ux, uy) {
    const lvl = this.set.aim; if (!lvl || heldNames[P.sel] !== 'weapon') return null;
    const w = Wpn.of(P.weapon), rng = (w.range || 400) * 1.02, cone = lvl === 2 ? 0.5 : 0.26, a0 = Math.atan2(uy, ux); let best = null, bs = 1e9;
    const test = o => {
      const dx = o.x - P.x, dy = o.y - P.y, d = Math.hypot(dx, dy); if (d < 10 || d > rng) return;
      let da = Math.abs(Math.atan2(dy, dx) - a0); if (da > Math.PI) da = 2 * Math.PI - da; if (da > cone) return;
      const sc = da * 260 + d * 0.15; if (sc < bs) { bs = sc; best = { x: o.x, y: o.y, d }; }
    };
    if (G.scene === 'zone') {
      for (const m of Mutants.list) if (!m.dead && !Mutants.hidden(m) && !(m.sp === 'cinder' && m.state === 'sleep') && !(m.sp === 'fogger' && m.state === 'sleep')) test(m);
      for (const s of Stalkers.list) if (!s.dead && s.hostile) test(s);
    } else if (G.scene === 'dungeon' && typeof Dungeon !== 'undefined') for (const e of Dungeon.enemies || []) if (!e.dead && e.alpha() > 0.3) test(e);
    return best;
  },
  // Направить прицел по вектору стика: точка перед игроком, дальше — при сильнее оттянутом стике. assist — довернуть на цель
  aim(v, assist) {
    const l = Math.hypot(v.x, v.y) || 1; let ux = v.x / l, uy = v.y / l, d = 80 + Math.min(1, v.n) * 320; this.lastAim = { x: ux, y: uy, n: v.n };
    const t = assist ? this.assist(ux, uy) : null; this.target = t;
    if (t) { ux = (t.x - P.x) / t.d; uy = (t.y - P.y) / t.d; d = t.d; }
    mouse.x = P.x - cam.x + ux * d; mouse.y = P.y - cam.y + uy * d;
  },
  // ---------- настройки ----------
  load() { try { const o = JSON.parse(localStorage.getItem('zone_ui') || '{}'); for (const k in this.set) if (typeof o[k] === 'number') this.set[k] = o[k]; } catch (e) { /* без сохранённых */ } },
  saveSet() { try { localStorage.setItem('zone_ui', JSON.stringify(this.set)); } catch (e) { /* не критично */ } },
  // Применить: размеры стика и кнопок (css-переменные), рука, радиус стика
  apply() {
    this.R = 56 * this.set.ss;
    if (typeof document !== 'undefined' && document.documentElement && document.documentElement.style && document.body && document.body.classList) {
      const st = document.documentElement.style; st.setProperty('--ss', this.set.ss); st.setProperty('--bs', this.set.bs); document.body.classList.toggle('lefty', !!this.set.left);
    }
  },
  // Сменить настройку по кругу; возвращает новое значение
  cycle(key) {
    const s = this.set;
    if (key === 'aim') s.aim = (s.aim + 1) % this.AIMS.length;
    else if (key === 'ss' || key === 'bs') s[key] = this.SIZES[(Math.max(0, this.SIZES.indexOf(s[key])) + 1) % this.SIZES.length];
    else if (key === 'left' || key === 'vib') s[key] = s[key] ? 0 : 1; else return null;
    this.apply(); this.saveSet(); return s[key];
  },
  menuRows() {
    const s = this.set, sz = v => this.SIZENAMES[Math.max(0, this.SIZES.indexOf(v))], r = (name, val, sub, key) => '<div class="row"><div class="nm">' + name + ': <b>' + val + '</b><div class="sub">' + sub + '</div></div>' + btn('tset:' + key, 'Сменить') + '</div>';
    return '<h3>Управление на телефоне</h3>' + r('Автоприцел', this.AIMS[s.aim], 'при стрельбе доворачивает на ближайшего врага (оружие в руках)', 'aim') + r('Размер стика', sz(s.ss), 'кольца движения и прицела', 'ss') + r('Размер кнопок', sz(s.bs), 'рюкзак, карта, красться и т. д.', 'bs')
      + r('Левша', s.left ? 'да' : 'нет', 'поменять стороны: движение справа, прицел слева', 'left') + r('Вибрация', s.vib ? 'включена' : 'выключена', 'при выстреле и ударах по тебе', 'vib');
  },
  buzz(ms) { const now = Date.now(); if (this.set.vib && typeof navigator !== 'undefined' && navigator.vibrate && now - this.buzzT > 90) { this.buzzT = now; try { navigator.vibrate(ms); } catch (e) { /* не везде */ } } },
  key(code) { dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true })); dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })); },

  // ---------- касания ----------
  down(e) {
    e.preventDefault(); const right = this.set.left ? e.clientX < innerWidth * 0.5 : e.clientX > innerWidth * 0.5, s = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, t: performance.now(), moved: false, fired: false };
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
    s.v = v;
    if (v.n > this.AIM_DEAD) {
      s.moved = true; clearTimeout(s.timer); this.aim(v, true); mouse.l = true; if (!s.fired) { mouse.tap = true; s.fired = true; }
    } else if (s.moved) mouse.l = false;
  },
  up(e) {
    if (this.L && this.L.id === e.pointerId) { keys.stick = null; this.hideRing('L'); this.L = null; return; }
    const s = this.A; if (!s || s.id !== e.pointerId) return;
    clearTimeout(s.timer); mouse.l = false;
    if (this.inspect) { this.inspect = false; mouse.r = false; }
    else if (!s.moved && performance.now() - s.t < 300) { this.aim(this.lastAim, true); mouse.tap = true; }   // короткий тап: один выстрел туда, куда смотрел
    this.hideRing('A'); this.A = null;
  },
  release() { this.target = null; keys.stick = null; mouse.l = mouse.r = false; this.inspect = false; if (this.L) this.hideRing('L'); if (this.A) { clearTimeout(this.A.timer); this.hideRing('A'); } this.L = this.A = null; },

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
    document.body.classList.add('touch'); this.load(); this.apply();
    this.mark = this.mk('div', 'taim');
    // вибрация: выстрел и заметный урон по игроку
    const _sh = shoot; shoot = function () { const c0 = P.cd; _sh.apply(this, arguments); if (c0 <= 0 && P.cd > 0) Touch.buzz(12); };
    const _hurt = P.hurt; P.hurt = function (d) { const h0 = this.hp; const r = _hurt.apply(this, arguments); if (h0 - this.hp >= 2) Touch.buzz(35); return r; };
    const _mc = Meta.click; Meta.click = function (a, arg, arg2, u) { if (a === 'tset') { Touch.cycle(arg); return true; } return _mc.call(this, a, arg, arg2, u); };
    const tz = this.tz = this.mk('div', 'tz'), box = this.mk('div', 'tbtns');
    this.rings = { L: this.mk('div', null, 'tring'), A: this.mk('div', null, 'tring a') };
    for (const k in this.rings) this.mk('i', null, '', this.rings[k]);
    tz.addEventListener('pointerdown', e => this.down(e)); tz.addEventListener('pointermove', e => this.move(e));
    tz.addEventListener('pointerup', e => this.up(e)); tz.addEventListener('pointercancel', e => this.up(e)); tz.addEventListener('contextmenu', e => e.preventDefault());
    const top = this.mk('div', null, 'trow', box);
    this.btn(top, '', '🎒', 'Рюкзак', () => this.key('KeyI')); this.btn(top, '', '🗺', 'Карта', () => this.key('KeyM')); this.btn(top, '', '📖', 'Журнал', () => this.key('KeyJ')); this.btn(top, '', '🏆', 'Достижения', () => this.key('KeyK')); this.btn(top, '', '📚', 'Справочник', () => this.key('KeyB')); this.btn(top, '', '☰', 'Меню', () => this.key('Escape'));
    this.btn(top, '', '⛶', 'Полный экран', () => { try { const d = document.documentElement; (d.requestFullscreen || d.webkitRequestFullscreen).call(d); if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (err) { /* не везде доступно */ } });
    const side = this.mk('div', null, 'tside', box);
    this.sneakB = this.btn(side, 'w', 'Красться', 'Красться (тихо)', b => { keys.ShiftLeft = false; this.runB.classList.remove('on'); this.toggle('KeyC', b); });
    this.runB = this.btn(side, 'w', 'Бег', 'Бег (тратит силы, шумно)', b => { keys.KeyC = false; this.sneakB.classList.remove('on'); this.toggle('ShiftLeft', b); });
    this.actB = this.btn(side, 'act', 'E', 'Действие', () => { if (G.near && !G.dead) G.near.fn(); });
    this.actB.style.display = 'none';
    this.rot = this.mk('div', 'trot'); this.rot.innerHTML = '<div>↻<br>Поверните телефон горизонтально</div>';
    const qk = document.getElementById('quick');   // второе касание слота 1 меняет оружие (на клавиатуре — повторное нажатие 1)
    if (qk) qk.addEventListener('click', e => { const q = e.target.closest('[data-q]'); if (q && !G.ui && +q.dataset.q === P.sel) { if (heldNames[P.sel] === 'weapon') Meta.cycleWeapon(); else if (heldNames[P.sel] === 'melee') Melee.cycle(); } }, true);
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
    if (this.A && this.A.moved && this.A.v && this.A.v.n > this.AIM_DEAD) this.aim(this.A.v, true);   // цель движется — прицел следует за ней
    const mk = this.mark, tg = this.A && this.A.moved ? this.target : null;
    if (mk) { mk.style.display = tg ? 'block' : 'none'; if (tg) { mk.style.left = (tg.x - cam.x) + 'px'; mk.style.top = (tg.y - cam.y) + 'px'; } }
    const near = G.near; this.actB.style.display = near ? 'flex' : 'none'; if (near) { const t = '[E] ' + near.label; if (this.actB.textContent !== t) this.actB.textContent = t; }
  },
};
if (typeof document !== 'undefined' && document.body && typeof document.addEventListener === 'function' && typeof requestAnimationFrame === 'function') Touch.init();

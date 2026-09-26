'use strict';
// Артефакты и костюмы со случайными характеристиками (вслед за Wpn для оружия).
//
// Артефакт: набор свойств у каждого типа ВСЕГДА один и тот же (CFG.arts[id].fx), случайна только сила — множитель качества q.
//   q масштабирует числа свойств (регенерация, сопротивление и т.д.) и слегка — фон; «флаги» (притягивает/отпугивает мутантов) не меняются.
//   q лежит на экземпляре: слот рюкзака {id:'art', art, q}, контейнер {art, q}. Нет q (старые сохранения) = 1.
//   Пределы: 0.70–1.35; в глубине Зоны (luck) чуть выше. Пока артефакт не опознан, качество скрыто.
// Костюм: у каждого экземпляра свои множители к базе (защита, вес, износ); слот {id:'suit', n:1, g:{rar, m:{…}, name}}.
//   Редкости те же, что у оружия: чем выше — тем больше плюсов и меньше минусов. Без g (старые сохранения) — обычный.
const Gear = {
  // ---------- артефакты ----------
  Q: { lo: 0.7, hi: 1.35 },
  FLAGS: ['lure', 'repel'],
  GRADES: [{ n: 'Слабый', col: '#c98a70', max: 0.88 }, { n: 'Обычный', col: '#c9c2a8', max: 1.12 }, { n: 'Сильный', col: '#8fbf7f', max: 1.25 }, { n: 'Превосходный', col: '#e8a040', max: 9 }],
  rollQ(rnd = Math.random, luck = 0) { return +U.clamp(1 + (rnd() + rnd() - 1) * 0.32 + 0.03 * luck, this.Q.lo, this.Q.hi).toFixed(2); },
  qOf(s) { return (s && s.q) || 1; },
  grade(q) { return this.GRADES.find(g => (q || 1) < g.max) || this.GRADES[3]; },
  // Свойства артефакта с учётом качества: числа × q, флаги как есть
  fxOf(type, q = 1) { const o = {}, f = CFG.arts[type].fx; for (const k in f) o[k] = this.FLAGS.includes(k) ? f[k] : +(f[k] * q).toFixed(3); return o; },
  radOf(type, q = 1) { return CFG.arts[type].rad * (1 + (q - 1) * 0.5); },
  valMul(q) { return Math.pow(q || 1, 1.6); },
  // Экземпляр в контейнере: {art, q}
  slotOf(s) { return { art: s.art, q: this.qOf(s) }; },
  // Старые сохранения: контейнеры хранились строками
  fixEquip() { P.equip = (P.equip || []).map(e => (typeof e === 'string' ? { art: e, q: 1 } : e || null)); },

  // ---------- костюмы ----------
  TIERS: [{ n: 'Обычный', col: '#c9c2a8' }, { n: 'Хороший', col: '#8fbf7f' }, { n: 'Редкий', col: '#6fa8e8' }, { n: 'Уникальный', col: '#e8a040' }],
  WEIGHTS: [66, 26, 7, 1],
  BASE: { suit: { rad: 0.25, anom: 0.1 }, suit2: { rad: 0.45, anom: 0.25 }, firecoat: { fire: 0.6 } },
  // sign: +1 — рост множителя улучшает параметр; для веса и износа наоборот
  STATS: {
    rad:  { sign: +1, lo: 0.08, hi: 0.22, lim: [0.80, 1.30], w: 1.0,  adj: ['Свинцовый', 'Тонкий'] },
    anom: { sign: +1, lo: 0.10, hi: 0.30, lim: [0.70, 1.40], w: 0.6,  adj: ['Изолирующий', 'Дырявый'] },
    fire: { sign: +1, lo: 0.08, hi: 0.22, lim: [0.80, 1.30], w: 1.0,  adj: ['Жаростойкий', 'Прогоревший'] },
    w:    { sign: -1, lo: 0.08, hi: 0.25, lim: [0.70, 1.25], w: 0.4,  adj: ['Лёгкий', 'Тяжёлый'] },
    wear: { sign: -1, lo: 0.10, hi: 0.35, lim: [0.60, 1.30], w: 0.5,  adj: ['Крепкий', 'Ветхий'] },
  },
  isGear(id) { return !!this.BASE[id]; },
  keys(id) { return Object.keys(this.BASE[id]).concat(['w', 'wear']); },
  pickTier(rnd, luck = 0, min = 0, weights) {
    const w = (weights || this.WEIGHTS).slice(); if (!weights) { w[0] -= 6 * luck; w[1] += 3 * luck; w[2] += 2 * luck; w[3] += 1 * luck; }
    for (let i = 0; i < min; i++) w[i] = 0; const tot = w.reduce((a, b) => a + Math.max(0, b), 0); let r = rnd() * tot;
    for (let i = 0; i < w.length; i++) { r -= Math.max(0, w[i]); if (r <= 0) return i; } return w.length - 1;
  },
  goodness(k, mul) { return this.STATS[k].sign * (mul - 1); },
  // Экземпляр костюма: {rar, m, name}. o: { rar, luck, min, weights }
  roll(id, rnd = Math.random, o = {}) {
    if (!this.BASE[id]) throw new Error('нет костюма ' + id);
    const rar = o.rar != null ? o.rar : this.pickTier(rnd, o.luck || 0, o.min || 0, o.weights), keys = this.keys(id);
    for (let i = keys.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [keys[i], keys[j]] = [keys[j], keys[i]]; }
    const m = {}, good = [];
    const put = (k, dir, scale) => { const s = this.STATS[k], mag = (s.lo + (s.hi - s.lo) * rnd()) * scale; m[k] = Math.min(s.lim[1], Math.max(s.lim[0], 1 + s.sign * dir * mag)); if (dir > 0) good.push(k); };
    const plan = [[[0, 0.3, 'r'], [1, 0.3, 'r']], [[0, 1, 1], [1, 0.5, -1]], [[0, 1, 1], [1, 1, 1], [2, 0.5, -1]], [[0, 1, 1], [1, 1, 1], [2, 1, 1]]][rar];
    for (const [i, scale, dir] of plan) put(keys[i], dir === 'r' ? (rnd() < 0.5 ? 1 : -1) : dir, scale);
    const g = { rar, m: Object.fromEntries(Object.entries(m).map(([k, v]) => [k, +v.toFixed(3)])) };
    g.name = this.title(id, g); return g;
  },
  title(id, g) {
    const base = CFG.items[id].name; if (!g || !g.rar) return base;
    const good = Object.keys(g.m).filter(k => this.goodness(k, g.m[k]) > 0).sort((a, c) => this.STATS[c].w * this.goodness(c, g.m[c]) - this.STATS[a].w * this.goodness(a, g.m[a]));
    const words = good.slice(0, g.rar >= 2 ? 2 : 1).map(k => this.STATS[k].adj[0]);
    return base + (words.length ? ' «' + words.join(' ') + '»' : '');
  },
  // Сила ≈ 1.0 для обычного; ценность растёт с ней
  power(g) { let p = 1; if (g) for (const k in g.m) p += this.STATS[k].w * this.goodness(k, g.m[k]); return p; },
  // Итоговые числа экземпляра: защита (доли), вес, множитель износа
  eff(s) {
    const b = this.BASE[s.id], m = (s.g && s.g.m) || {}, o = { w: +(CFG.items[s.id].w * (m.w || 1)).toFixed(2), wear: m.wear || 1 };
    for (const k in b) o[k] = +(b[k] * (m[k] || 1)).toFixed(3); return o;
  },
  // Для выбора «лучшего» костюма
  score(s) { const e = this.eff(s); return (e.rad || 0) + (e.anom || 0) * 0.6; },
  name(s) { return s.g ? s.g.name : CFG.items[s.id].name; },
  rarOf(s) { return (s.g && s.g.rar) || 0; },
  // Новый экземпляр для слота; rnd/opts — как у roll
  make(id, rnd, o) { return { id, n: 1, g: this.roll(id, rnd, o) }; },
  // Добыча: лучше обычного (в бункерах глубже — ещё лучше)
  loot(R, d) { const id = d >= 3 ? 'suit2' : 'suit'; return this.make(id, R, { luck: d - 1, min: 1 }); },
  asSlot(e) { return { id: 'art', n: 1, art: e.art, q: e.q }; },
};

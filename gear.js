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
  BASE: { suit: { rad: 0.25, anom: 0.1 }, suit2: { rad: 0.45, anom: 0.25 }, firecoat: { fire: 0.6 }, helmet: { rad: 0.1, psy: 0.2 }, helmet2: { rad: 0.25, psy: 0.15 }, boots: { speed: 0.06, noise: 0.12 }, pack: { carry: 5 }, pack2: { carry: 9 } },
  // Слот, который занимает вещь; из вещей одного слота работает лучшая в рюкзаке (best)
  KIND: { suit: 'body', suit2: 'body', firecoat: 'coat', helmet: 'head', helmet2: 'head', boots: 'feet', pack: 'back', pack2: 'back' },
  KINDS: ['body', 'coat', 'head', 'feet', 'back'], KINDNAME: { body: 'костюм', coat: 'плащ', head: 'шлем', feet: 'обувь', back: 'рюкзак' },
  best(kind) { let b = null; for (const s of P.inv) if (!s.art && this.KIND[s.id] === kind && (!b || this.score(s) > this.score(b))) b = s; return b; },
  isWorn(s) { return !!(s && !s.art && this.KIND[s.id] && this.best(this.KIND[s.id]) === s); },
  // sign: +1 — рост множителя улучшает параметр; для веса и износа наоборот
  STATS: {
    rad:  { sign: +1, lo: 0.08, hi: 0.22, lim: [0.80, 1.30], w: 1.0,  adj: ['Свинцовый', 'Тонкий'] },
    anom: { sign: +1, lo: 0.10, hi: 0.30, lim: [0.70, 1.40], w: 0.6,  adj: ['Изолирующий', 'Дырявый'] },
    fire: { sign: +1, lo: 0.08, hi: 0.22, lim: [0.80, 1.30], w: 1.0,  adj: ['Жаростойкий', 'Прогоревший'] },
    w:    { sign: -1, lo: 0.08, hi: 0.25, lim: [0.70, 1.25], w: 0.4,  adj: ['Лёгкий', 'Тяжёлый'] },
    wear: { sign: -1, lo: 0.10, hi: 0.35, lim: [0.60, 1.30], w: 0.5,  adj: ['Крепкий', 'Ветхий'] },
    psy:   { sign: +1, lo: 0.10, hi: 0.30, lim: [0.70, 1.40], w: 0.5,  adj: ['Собранный', 'Нервный'] },
    speed: { sign: +1, lo: 0.10, hi: 0.30, lim: [0.70, 1.50], w: 0.9,  adj: ['Проворный', 'Неуклюжий'] },
    noise: { sign: +1, lo: 0.10, hi: 0.30, lim: [0.70, 1.50], w: 0.5,  adj: ['Мягкий', 'Стучащий'] },
    carry: { sign: +1, lo: 0.10, hi: 0.30, lim: [0.70, 1.50], w: 0.8,  adj: ['Вместительный', 'Тесный'] },
  },
  // Тюнинг: множитель к множителю параметра (растёт защита, падают вес и износ)
  TUNE: { psy: { k: 1.2, text: 'Защита от напряжения ×1.2' }, speed: { k: 1.25, text: 'Бонус скорости ×1.25' }, noise: { k: 1.25, text: 'Бонус тишины шагов ×1.25' }, carry: { k: 1.2, text: 'Бонус грузоподъёмности ×1.2' }, rad: { k: 1.06, text: 'Защита от радиации +6%' }, anom: { k: 1.08, text: 'Защита от аномалий +8%' }, fire: { k: 1.06, text: 'Огнестойкость +6%' }, w: { k: 0.92, text: 'Вес −8%' }, wear: { k: 0.88, text: 'Износ −12%' } },
  tune(s, k) {
    if (!s.g) s.g = { rar: 0, m: {}, name: CFG.items[s.id].name };
    s.g.m[k] = +((s.g.m[k] || 1) * this.TUNE[k].k).toFixed(3); s.g.t = (s.g.t || 0) + 1; return s.g;
  },
  isGear(id) { return !!this.BASE[id]; },
  keys(id) { return Object.keys(this.BASE[id]).concat(this.KIND[id] === 'body' || this.KIND[id] === 'coat' ? ['w', 'wear'] : ['w']); },   // износ — только у костюмов и плащей
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
    for (const [i, scale, dir] of plan) if (keys[i] !== undefined) put(keys[i], dir === 'r' ? (rnd() < 0.5 ? 1 : -1) : dir, scale);   // у вещей с двумя параметрами часть плана пропускается
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
  SCORE: { rad: 1, anom: 0.6, fire: 1, psy: 1, speed: 2, noise: 1, carry: 0.1 },
  score(s) { const e = this.eff(s); let t = 0; for (const k in this.SCORE) t += (e[k] || 0) * this.SCORE[k]; return t; },
  name(s) { return s.g ? s.g.name : CFG.items[s.id].name; },
  rarOf(s) { return (s.g && s.g.rar) || 0; },
  // Новый экземпляр для слота; rnd/opts — как у roll
  make(id, rnd, o) { return { id, n: 1, g: this.roll(id, rnd, o) }; },
  // Добыча: лучше обычного (в бункерах глубже — ещё лучше)
  loot(R, d) { const r = R(), hi = d >= 3, id = r < 0.4 ? (hi ? 'suit2' : 'suit') : r < 0.6 ? (hi ? 'helmet2' : 'helmet') : r < 0.8 ? 'boots' : (hi ? 'pack2' : 'pack'); return this.make(id, R, { luck: d - 1, min: 1 }); },
  asSlot(e) { return { id: 'art', n: 1, art: e.art, q: e.q }; },
};

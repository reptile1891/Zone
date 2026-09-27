'use strict';
// Оружие со случайными характеристиками. Базовые типы — CFG.weapons; у каждого экземпляра свои множители (mods) и, у редких, особые свойства.
// Обычное оружие («базовое») по-прежнему хранится по ключу типа ('pistol'), найденное/купленное со случайными — по id вида 'revolver#3'
// с описанием в P.wdefs. Все места кода берут характеристики через Wpn.of(id), а не CFG.weapons[id].
//
// Как бросается кость (Wpn.roll):
//  • редкость 0–3: Обычное / Хорошее / Редкое / Уникальное; чем глубже сектор, тем выше шанс (luck);
//  • шесть параметров: урон, темп (перезарядка), разброс, дальность, шум, износ — каждый со своими жёсткими границами;
//  • «хорошие» изменения платятся «плохими»: у Хорошего один плюс и минус поменьше, у Редкого два плюса и минус, у Уникального три плюса и особое свойство;
//  • сила оружия (power) считается по весам параметров и определяет цену — точность и шум стоят дешевле урона и темпа.
const Wpn = {
  TIERS: [{ n: 'Обычное', col: '#c9c2a8' }, { n: 'Хорошее', col: '#8fbf7f' }, { n: 'Редкое', col: '#6fa8e8' }, { n: 'Уникальное', col: '#e8a040' }],
  // sign — в какую сторону двигается множитель при УЛУЧШЕНИИ параметра (урон и дальность растут: +1; перезарядка, разброс, шум и износ падают: −1)
  // lo/hi — размах изменения (доля); lim — жёсткие границы множителя; w — вес в power; adj — прилагательные [улучшение, ухудшение]
  STATS: {
    dmg:    { sign: +1, lo: 0.06, hi: 0.18, lim: [0.82, 1.30], w: 1.0,  adj: ['Тяжёлый', 'Лёгкий'] },
    cd:     { sign: -1, lo: 0.06, hi: 0.16, lim: [0.80, 1.15], w: 0.9,  adj: ['Скорый', 'Тугой'] },
    spread: { sign: -1, lo: 0.10, hi: 0.35, lim: [0.60, 1.30], w: 0.25, adj: ['Меткий', 'Разбитый'] },
    range:  { sign: +1, lo: 0.06, hi: 0.20, lim: [0.85, 1.25], w: 0.3,  adj: ['Дальний', 'Короткий'] },
    noise:  { sign: -1, lo: 0.10, hi: 0.30, lim: [0.60, 1.20], w: 0.2,  adj: ['Глухой', 'Гулкий'] },
    wear:   { sign: -1, lo: 0.10, hi: 0.35, lim: [0.60, 1.30], w: 0.35, adj: ['Надёжный', 'Ржавый'] },
  },
  // Особые свойства уникального оружия: значение — доля; w — вес в power
  PERKS: { ammoSave: { name: 'Скряга', lo: 0.12, hi: 0.25, w: 0.8, text: 'шанс не потратить патрон' }, crit: { name: 'Палач', lo: 0.10, hi: 0.20, w: 1.2, text: 'шанс критического удара ×2' }, hush: { name: 'Шёпот', lo: 0.35, hi: 0.50, w: 0.3, text: 'шум ещё ниже' } },
  WEIGHTS: [58, 28, 11, 3],          // шансы редкости в обычных условиях
  _cache: new WeakMap(),

  // ---------- генерация ----------
  pickTier(rnd, luck = 0, min = 0, weights) {
    const w = (weights || this.WEIGHTS).slice(); if (!weights) { w[0] -= 6 * luck; w[1] += 2 * luck; w[2] += 3 * luck; w[3] += 1 * luck; }
    for (let i = 0; i < min; i++) w[i] = 0; const tot = w.reduce((a, b) => a + Math.max(0, b), 0); let r = rnd() * tot;
    for (let i = 0; i < w.length; i++) { r -= Math.max(0, w[i]); if (r <= 0) return i; } return w.length - 1;
  },
  statKeys(b) { return Object.keys(this.STATS).filter(k => (k === 'spread' ? b.spread > 0.01 : k === 'range' ? !b.cone : true)); },
  // rnd — генератор случайных; o: { rar, luck, min, weights }
  roll(base, rnd = Math.random, o = {}) {
    const b = CFG.weapons[base]; if (!b) throw new Error('нет оружия ' + base);
    const rar = o.rar != null ? o.rar : this.pickTier(rnd, o.luck || 0, o.min || 0, o.weights), keys = this.statKeys(b);
    for (let i = keys.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [keys[i], keys[j]] = [keys[j], keys[i]]; }
    const mods = {}, good = [];
    const put = (k, dir, scale) => {                       // dir +1 — улучшить параметр, −1 — ухудшить
      const s = this.STATS[k], mag = (s.lo + (s.hi - s.lo) * rnd()) * scale;
      mods[k] = Math.min(s.lim[1], Math.max(s.lim[0], 1 + s.sign * dir * mag)); if (dir > 0) good.push(k);
    };
    const plan = [[[0, 0.3, 'r'], [1, 0.3, 'r']], [[0, 1, 1], [1, 0.5, -1], [2, 0.3, 1]], [[0, 1, 1], [1, 1, 1], [2, 0.5, -1]], [[0, 1, 1], [1, 1, 1], [2, 1, 1]]][rar];
    for (const [i, scale, dir] of plan) put(keys[i], dir === 'r' ? (rnd() < 0.5 ? 1 : -1) : dir, scale);
    const perks = {};
    if (rar === 3) {                                       // уникальное: особое свойство
      const opts = ['ammoSave', 'crit', 'hush'].filter(p => (p !== 'hush' || b.noise > 100) && (p !== 'crit' || !b.cone)),   // у огнемёта нет отдельных попаданий — крит не нужен
         p = opts[Math.floor(rnd() * opts.length)], d = this.PERKS[p], v = d.lo + (d.hi - d.lo) * rnd();
      if (p === 'hush') { const s = this.STATS.noise; mods.noise = Math.max(s.lim[0], (mods.noise || 1) * (1 - v)); perks.hush = true; } else perks[p] = +v.toFixed(2);
    }
    const def = { base, rar, mods: Object.fromEntries(Object.entries(mods).map(([k, v]) => [k, +v.toFixed(3)])), perks };
    def.name = this.title(def, good); return def;
  },
  // Имя: «Револьвер «Меткий»»; у Уникального — по свойству («Палач»)
  title(def, good) {
    const b = CFG.weapons[def.base]; if (def.rar === 0) return b.name;
    if (def.rar === 3) { const p = ['ammoSave', 'crit', 'hush'].find(k => def.perks[k]); return b.name + ' «' + this.PERKS[p].name + '»'; }
    const g = (good || Object.keys(def.mods)).filter(k => this.goodness(k, def.mods[k]) > 0).sort((a, c) => this.STATS[c].w * this.goodness(c, def.mods[c]) - this.STATS[a].w * this.goodness(a, def.mods[a]));
    const words = g.slice(0, def.rar === 2 ? 2 : 1).map(k => this.STATS[k].adj[0]);
    return b.name + (words.length ? ' «' + words.join(' ') + '»' : '');
  },
  goodness(k, mul) { return this.STATS[k].sign * (mul - 1); },        // >0 — параметр улучшен
  // Сила оружия ≈ 1.0 для базового; растёт на сумму взвешенных улучшений
  power(def) {
    let p = 1; for (const k in def.mods) p += this.STATS[k].w * this.goodness(k, def.mods[k]);
    if (def.perks.ammoSave) p += this.PERKS.ammoSave.w * def.perks.ammoSave; if (def.perks.crit) p += this.PERKS.crit.w * def.perks.crit; if (def.perks.hush) p += this.PERKS.hush.w * 0.4;
    return p;
  },
  // Цена (без наценки магазина): цена типа × (1 + 3·(power−1)), не ниже половины; у пистолета цены нет — берём 200
  value(def) { const b = CFG.weapons[def.base], bp = b.price || 200; return Math.max(5, Math.round(bp * Math.max(0.5, 1 + 3 * (this.power(def) - 1)) / 5) * 5); },

  // ---------- тюнинг: улучшения за материалы (число ограничено уровнем мастерской) ----------
  // k — множитель к множителю параметра; каждое улучшение записывается прямо в def.mods, поэтому цена, подсказки и сравнение с базой работают сами
  TUNE: { dmg: { k: 1.06, text: 'Урон +6%' }, cd: { k: 0.94, text: 'Темп стрельбы +6%' }, spread: { k: 0.88, text: 'Разброс −12%' }, range: { k: 1.06, text: 'Дальность +6%' }, noise: { k: 0.9, text: 'Шум −10%' }, wear: { k: 0.85, text: 'Износ −15%' } },
  tuneKeys(id) { return this.statKeys(CFG.weapons[this.base(id)]); },
  tuneCount(id) { const d = this.def(id); return (d && d.tune) || 0; },
  tune(id, k) {
    let d = this.def(id); if (!d) { d = this.plain(id); P.wdefs[id] = d; }   // обычное оружие становится экземпляром с описанием
    d.mods[k] = +((d.mods[k] || 1) * this.TUNE[k].k).toFixed(3); d.tune = (d.tune || 0) + 1; this._cache.delete(d); return d;
  },

  // ---------- экземпляры: доступ и хранение ----------
  def(id) { return (P.wdefs && P.wdefs[id]) || null; },
  base(id) { const d = this.def(id); return d ? d.base : id; },
  // Итоговые характеристики оружия (для простого — сам CFG.weapons[id])
  of(id) {
    const d = this.def(id); if (!d) return CFG.weapons[id];
    let w = this._cache.get(d); if (!w) this._cache.set(d, w = this.eff(d)); return w;
  },
  // То же по описанию (для прилавка и подсказок)
  eff(d) {
    const b = CFG.weapons[d.base], m = d.mods, r = (v, n) => +v.toFixed(n);
    return Object.assign({}, b, { name: d.name, base: d.base, rar: d.rar, dmg: r(b.dmg * (m.dmg || 1), 1), cd: r(b.cd * (m.cd || 1), 2), spread: b.spread ? r(b.spread * (m.spread || 1), 3) : 0, range: Math.round(b.range * (m.range || 1)),
      noise: Math.round(b.noise * (m.noise || 1)), wear: r(b.wear * (m.wear || 1), 2), ammoSave: d.perks.ammoSave || 0, crit: d.perks.crit || 0, price: this.value(d), perks: d.perks });
  },
  name(id) { return this.of(id).name; },
  rar(id) { const d = this.def(id); return d ? d.rar : 0; },
  color(id) { return this.TIERS[this.rar(id)].col; },
  plain(base) { return { base, rar: 0, mods: {}, perks: {}, name: CFG.weapons[base].name }; },
  defOf(id) { return this.def(id) || this.plain(id); },
  // Добавить найденный/купленный экземпляр в снаряжение; возвращает id
  add(def, cond = 100) {
    if (!P.wdefs) P.wdefs = {}; const id = def.base + '#' + (P.wseq = (P.wseq || 0) + 1);
    P.wdefs[id] = def; P.weapons.push(id); P.cond[id] = cond; return id;
  },
  remove(id) {
    P.weapons = P.weapons.filter(k => k !== id); if (P.wdefs) delete P.wdefs[id]; if (P.cond && String(id).includes('#')) delete P.cond[id];   // у базовых стволов износ остаётся (вдруг купят снова)
    if (!P.weapons.includes(P.weapon)) P.weapon = P.weapons[0] || 'pistol';   // без огнестрела «текущий» — просто запасной пистолет, не в собственности: выстрелить им нельзя
  },
  sellPrice(id) { return Math.max(1, Math.round(this.value(this.defOf(id)) * 0.45 * (0.5 + 0.5 * P.cond[id] / 100))); },
  // Что выпадает: тип по уровню (не выше 1 + сектор), качество растёт с сектором
  loot(rnd, danger = 1, o = {}) {
    const bases = Object.keys(CFG.weapons).filter(k => (CFG.weapons[k].lvl || 1) <= Math.min(3, 1 + danger)), base = bases[Math.floor(rnd() * bases.length)];
    return this.roll(base, rnd, Object.assign({ luck: danger - 1 }, o));
  },
  found(def, cond) { const id = this.add(def, cond); log('Найдено оружие: ' + def.name + ' (' + this.TIERS[def.rar].n + ')', this.TIERS[def.rar].col); return id; },
  // ---------- прилавок Оружейника ----------
  SHOP_WEIGHTS: [[46, 34, 17, 3], [40, 35, 21, 4], [34, 34, 26, 6]],
  genShop(rnd = Math.random) {
    const lvl = Camp.lvl('gun'), bases = Object.keys(CFG.weapons).filter(k => (CFG.weapons[k].lvl || 1) <= lvl), offers = [], n = 2 + lvl;
    const pool = bases.slice(); for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }   // типы не повторяются, пока хватает разных
    for (let i = 0; i < n; i++) { const base = pool[i % pool.length], def = this.roll(base, rnd, { weights: this.SHOP_WEIGHTS[lvl - 1] }); offers.push({ def, price: Math.round(this.value(def) / 5) * 5 }); }   // цена = стоимость, как у стандартного товара
    P.gunOffers = offers; return offers;
  },
  buyOffer(i) {
    const o = (P.gunOffers || [])[i]; if (!o || P.money < o.price) return false;
    P.money -= o.price; P.gunOffers.splice(i, 1); const id = this.add(o.def); P.weapon = id; Snd.pick(); log('Куплено: ' + o.def.name + ' (' + this.TIERS[o.def.rar].n + ')', this.TIERS[o.def.rar].col); return id;
  },
  // Краткое описание отличий от базового типа: «урон +12%, шум −20%»
  diff(def) {
    const out = [], nm = { dmg: 'урон', cd: 'темп', spread: 'разброс', range: 'дальность', noise: 'шум', wear: 'износ' };
    for (const k in def.mods) { const pc = Math.round((def.mods[k] - 1) * 100), shown = k === 'cd' ? -pc : pc; if (!pc) continue; out.push({ k, text: nm[k] + ' ' + (shown > 0 ? '+' : '−') + Math.abs(shown) + '%', good: this.goodness(k, def.mods[k]) > 0 }); }
    if (def.perks.ammoSave) out.push({ k: 'ammoSave', text: 'экономит патроны ' + Math.round(def.perks.ammoSave * 100) + '%', good: true });
    if (def.perks.crit) out.push({ k: 'crit', text: 'крит ' + Math.round(def.perks.crit * 100) + '%', good: true });
    return out;
  },
};

// Кольцо разброса у прицела: где может лечь пуля на расстоянии до курсора (красное — курсор дальше дальности оружия)
(function () {
  const _dw = Meta.drawWorld;
  Meta.drawWorld = function () {
    _dw.call(this);
    if ((G.scene !== 'zone' && G.scene !== 'dungeon') || G.ui || G.dead || !Quick.gun(heldNames[P.sel])) return;
    const w = Wpn.of(P.weapon); if (w.cone) return;
    const mx = mouse.x + cam.x - P.x, my = mouse.y + cam.y - P.y, dm = Math.hypot(mx, my), d = Math.min(dm, w.range);
    const r = Math.max(3, d * Math.tan(Meta.spreadOf(w, Math.hypot(keys.mx || 0, keys.my || 0) > 0) * (1 + 1.2 * (P.bloom || 0)) / 2)) * (w.pellets > 1 ? 1 : 1);
    const cx = P.x + Math.cos(P.ang) * d, cy = P.y + Math.sin(P.ang) * d;
    ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = dm > w.range ? '#e06060' : '#d8e8c0'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.stroke();
    for (let i = 0; i < 4; i++) { const an = i * 1.5708; ctx.beginPath(); ctx.moveTo(cx + Math.cos(an) * (r - 3), cy + Math.sin(an) * (r - 3)); ctx.lineTo(cx + Math.cos(an) * (r + 3), cy + Math.sin(an) * (r + 3)); ctx.stroke(); }
    ctx.restore();
  };
})();

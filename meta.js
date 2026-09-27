'use strict';
// Мета-системы поверх ядра: репутация и карма, задания, события рынка, знания, концовки,
// травмы, оружие и износ, костюмы, приманки, датчики, оцепление. Загружается после main.js
// и переопределяет часть его функций (shoot, useItem, useSel, sellPrice, renderPanel, reachGoal).
const Meta = {
  sensors: [], lures: [], lureShots: [], gateCool: 0, prevBleed: 0,
  TIER: { suit: { rad: 0.25, anom: 0.1 }, suit2: { rad: 0.45, anom: 0.25 } },
  DIRS: ['востоке', 'юго-востоке', 'юге', 'юго-западе', 'западе', 'северо-западе', 'севере', 'северо-востоке'],

  reset() { this._bountyCd = 0; this.sensors = []; this.lures = []; this.lureShots = []; this.genOffers(); this.pickEvents(); },
  afterLoad() { P.burn = 0; if (!P.fuel) P.fuel = 0; if (!P.talked) P.talked = {}; if (!P.hints) P.hints = {}; if (!P.wdefs) P.wdefs = {}; if (!P.wseq) P.wseq = 0; if ((!P.gunOffers || !P.gunOffers.length) && typeof Wpn !== 'undefined') Wpn.genShop(); for (const k in CFG.weapons) if (P.cond[k] == null) P.cond[k] = 100; this._bountyCd = 0; for (const q of P.quests || []) if (q.type === 'bounty' && q.prog < 1) this.spawnBounty(q); this.sensors = []; this.lures = []; this.lureShots = []; if (!P.offers || !P.offers.length) this.genOffers(); if (!G.events || !G.events.length) this.pickEvents(); },
  saveFields() { const o = {}; for (const k of ['rep', 'karma', 'quests', 'offers', 'lore', 'weapons', 'weapon', 'cond', 'suitCond', 'insured', 'pass', 'earned', 'researched', 'kills', 'mapSold', 'stash', 'bld', 'chainDone', 'fuel', 'talked', 'deepDone', 'hints', 'hintsOff', 'wdefs', 'wseq', 'gunOffers', 'codex']) o[k] = P[k]; return o; },

  // ---- костюм ----
  // Носится лучший костюм из рюкзака (слот со своими характеристиками)
  bestSuit() { let b = null; for (const s of P.inv) if ((s.id === 'suit' || s.id === 'suit2') && (!b || Gear.score(s) > Gear.score(b))) b = s; return b; },
  suitEff() { return 0.4 + 0.6 * P.suitCond / 100; },
  suitRad() { const s = this.bestSuit(); return s ? Gear.eff(s).rad * this.suitEff() : 0; },
  suitAnom() { const s = this.bestSuit(); return s ? Gear.eff(s).anom * this.suitEff() : 0; },
  wearSuit(d) { const s = this.bestSuit(); if (s) P.suitCond = Math.max(0, P.suitCond - d * 0.06 * Gear.eff(s).wear); },
  bestCoat() { let b = null; for (const s of P.inv) if (s.id === 'firecoat' && (!b || Gear.eff(s).fire > Gear.eff(b).fire)) b = s; return b; },

  // ---- огонь ----
  fireRes() { return Math.min(0.85, (this.bestCoat() ? Gear.eff(this.bestCoat()).fire : 0) + fx('fireRes')); },
  // Поджечь существо: игрока — на sec секунд с поправкой на огнестойкость, мутанта — на 4 с (огнеупорные не горят)
  ignite(e, sec) {
    if (e === P) { const k = 1 - this.fireRes(); if (k <= 0.05 || G.dead) return; if (!(P.burn > 0)) log('Ты горишь! Вода или аптечка потушат.', '#ff9a40'); P.burn = Math.max(P.burn || 0, sec * k); }
    else if (!(e.c && e.c.fireproof) && e.burn != null) e.burn = Math.max(e.burn, 4);
  },
  // Огнемёт: конус перед игроком, урон каждому в нём (сквозь броню), поджигает
  flame(w) {
    let seen = false; const dun = G.scene === 'dungeon';
    for (const list of dun ? [Dungeon.enemies] : [Mutants.list, Stalkers.list]) for (const m of list) {
      if (m.dead || Mutants.hidden(m)) continue; const dx = m.x - P.x, dy = m.y - P.y, d = Math.hypot(dx, dy);
      if (d > w.range + m.r || U.angDiff(P.ang, Math.atan2(dy, dx)) > w.cone) continue;
      if (dun && !Dungeon.los(P.x, P.y, m.x, m.y)) continue;
      if (m.c && m.c.fireproof) { seen = true; continue; }
      m.hurt(w.dmg, P, w.pierce); if (!m.dead && m.burn != null) { m.burn = Math.max(m.burn, 4); m.burner = P; }
    }
    if (seen && !(G.t < (this._fpLog || 0))) { this._fpLog = G.t + 6; log('Огонь Углеглота не берёт — он из золы.', '#d0a070'); }
    for (let i = 0; i < 6; i++) { const a = P.ang + (Math.random() - 0.5) * w.cone * 2, sp = 120 + Math.random() * 160; parts.push({ x: P.x + Math.cos(P.ang) * 10, y: P.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.3 + Math.random() * 0.15, col: Math.random() < 0.5 ? '#ff8a30' : '#ffd070' }); }
    Snd.crackle(); G.shake = Math.max(G.shake, 0.04); Mutants.hear(P.x, P.y, w.noise);
  },

  // ---- ремонт из хлама и тюнинг ----
  matsText(cost) { return Object.keys(cost).map(m => '<span style="color:' + (Camp.have(m) >= cost[m] ? '#8fbf7f' : '#e06060') + '">' + Camp.matName(m) + ' ' + cost[m] + '</span>').join(', '); },
  matsPlain(m) { return Object.keys(m).map(k => CFG.items[k].name + ' ×' + m[k]).join(', '); },
  canPay(cost) { return Object.keys(cost).every(m => Camp.have(m) >= cost[m]); },
  pay(cost) { for (const m in cost) Camp.take(m, cost[m]); },
  // Сколько хлама нужно, чтобы убрать износ wear % (навык и уровень здания удешевляют)
  repairMats(wear, vk) {
    const r = CFG.tune.repair, m = (1 - 0.12 * P.sk.repair) * Camp.repairMul(vk), c = {}; if (wear < 1) return c;
    c.scrap = Math.max(1, Math.ceil(wear / r.scrap * m)); const k = wear >= 30 ? Math.ceil(wear / r.circuit * m) : 0; if (k) c.circuit = k; return c;
  },
  tuneCost(n) { return CFG.tune.cost[Math.min(n, CFG.tune.cost.length - 1)]; },
  // Строки «Доработать» под оружием: ремонт из хлама и тюнинг
  weaponWorkHTML(id) {
    const cap = Camp.lvl('gun'), n = Wpn.tuneCount(id), wear = 100 - P.cond[id], rc = this.repairMats(wear, 'gun'), full = n >= cap, tc = this.tuneCost(n);
    let h = row('🔧', 'Починить из хлама', wear < 1 ? 'Исправно' : 'Износ ' + Math.round(wear) + '% → 0%. ' + this.matsText(rc), btn('wrepairm:' + id, 'Починить', wear < 1 || !this.canPay(rc)));
    h += '<div class="stat">Тюнинг: ' + n + ' / ' + cap + (full && cap < 3 ? ' (больше — с уровнем мастерской)' : '') + (full ? '' : ' · каждое улучшение: ' + this.matsText(tc)) + '</div>';
    if (!full) for (const k of Wpn.tuneKeys(id)) h += row('⚙', Wpn.TUNE[k].text, '', btn('wtune:' + id + ':' + k, 'Улучшить', !this.canPay(tc)));
    return h;
  },
  // Костюм и плащ: ремонт износа (общий) и тюнинг
  suitWorkHTML() {
    const cap = Camp.lvl('gear'), wear = 100 - P.suitCond, rc = this.repairMats(wear, 'gear'); let h = '';
    if (this.bestSuit()) h += row('🧵', 'Починить из хлама', wear < 1 ? 'Исправно' : 'Износ ' + Math.round(wear) + '% → 0%. ' + this.matsText(rc), btn('srepairm', 'Починить', wear < 1 || !this.canPay(rc)));
    for (const s of [this.bestSuit(), this.bestCoat()]) {
      if (!s) continue; const n = (s.g && s.g.t) || 0, full = n >= cap, tc = this.tuneCost(n), i = P.inv.indexOf(s);
      h += '<div class="stat"><b>' + Gear.name(s) + '</b> · тюнинг ' + n + ' / ' + cap + (full && cap < 3 ? ' (больше — с уровнем снабжения)' : '') + (full ? '' : ' · ' + this.matsText(tc)) + '</div>';
      if (!full) for (const k of Gear.keys(s.id)) h += row('⚙', Gear.TUNE[k].text, '', btn('gtune:' + i + ':' + k, 'Улучшить', !this.canPay(tc)));
    }
    return h;
  },

  // ---- разборка (верстак): вещь → материалы ----
  // Оружие: по цене и состоянию; редкое даёт пластины, уникальное — ещё и батарею. Тюнинг не возвращается
  salvageWeapon(id) {
    const d = Wpn.defOf(id), v = Wpn.value(d), f = 0.6 + 0.4 * P.cond[id] / 100, o = { scrap: Math.max(2, Math.round(v / 70 * f)) }, c = Math.round(v / 160 * f);
    if (c) o.circuit = c; if (d.rar >= 2) o.plate = d.rar - 1; if (d.rar >= 3) o.battery = 1; return o;
  },
  salvageSlot(s) {
    const t = s && !s.art && CFG.salvage[s.id]; if (!t) return null; const m = 1 + 0.3 * Gear.rarOf(s), o = {};
    for (const k in t) o[k] = Math.max(1, Math.round(t[k] * m)); return o;
  },
  // kind: 'w' — оружие (ref — id), 'g' — предмет из рюкзака (ref — индекс). Возвращает выданные материалы или null
  salvage(kind, ref) {
    let mats, what;
    if (kind === 'w') { if (!P.weapons.includes(ref) || P.weapons.length <= 1) return null; mats = this.salvageWeapon(ref); what = Wpn.name(ref); Wpn.remove(ref); }
    else { const s = P.inv[+ref], m = this.salvageSlot(s); if (!m) return null; mats = m; what = Meta.itemName(s); if (s.n > 1) s.n--; else P.inv.splice(+ref, 1); }
    for (const k in mats) invAdd(k, mats[k]);
    addXp(4); Snd.pick(); log('Разобрано: ' + what + ' → ' + Object.keys(mats).map(k => CFG.items[k].name + ' ×' + mats[k]).join(', '), '#a8c890'); return mats;
  },

  // ---- оружие ----
  cycleWeapon() { const i = P.weapons.indexOf(P.weapon); P.weapon = P.weapons[(i + 1) % P.weapons.length]; log('Оружие: ' + Wpn.name(P.weapon), Wpn.color(P.weapon)); },
  repairCost(k) { return Math.ceil((100 - P.cond[k]) * Wpn.of(k).repair * (1 - 0.12 * P.sk.repair) * Camp.repairMul('gun')); },
  suitRepairCost() { return Math.ceil((100 - P.suitCond) * 0.8 * (1 - 0.12 * P.sk.repair) * Camp.repairMul('gear')); },
  slotPrice() { return [300, 700][P.equip.length - 2] || 0; },

  // ---- знания ----
  // Оружейник: ваше оружие, стандартный товар, прилавок дня со случайными характеристиками
  gunShopHTML() {
    const st = w => 'урон ' + w.dmg + (w.pellets > 1 ? '×' + w.pellets : '') + ' · ' + (1 / w.cd).toFixed(1) + ' выстр./с · дальн. ' + w.range, col = w => Wpn.TIERS[w.rar || 0].col;
    let h = '<div><h3>Твоё оружие</h3>';
    for (const id of P.weapons) {
      const w = Wpn.of(id), c = this.repairCost(id), d = Wpn.defOf(id), df = Wpn.diff(d).map(x => '<span style="color:' + (x.good ? '#8fbf7f' : '#e0a060') + '">' + x.text + '</span>').join(', ');
      h += row(Icons.html('w_' + Wpn.base(id)), '<span style="color:' + col(w) + '">' + w.name + '</span>' + (P.weapon === id ? ' ★' : ''), 'Износ ' + Math.round(100 - P.cond[id]) + '% · ' + st(w) + (df ? '<br>' + df : ''),
        '<div style="display:flex;flex-direction:column;gap:3px;min-width:104px">' + btn('wequip:' + id, 'В руки', P.weapon === id) + btn('wrepair:' + id, c ? 'Починить ' + c + ' ₽' : 'Исправно', !c || P.money < c) + btn('wsell:' + id, 'Продать ' + Wpn.sellPrice(id) + ' ₽', P.weapons.length <= 1) + btn('wwork:' + id, (G.ui && G.ui.wsel === id ? 'Закрыть' : 'Доработать') + (Wpn.tuneCount(id) ? ' (' + Wpn.tuneCount(id) + ')' : '')) + '</div>');
      if (G.ui && G.ui.wsel === id) h += '<div class="note">' + this.weaponWorkHTML(id) + '</div>';
    }
    h += '</div><div><h3>Стандартный товар</h3>'; let any = false;
    for (const k in CFG.weapons) {
      const w = CFG.weapons[k]; if ((w.lvl || 1) > Camp.lvl('gun') || P.weapons.includes(k)) continue; any = true;
      h += row(Icons.html('w_' + k), w.name, st(w) + (w.note ? ' · ' + w.note : ''), btn('wbuy:' + k, w.price + ' ₽', P.money < w.price));
    }
    if (!any) h += '<div class="stat">Всё стандартное у тебя уже есть.</div>';
    h += '<h3>На прилавке сегодня (обновляется после ночёвки и выброса)</h3>';
    (P.gunOffers || []).forEach((o, i) => {
      const w = Wpn.eff(o.def), df = Wpn.diff(o.def).map(x => '<span style="color:' + (x.good ? '#8fbf7f' : '#e0a060') + '">' + x.text + '</span>').join(', ');
      h += row(Icons.html('w_' + o.def.base), '<span style="color:' + col(w) + '">' + w.name + '</span> <span class="stat">' + Wpn.TIERS[o.def.rar].n + '</span>', st(w) + (df ? '<br>' + df : ''), btn('wbuyg:' + i, o.price + ' ₽', P.money < o.price));
    });
    if (!(P.gunOffers || []).length) h += '<div class="stat">Пусто. Загляни после ночёвки.</div>';
    return h;
  },
  // Подпись в панелях (HTML): у артефакта — класс качества (только у опознанного), у костюма — цвет редкости
  itemLabel(s) {
    const n = this.itemName(s);
    if (s.art && P.known[s.art]) { const g = Gear.grade(s.q); return n + ' <span style="color:' + g.col + '">· ' + g.n + '</span>'; }
    if (!s.art && Gear.isGear(s.id) && Gear.rarOf(s)) return '<span style="color:' + Gear.TIERS[Gear.rarOf(s)].col + '">' + n + '</span>';
    return n;
  },
  gainLore() { if (P.lore < CFG.lore.length) { log('Знание: ' + CFG.lore[P.lore++], '#c8b0e8'); } },
  itemName(s) {
    if (!s.art) return Gear.isGear(s.id) ? Gear.name(s) : CFG.items[s.id].name;
    if (P.known[s.art]) return CFG.arts[s.art].name;
    const a = CFG.arts[s.art], L = P.sk.lore; let t = 'Неопознанный артефакт';
    if (L >= 3 && s.art === 'dud') t += ' (похоже, пустышка)'; else if (L >= 1 && a.rad > 0.15) t += ' (фонит)'; else if (L >= 2 && a.fx.hpRegen) t += ' (тёплый)';
    return t;
  },

  // ---- экономика: события, репутация ----
  pickEvents() {
    G.events = CFG.events.slice().sort(() => Math.random() - 0.5).slice(0, 2);
    for (const e of G.events) log('Слух с рынка: ' + e.text, '#8aa0b0');
  },
  ev(keys) { let m = 1; for (const e of G.events || []) if (keys.includes(e.k)) m *= e.mul; return m; },
  buyPrice(id) { const d = CFG.items[id]; return Math.max(1, Math.round(d.buy * (1 - 0.04 * P.sk.trade) * (1 - U.clamp(P.rep, -50, 50) * 0.003) * this.ev([id]) * Camp.buyMul(id))); },
  onEmission() {
    this.genOffers(); this.pickEvents(); Stalkers.refill();
    for (const k in Mutants.adapt) for (const j in Mutants.adapt[k]) Mutants.adapt[k][j] *= 0.7;
  },

  // ---- задания ----
  rewardMul() { return 1 + 0.15 * (Camp.lvl('bar') - 1); },
  bmName(x, y) { return CFG.biomes[W.biomeAt(x, y)].name; },
  genOffers() {
    const offers = [], pool = ['fetch', 'hunt', 'recon', 'bring', 'bring', 'discover', 'sensor', 'help', 'bounty', 'rescue', 'lab', 'ash', 'vault'].sort(() => Math.random() - 0.5), n = 4 + (Camp.lvl('bar') - 1);
    for (const t of pool) { if (offers.length >= n) break; const o = this.makeOffer(t); if (o) offers.push(o); }
    if (!P.chainDone && !P.quests.some(q => q.type === 'chain') && P.lore >= 2 && Math.random() < 0.8) offers.unshift(this.makeOffer('chain'));
    if (P.chainDone && !P.deepDone && !P.quests.some(q => q.type === 'deep') && Math.random() < 0.8) { const d = this.makeOffer('deep'); if (d) offers.unshift(d); }
    const bl = this.rewardMul(); for (const o of offers) o.reward = Math.round(o.reward * bl);
    P.offers = offers; if (typeof Wpn !== 'undefined') Wpn.genShop();
  },
  makeOffer(t) {
    const R = Math.random;
    if (t === 'fetch') { const ids = this.wildArts(), a = U.pick(ids), ad = CFG.arts[a]; return { type: 'fetch', art: a, reward: Math.round(ad.val * 1.7), rep: 3, text: 'Принести «' + ad.name + '» (подойдёт и неопознанный)' }; }
    if (t === 'hunt') { const sp = U.pick(Object.keys(CFG.mut)), n = CFG.mut[sp].stalker ? 1 : CFG.mut[sp].hp >= 80 ? 2 : 3; return { type: 'hunt', sp, n, prog: 0, reward: 60 + n * 35, rep: 4, text: 'Истребить: ' + CFG.mut[sp].name + ' ×' + n }; }
    if (t === 'recon') { const p = W.spot(1500, R); return { type: 'recon', x: p.x, y: p.y, reached: false, reward: 80 + W.danger(p.x, p.y) * 45, rep: 5, text: 'Разведка: дойти до отмеченной точки (' + this.bmName(p.x, p.y) + ') и вернуться' }; }
    if (t === 'rescue') { const p = W.spot(1800, R); return { type: 'rescue', x: p.x, y: p.y, reward: 170, rep: 9, text: 'Экспедиция не вернулась. Найти жетон группы.' }; }
    if (t === 'bring') {
      const o = U.pick([['scrap', 8, 55], ['circuit', 4, 70], ['battery', 4, 60], ['earbone', 3, 80], ['glassgland', 3, 95], ['plate', 2, 80], ['mistvial', 1, 110], ['meat', 5, 45], ['quill', 3, 75], ['fang', 3, 85], ['coalfang', 3, 90], ['gill', 3, 85]]);
      return { type: 'bring', mat: o[0], n: o[1], reward: o[2] + Math.floor(R() * 20), rep: 2, text: 'Снабжение лагеря: принести «' + CFG.items[o[0]].name + '» ×' + o[1] };
    }
    if (t === 'discover') { const n = 3 + Math.floor(R() * 3); return { type: 'discover', n, prog: 0, reward: 50 + n * 22, rep: 3, text: 'Картограф: отметить болтами новые аномалии ×' + n }; }
    if (t === 'sensor') { const p = W.spot(1200, R); return { type: 'sensor', x: p.x, y: p.y, placed: false, reward: 120 + W.danger(p.x, p.y) * 30, rep: 4, text: 'Установить датчик движения в точке (' + this.bmName(p.x, p.y) + '). Датчик выдадим.' }; }
    if (t === 'lab') return W.labs.length ? { type: 'lab', prog: 0, n: 1, reward: 210, rep: 6, text: 'Лаборатория: найти заброшенную площадку с оградой (сектор 3–4, фонит, у подходов «пружины» и магнитные ямы) и вскрыть шкаф' } : null;
    if (t === 'deep') {
      // три бункера от мелкого сектора к глубокому: следы экспедиции Штейна ведут вниз, каждый следующий отмечается на карте после сейфа предыдущего
      const bs = W.bunkers.slice().sort((a, b) => W.danger(a.x, a.y) - W.danger(b.x, b.y) || a.i - b.i); if (bs.length < 3) return null;
      const pick = [bs[Math.floor(bs.length * 0.12)], bs[Math.floor(bs.length * 0.5)], bs[bs.length - 1 - Math.floor(bs.length * 0.06)]];
      if (new Set(pick.map(b => b.i)).size < 3) return null; pick[0].known = true;
      return { type: 'deep', stage: 0, bunks: pick.map(b => b.i), x: pick[0].x, y: pick[0].y, reward: 520, rep: 14, item: ['art', 'echo'], text: 'Цепочка «Нижний ярус»: следы экспедиции Штейна ведут под землю. Найти сейфы в трёх бункерах (3 этапа)' };
    }
    if (t === 'vault') return W.bunkers.length ? { type: 'vault', prog: 0, n: 1, reward: 260, rep: 6, text: 'Бункер: спуститься под землю (вход отмечен бункером на карте) и вскрыть сейф в глубине лабиринта. Внизу темно, есть подземники' } : null;
    if (t === 'ash') return W.roads.length ? { type: 'ash', prog: 0, n: 3, reward: 380, rep: 8, text: 'Пожарный: убить углеглотов ×3 и принести «Угольный зуб» ×3. Логова — у Пепельного тракта (сектор 2–4) и в Гари' } : null;
    if (t === 'help') return { type: 'help', n: 1, prog: 0, reward: 70, rep: 6, text: 'Найти раненого сталкера и спасти его аптечкой' };
    if (t === 'bounty') { const p = W.spot(1500, R); return { type: 'bounty', x: p.x, y: p.y, prog: 0, name: U.pick(STALKER_NAMES), reward: 180 + W.danger(p.x, p.y) * 40, rep: 8, text: 'Награда за голову: главарь бандитов (' + this.bmName(p.x, p.y) + '). Опасен.' }; }
    if (t === 'chain') { const p = W.spot(1400, R), p2 = W.spot(1700, R); return { type: 'chain', stage: 0, x: p.x, y: p.y, bx: p2.x, by: p2.y, reward: 420, rep: 12, item: ['art', 'mirage'], text: 'Цепочка «Сумерки»: найти следы экспедиции Штейна (3 этапа)' }; }
  },
  progText(q) {
    const st = this.done(q) ? 'готово: сдай Сидору' : 'в работе';
    if (q.type === 'hunt' || q.type === 'discover' || q.type === 'help' || q.type === 'lab' || q.type === 'vault') return q.prog + '/' + q.n + ' · ' + st;
    if (q.type === 'bring') return invCount(q.mat) + '/' + q.n + ' · ' + st;
    if (q.type === 'deep') return q.stage >= 3 ? 'все записки найдены: сдай Сидору' : 'этап ' + (q.stage + 1) + '/3: спустись в отмеченный бункер (E у люка) и вскрой сейф в глубине';
    if (q.type === 'ash') return 'убито ' + q.prog + '/' + q.n + ' · зубов ' + invCount('coalfang') + '/' + q.n + ' · ' + st;
    if (q.type === 'chain') return ['этап 1: дойти до отмеченной точки', 'этап 2: найти дневник в отмеченном месте', 'этап 3: отнести дневник Сидору'][Math.min(q.stage, 2)];
    if (q.type === 'sensor') return q.placed ? 'датчик стоит · ' + st : 'поставь датчик в точке';
    return st;
  },
  spawnBounty(q) {
    const s = new Stalker('bandit', q.x, q.y); s.c = Object.assign({}, CFG.stalkers.bandit, { hp: 130 }); s.hp = 130; s.bounty = true; s.qid = q.id; s.name = q.name + ' (главарь)'; Stalkers.list.push(s);
  },
  accept(i) {
    if (P.quests.length >= 3) return log('Больше трёх заданий не потянешь.');
    const q = P.offers.splice(i, 1)[0]; if (!q) return; q.id = Date.now() + i;
    if (q.type === 'rescue') W.corpses.push({ x: q.x, y: q.y, items: [['dogtag', 1], ['ammo', 6], ['money', 25]], looted: false, art: null,
      note: { txt: 'Экспедиция: «Нас осталось двое. Идём к пилонам. Если кто найдёт — скажите, что мы дошли».', anom: null } });
    if (q.type === 'sensor' && !hasItem('sensor')) invAdd('sensor', 1);
    if (q.type === 'bounty') this.spawnBounty(q);
    P.quests.push(q); log('Задание принято: ' + q.text, '#e8c060');
  },
  done(q) {
    if (q.type === 'fetch') return P.inv.some(s => s.art === q.art);
    if (q.type === 'hunt' || q.type === 'discover' || q.type === 'help' || q.type === 'lab' || q.type === 'vault') return q.prog >= q.n;
    if (q.type === 'recon') return q.reached;
    if (q.type === 'rescue') return invCount('dogtag') > 0;
    if (q.type === 'bring') return invCount(q.mat) >= q.n;
    if (q.type === 'ash') return q.prog >= q.n && invCount('coalfang') >= q.n;
    if (q.type === 'deep') return q.stage >= 3;
    if (q.type === 'sensor') return q.placed;
    if (q.type === 'bounty') return q.prog >= 1;
    if (q.type === 'chain') return q.stage >= 2 && invCount('diary') > 0;
  },
  turnIn(i) {
    const q = P.quests[i]; if (!q || !this.done(q)) return;
    if (q.type === 'fetch') { const j = P.inv.findIndex(s => s.art === q.art); P.inv.splice(j, 1); }
    if (q.type === 'rescue') invTake('dogtag', 1);
    if (q.type === 'bring') invTake(q.mat, q.n);
    if (q.type === 'ash') invTake('coalfang', q.n);
    if (q.type === 'deep') { P.deepDone = true; P.karma.study += 2; this.gainLore(); this.gainLore(); }
    if (q.type === 'chain') { invTake('diary', 1); P.chainDone = true; this.gainLore(); this.gainLore(); }
    if (q.item) { invAdd('art', 1, q.item[1]); log('Награда: ' + CFG.arts[q.item[1]].name, '#e8c060'); }
    P.money += q.reward; P.earned += q.reward; P.rep += q.rep; addXp(30 + q.rep * 5); P.quests.splice(i, 1);
    log('Задание выполнено: +' + q.reward + ' ₽, репутация +' + q.rep, '#e8c060'); if (q.type === 'rescue' || q.type === 'help') P.karma.mercy += 1; this.gainLore();
  },
  onLab() { for (const q of P.quests) if (q.type === 'lab' && q.prog < q.n) { q.prog = q.n; log('Шкаф вскрыт. Возвращайся к Сидору.', '#e8c060'); } },
  // Все арты, которые реально встречаются в аномалиях (без пустышки и наград цепочек)
  wildArts() { const s = new Set(); for (const k in CFG.anoms) for (const a of CFG.anoms[k].arts) s.add(a); s.delete('dud'); return [...s]; },
  onVault(b) {
    for (const q of P.quests) {
      if (q.type === 'vault' && q.prog < q.n) { q.prog = q.n; log('Сейф вскрыт. Возвращайся к Сидору.', '#e8c060'); }
      if (q.type === 'deep' && b && q.stage < 3 && b.i === q.bunks[q.stage]) {
        const txt = CFG.deepNotes[q.stage]; P.notes.push({ txt, sold: false }); log('В сейфе — потрёпанная тетрадь. Записка: «' + txt + '»', '#c8b0e8'); addXp(25);
        q.stage++;
        if (q.stage < 3) { const n = W.bunkers.find(x => x.i === q.bunks[q.stage]); n.known = true; q.x = n.x; q.y = n.y; log('Следы ведут дальше: новый бункер отмечен на карте (M).', '#e8c060'); }
        else { q.x = null; q.y = null; log('Последняя записка найдена. Возвращайся к Сидору.', '#e8c060'); }
      }
    }
  },
  onKill(kind) {
    for (const q of P.quests) {
      if (q.type === 'hunt' && q.sp === kind && q.prog < q.n) { q.prog++; log('Задание: ' + q.prog + '/' + q.n, '#e8c060'); }
      if (q.type === 'ash' && kind === 'cinder' && q.prog < q.n) { q.prog++; log('Задание: ' + q.prog + '/' + q.n, '#e8c060'); }
      if (q.type === 'bounty' && kind === 'bounty' && q.prog < 1) { q.prog = 1; log('Главарь убит. Возвращайся за наградой.', '#e8c060'); }
    }
  },
  onDiscover() { for (const q of P.quests) if (q.type === 'discover' && q.prog < q.n) { q.prog++; log('Картограф: ' + q.prog + '/' + q.n, '#e8c060'); } },
  onHelp() { for (const q of P.quests) if (q.type === 'help' && q.prog < q.n) { q.prog++; log('Раненый спасён. Отчитайся Сидору.', '#e8c060'); } },
  onSensor() { for (const q of P.quests) if (q.type === 'sensor' && !q.placed && Math.hypot(q.x - P.x, q.y - P.y) < 150) { q.placed = true; log('Датчик установлен в нужной точке. Возвращайся.', '#e8c060'); } },
  questUpdate() {
    for (const q of P.quests) {
      if (q.type === 'recon' && !q.reached && Math.hypot(q.x - P.x, q.y - P.y) < 80) { q.reached = true; log('Точка разведки достигнута. Возвращайся к Сидору.', '#e8c060'); addXp(10); }
      if (q.type === 'bounty') { const s = Stalkers.list.find(t => t.qid === q.id && !t.dead); if (s) { q.x = s.x; q.y = s.y; } else if (q.prog < 1 && !this._bountyCd) { this._bountyCd = 1; this.spawnBounty(q); } }
      if (q.type === 'chain') {
        if (q.stage === 0 && Math.hypot(q.x - P.x, q.y - P.y) < 90) {
          q.stage = 1; q.x = q.bx; q.y = q.by; addXp(15);
          W.corpses.push({ x: q.bx, y: q.by, items: [['diary', 1], ['medkit', 1], ['money', 60]], looted: false, art: null, note: { txt: 'Штейн: «Мы шли за шаром. Он не звал — он просто был. Записал всё, что понял. Если найдёте — отдайте Сидору».', anom: null } });
          log('Следы экспедиции. Они уходили дальше — отмечено новое место.', '#e8c060');
        }
        if (q.stage === 1 && invCount('diary') > 0) { q.stage = 2; q.x = null; q.y = null; log('Дневник найден. Неси Сидору.', '#e8c060'); }
      }
    }
  },

  // ---- травмы ----
  breakLeg(msg) { if (!P.fracture) { P.fracture = true; log(msg, '#e06060'); Snd.hit(); } },

  // ---- приманки и датчики ----
  throwLure() {
    if (P.cd > 0 || invCount('lure') < 1) return;
    invTake('lure', 1); P.cd = 0.5;
    const d = Math.min(340, Math.hypot(mouse.x + cam.x - P.x, mouse.y + cam.y - P.y));
    this.lureShots.push({ x: P.x, y: P.y, sx: P.x, sy: P.y, tx: P.x + Math.cos(P.ang) * d, ty: P.y + Math.sin(P.ang) * d, t: 0, dur: 0.3 + d / 800 }); Snd.tick();
  },
  throwShock() {
    if (P.cd > 0 || invCount('shock') < 1) return;
    invTake('shock', 1); P.cd = 0.5;
    const d = Math.min(300, Math.hypot(mouse.x + cam.x - P.x, mouse.y + cam.y - P.y));
    this.lureShots.push({ x: P.x, y: P.y, sx: P.x, sy: P.y, tx: P.x + Math.cos(P.ang) * d, ty: P.y + Math.sin(P.ang) * d, t: 0, dur: 0.3 + d / 800, kind: 'shock' }); Snd.tick();
  },
  explode(x, y) {
    Snd.zap(); G.shake = 0.25; Mutants.hear(x, y, 650);
    for (const list of [Mutants.list, Stalkers.list]) for (const m of list) if (!m.dead && Math.hypot(m.x - x, m.y - y) < 90) { m.hurt(45, P); if (m.cd != null) m.cd = 2.5; }
    for (let i = 0; i < 14; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * 220, vy: (Math.random() - 0.5) * 220, life: 0.5, col: '#9ad0ff' });
    this.flash = { x, y, t: 0.35 };
  },
  lureAt(m) { return this.lures.some(l => Math.hypot(l.x - m.x, l.y - m.y) < 36); },

  update(dt) {
    const psy = fx('psy'); if (psy) P.stress = Math.min(100, P.stress + psy * dt);
    if (P.burn > 0) { P.burn -= dt; P.hurt(4 * dt, 'fire'); if (Math.random() < dt * 14) parts.push({ x: P.x + (Math.random() - 0.5) * 8, y: P.y - 4, vx: (Math.random() - 0.5) * 20, vy: -30, life: 0.4, col: Math.random() < 0.5 ? '#ff8a30' : '#ffd070' }); if (P.burn <= 0) log('Огонь погас.', '#9ab8d8'); }
    if (P.inAnom && P.inAnom.type === 'plesh' && Math.random() < dt * 0.6) this.breakLeg('Плешь вдавила ногу в землю. Перелом.');
    if (P.infect > 0) { P.infect += dt; P.hp -= 0.3 * dt; if (P.infect > 180) { P.infect = 0; log('Организм справился с заражением.', '#a8c890'); } }
    const pb = this.prevBleed; if (pb > 0 && pb <= dt * 1.5 && P.bleed <= 0 && P.infect <= 0 && Math.random() < 0.35) { P.infect = 0.01; log('Рана загноилась. Нужен антибиотик.', '#c0e060'); } this.prevBleed = P.bleed;
    if (G.scene !== 'zone') return;   // дальше — только то, что привязано к карте Зоны
    // закрытый сектор: без репутации или пропуска — оцепление
    if (W.danger(P.x, P.y) >= 4 && !P.pass && P.rep < CFG.gate.rep && G.t > this.gateCool) {
      this.gateCool = G.t + 120; Stalkers.spawnPatrol(); log('Оцепление! Сюда пускают только тех, кого знают в лагере.', '#e06060'); Snd.zap();
    }
    this.questUpdate();
    // датчики
    for (let i = this.sensors.length - 1; i >= 0; i--) {
      const s = this.sensors[i]; s.t -= dt; s.cool -= dt; s.ping = Math.max(0, s.ping - dt);
      if (s.t <= 0) { this.sensors.splice(i, 1); continue; }
      if (s.cool <= 0) {
        let best = null, bd = 260;
        for (const m of Mutants.list) { const d = Math.hypot(m.x - s.x, m.y - s.y); if (d < bd && m.state !== 'sleep') { bd = d; best = m; } }
        for (const m of Stalkers.list) { const d = Math.hypot(m.x - s.x, m.y - s.y); if (d < bd && m.state !== 'wounded') { bd = d; best = m; } }
        if (best) { s.cool = 7; s.ping = 7; Snd.blip(1800, 0.08, 0.1, 'square'); const a = Math.atan2(best.y - s.y, best.x - s.x); log('Датчик: движение на ' + this.DIRS[(Math.round(a / (Math.PI / 4)) + 8) % 8] + ', ~' + Math.round(bd / 10) + ' м', '#9ab8d8'); }
      }
    }
    // приманки
    for (let i = this.lureShots.length - 1; i >= 0; i--) {
      const b = this.lureShots[i]; b.t += dt; const k = Math.min(1, b.t / b.dur); b.x = b.sx + (b.tx - b.sx) * k; b.y = b.sy + (b.ty - b.sy) * k;
      if (k >= 1) { this.lureShots.splice(i, 1); if (b.kind === 'shock') this.explode(b.tx, b.ty); else { this.lures.push({ x: b.tx, y: b.ty, t: 25, tick: 0 }); log('Приманка брошена. Держись подальше.', '#c09070'); } }
    }
    for (let i = this.lures.length - 1; i >= 0; i--) {
      const l = this.lures[i]; l.t -= dt; l.tick -= dt;
      if (l.tick <= 0) { l.tick = 2; Mutants.hear(l.x, l.y, 300, 'lure'); }
      if (l.t <= 0) this.lures.splice(i, 1);
    }
  },
  status() {
    let h = '';
    if (P.fracture) h += ' <b style="color:#e06060">ПЕРЕЛОМ</b>';
    if (P.burn > 0) h += ' <b style="color:#ff8a30">ОЖОГ</b>';
    if (P.grab > 0) h += ' <b style="color:#60c0a0">СХВАЧЕН</b>';
    if (P.infect > 0) h += ' <b style="color:#c0e060">ИНФЕКЦИЯ</b>';
    if (G.scene === 'zone' && W.danger(P.x, P.y) >= 4 && !P.pass && P.rep < CFG.gate.rep) h += ' <b style="color:#e06060">ЗАКРЫТЫЙ СЕКТОР</b>';
    return h + ' · реп ' + (P.rep | 0);
  },
  drawWorld() {
    for (const l of this.lures) { ctx.globalAlpha = 0.3 + 0.2 * Math.sin(G.t * 6); ctx.strokeStyle = '#a04030'; ctx.beginPath(); ctx.arc(l.x, l.y, 14 + (G.t * 20) % 16, 0, 6.28); ctx.stroke(); ctx.globalAlpha = 1; px(l.x, l.y, '#7a1e1e', 6); }
    for (const s of this.sensors) { px(s.x, s.y, s.ping > 0 && Math.floor(G.t * 4) % 2 ? '#ff6060' : '#4a90d0', 5); }
    for (const b of this.lureShots) px(b.x, b.y, b.kind === 'shock' ? '#9ad0ff' : '#7a1e1e', 4);
    if (this.flash && this.flash.t > 0) { this.flash.t -= 0.016; ctx.globalAlpha = Math.max(0, this.flash.t * 2); circle(this.flash.x, this.flash.y, 90, '#cfe6ff'); ctx.globalAlpha = 1; }
  },
  drawMap(m, k) {
    m.strokeStyle = 'rgba(200,180,120,.25)'; m.setLineDash([4, 6]);
    for (const r of [0.2, 0.42, 0.68]) { m.beginPath(); m.arc(W.C.x * k, W.C.y * k, r * W.S * 1.1 * k, 0, 6.28); m.stroke(); } m.setLineDash([]);
    m.fillStyle = '#e06060'; m.font = '10px Consolas'; m.textAlign = 'left'; m.fillText('сектор 4 — закрыт (реп ' + CFG.gate.rep + ' или пропуск)', W.C.x * k + 0.68 * W.S * 1.1 * k * 0.7, W.C.y * k - 0.68 * W.S * 1.1 * k * 0.7); m.textAlign = 'center';
    for (const q of P.quests) if (q.x != null) { m.fillStyle = q.reached ? '#88cc88' : '#60d0e0'; m.fillText('◆', q.x * k, q.y * k + 4); }
    for (const s of this.sensors) { m.fillStyle = '#4a90d0'; m.fillText('◉', s.x * k, s.y * k + 4); }
  },

  // ---- панели ----
  openJournal() { G.ui = { k: 'journal' }; renderPanel(); },
  // ---- разговоры с жителями лагеря (CFG.talk) ----
  openCampTalk(n) { G.ui = { k: 'talk', n, msg: '' }; renderPanel(); },
  talkHTML(u) {
    const d = CFG.talk[u.n.id], done = P.talked[u.n.id];
    const rows = d.topics.map((t, i) => {
      const dis = (t.k === 'story' && (done || P.rep < 3)) || (t.k === 'duds' && !P.inv.some(s => s.art === 'dud'));
      return row(t.k === 'duds' ? Icons.html('art') : '💬', t.t, t.k === 'story' && done ? 'Уже рассказал' : t.s, btn('tk:' + i, t.k === 'duds' ? 'Продать' : t.k === 'locker' ? 'Открыть' : 'Спросить', dis));
    }).join('');
    return '<div class="x" data-a="close">✕ Esc</div><h2>' + u.n.name + ' <span class="stat">(' + d.role + ')</span></h2><div class="note" style="font-size:14px">' + (u.msg || d.greet) + '</div><div style="margin-top:8px">' + rows + '</div>' + row('…', 'Уйти', '', btn('close', 'Уйти'));
  },
  talk(u, i) {
    const d = CFG.talk[u.n.id], t = d.topics[i]; if (!t) return;
    if (t.k === 'rumor') u.msg = '«' + U.pick(CFG.rumors) + '»';
    else if (t.k === 'tip') u.msg = '«' + U.pick(CFG.tips) + '»';
    else if (t.k === 'text') u.msg = t.a;
    else if (t.k === 'gate') u.msg = 'Четвёртый сектор закрыт. Пропустят при репутации ' + CFG.gate.rep + ' (у тебя ' + (P.rep | 0) + ')' + (P.pass ? ' — а у тебя ещё и пропуск, так что иди.' : ', либо с пропуском: его продаёт Сидор за 250 ₽ (нужна репутация 5). Без этого — оцепление, и разговор с ними короткий.');
    else if (t.k === 'emission') {
      const e = G.emi;
      u.msg = e.s === 'warn' ? 'Слышишь сирену?! Живо в укрытие!' : e.s === 'blast' ? 'Тихо. Сиди, где сидишь, и не высовывайся.' : e.next < 45 ? 'Зубы ломит так, что глаза слезятся. Минута-две — не больше.' : e.next < 150 ? 'Скоро. Не уходи далеко от лагеря или бункера, слышишь?' : 'Пока тихо. Но я бы на это не рассчитывал: Зона обманывает.';
    } else if (t.k === 'duds') {
      let n = 0; for (let j = P.inv.length - 1; j >= 0; j--) if (P.inv[j].art === 'dud') { P.inv.splice(j, 1); n++; }
      if (n) { const pay = n * 9; P.money += pay; P.earned += pay; Snd.pick(); u.msg = 'Мосол пересчитывает пустышки, как монеты: «' + n + ' штук — ' + pay + ' рублей. Приятно иметь дело».'; } else u.msg = 'У тебя нет пустышек.';
    } else if (t.k === 'locker') { G.ui = { k: 'storage' }; return; }
    else if (t.k === 'story') {
      if (P.talked[u.n.id]) return; if (P.rep < 3) { u.msg = 'Тебя тут ещё плохо знают. Сделай что-нибудь для лагеря — тогда поговорим по-настоящему.'; return; }
      P.talked[u.n.id] = true; u.msg = '«' + d.story + '»'; this.gainLore(); P.karma.study += 0.5;
    }
  },
  openNpc(s) { G.ui = { k: 'npc', s, msg: '' }; renderPanel(); },
  journalHTML() {
    const kz = P.karma, qs = P.quests.length ? P.quests.map((q, i) => row('📋', q.text, this.progText(q) + ' · ' + q.reward + ' ₽', btn('qdrop:' + i, '✕'))).join('') : '<div class="stat">Заданий нет. Их дают у бармена.</div>';
    return `<div class="x" data-a="close">✕ Esc</div><h2>Журнал</h2><div class="cols"><div><h3>Репутация: ${P.rep | 0}</h3>
      <div class="stat">Жадность <b>${Math.min(99, Math.round(P.earned / 100))}</b> · Милосердие <b>${kz.mercy}</b> · Жестокость <b>${kz.cruelty}</b> · Исследование <b>${kz.study.toFixed ? kz.study.toFixed(1) : kz.study}</b></div>
      <div class="stat">Оцепление пропускает в сектор 4 при репутации ≥ ${CFG.gate.rep} или с пропуском${P.pass ? ' (пропуск есть)' : ''}.</div>
      <h3>Задания (${P.quests.length}/3)</h3>${qs}
      <h3>Записки (${P.notes.length})</h3>${P.notes.map(n => '<div class="note">' + n.txt + '</div>').join('') || '<div class="stat">Нет.</div>'}</div>
      <div><h3>Что известно о Зоне (${P.lore}/${CFG.lore.length})</h3>${CFG.lore.slice(0, P.lore).map(t => '<div class="note">' + t + '</div>').join('') || '<div class="stat">Пока ничего. Учёный исследует артефакты, задания открывают правду.</div>'}</div></div>`;
  },
  npcHTML(u) {
    const s = u.s;
    if (s.state === 'wounded') return `<div class="x" data-a="close">✕ Esc</div><h2>${s.name} (раненый)</h2><div class="note">Лежит, зажимая бок. Дышит тяжело.</div>
      <div class="cols"><div>${row('✚', 'Отдать аптечку', 'Спасти. Репутация и милосердие растут.', btn('nheal', 'Отдать', invCount('medkit') < 1))}${row('☠', 'Добить', 'Забрать всё. Тебя запомнят.', btn('nkill', 'Добить'))}${row('…', 'Уйти', '', btn('close', 'Уйти'))}</div></div>`;
    return `<div class="x" data-a="close">✕ Esc</div><h2>${s.name} (сталкер)</h2><div class="note">${u.msg || 'Кивает. Рука рядом с оружием, но без злобы.'}</div>
      <div class="cols"><div>${row('💬', 'Что слышно?', 'Слух', btn('nrumor', 'Спросить'))}${row('🧭', 'Купить наводку', 'Отметит аномалии вокруг', btn('ntip', '60 ₽', P.money < 60))}
      ${row('🤝', 'Попросить помощи', 'Нужна репутация 10+', btn('nhelp', 'Просить', s.gave))}${row('☠', 'Напасть', 'Репутация −20. Ты — бандит.', btn('natk', 'Напасть'))}</div></div>`;
  },
  endingHTML(u) {
    const e = CFG.endings[u.key];
    return `<h2 style="font-size:22px">${e.title}</h2><div class="note" style="font-size:15px;line-height:1.5">${e.text}</div>
      <div class="stat" style="margin:10px 0">Заработано: ${P.earned} ₽ · Убито: ${P.kills} · Знаний: ${P.lore}/${CFG.lore.length} · Милосердие ${P.karma.mercy}, жестокость ${P.karma.cruelty} · Репутация ${P.rep | 0}</div>
      <div>${btn('endcont', 'Вернуться в Зону')} ${btn('endnew', 'Начать заново')}</div>`;
  },
  ending() {
    const first = !P.goal; if (first) { P.goal = true; addXp(200); }
    const sc = { greed: Math.min(10, P.earned / 600), cruelty: P.karma.cruelty, mercy: P.karma.mercy, study: P.karma.study + P.lore * 0.6 };
    let key = 'silence', best = 3;
    if (P.lore >= CFG.lore.length && P.karma.study >= 5) key = 'understand';
    else for (const k in sc) if (sc[k] > best) { best = sc[k]; key = k; }
    closePanel(); G.ui = { k: 'ending', key }; renderPanel();
  },

  tradeExtra(vk) {
    let h = '<div class="cols">';
    if (vk === 'gun') {
      h += this.gunShopHTML();
      h += '</div>';
    } else if (vk === 'gear') {
      h += '<div><h3>Услуги</h3>'; const bs = this.bestSuit();
      if (bs) { const c = this.suitRepairCost(); h += row('🧥', 'Ремонт костюма', 'Износ ' + Math.round(100 - P.suitCond) + '%', btn('srepair', c ? c + ' ₽' : 'Исправно', !c || P.money < c)); }
      if (bs || this.bestCoat()) { h += row('⚙', 'Доработка снаряжения', 'Ремонт из хлама и тюнинг костюма', btn('swork', G.ui && G.ui.ssel ? 'Закрыть' : 'Открыть')); if (G.ui && G.ui.ssel) h += '<div class="note">' + this.suitWorkHTML() + '</div>'; }
      const up = this.slotPrice(); if (up) h += row('✦', 'Ещё один контейнер', 'Слотов под артефакты: ' + P.equip.length + ' → ' + (P.equip.length + 1), btn('upslot', up + ' ₽', P.money < up));
      h += '</div>';
    } else if (vk === 'sci') {
      h += '<div><h3>Исследование (' + Camp.researchCost() + ' ₽)</h3>'; let any = false;
      P.inv.forEach((s, i) => { if (s.art && P.known[s.art] && !P.researched[s.art]) { any = true; h += row('🔬', CFG.arts[s.art].name, 'Учёный расскажет, что знает о Зоне', btn('research:' + i, Camp.researchCost() + ' ₽', P.money < Camp.researchCost() || P.lore >= CFG.lore.length)); } });
      if (!any) h += '<div class="stat">Принеси опознанный артефакт нового вида.</div>';
      h += '</div>';
    } else if (vk === 'bar') {
      h += '<div><h3>Задания</h3>';
      P.offers.forEach((o, i) => { h += row('📋', o.text, 'Награда ' + o.reward + ' ₽ · репутация +' + o.rep + (o.item ? ' · артефакт' : ''), btn('qacc:' + i, 'Взять', P.quests.length >= 3)); });
      P.quests.forEach((q, i) => { h += row('✔', q.text, this.progText(q), btn('qturn:' + i, 'Сдать', !this.done(q))); });
      const cells = known.reduce((a, b) => a + b, 0) - P.mapSold, pay = Math.round(Math.max(0, cells) * 0.04 * (1 + 0.1 * P.sk.mapping));
      h += '</div><div><h3>Услуги</h3>' + row('🛡', 'Страховка', 'Если погибнешь — вернут вместе с хабаром (один раз)', btn('ins', '150 ₽', P.insured || P.money < 150));
      h += row('🎫', 'Пропуск в сектор 4', P.pass ? 'Уже есть' : 'Нужна репутация 5+. Оцепление пропустит.', btn('pass', '250 ₽', P.pass || P.rep < 5 || P.money < 250));
      h += row('🧭', 'Проводник', 'Проведёт и отметит аномалии на большом участке', btn('guide', '220 ₽', P.money < 220));
      h += row('🗺', 'Продать данные разведки', 'Новых клеток карты: ' + Math.max(0, cells) + ' (' + pay + ' ₽)', btn('sellmap', pay + ' ₽', pay < 20));
      h += '<h3>На рынке</h3>' + ((G.events || []).map(e => '<div class="note">' + e.text + '</div>').join('') || '<div class="stat">Спокойно.</div>') + '</div>';
    }
    return h + '</div>';
  },
  invExtra() {
    const w = Wpn.of(P.weapon);
    return `<div class="cols"><div><h3>Состояние</h3><div class="stat">Оружие: <b style="color:${Wpn.color(P.weapon)}">${w.name}</b> (износ ${Math.round(100 - P.cond[P.weapon])}%) · сменить: клавиша 1 при выбранном слоте</div>
      <div class="stat">Костюм: <b>${this.bestSuit() ? Gear.name(this.bestSuit()) + ' (износ ' + Math.round(100 - P.suitCond) + '%)' : 'нет'}</b></div>
      <div class="stat">Травмы: <b>${(P.fracture ? 'перелом (шина) ' : '') + (P.infect > 0 ? 'заражение (антибиотик) ' : '') + (P.burn > 0 ? 'ожог (вода или аптечка) ' : '') + (P.bleed > 0 ? 'кровотечение ' : '') || 'нет'}</b></div></div></div>`;
  },

  // ---- обработка кликов в панелях (true = обработано) ----
  click(a, arg, arg2, u) {
    const i = +arg;
    switch (a) {
      case 'buy': {
        const d = CFG.items[arg], p = this.buyPrice(arg);
        if (d.req) for (const k in d.req) if (P.sk[k] < d.req[k]) { log('Слишком тяжело: нужен навык «' + CFG.skills[k].name + '» ' + d.req[k] + '.'); return true; }
        if (P.money >= p) { P.money -= p; invAdd(arg, d.pack || 1); Snd.pick(); } return true;
      }
      case 'sell': case 'sellall': {
        const s = P.inv[i]; if (!s) return true; const n = a === 'sellall' ? s.n : 1, p = sellPrice(s, u.v) * n;
        P.money += p; P.earned += p; addXp(p * 0.06); const key = s.art || s.id; G.demand[key] = Math.max(0.5, (G.demand[key] || 1) * Math.pow(0.94, n));
        if (s.art) P.inv.splice(i, 1); else { s.n -= n; if (s.n <= 0) P.inv.splice(i, 1); } Snd.pick(); return true;
      }
      case 'ident': {
        const s = P.inv[i], v = CFG.vendors[u.v];
        if (s && s.art && P.money >= Camp.identCost()) { P.money -= Camp.identCost(); P.known[s.art] = true; addXp(25); P.karma.study += 0.5; log('Опознан: ' + CFG.arts[s.art].name + ' (' + Gear.grade(s.q).n.toLowerCase() + '). ' + CFG.arts[s.art].desc, Gear.grade(s.q).col); } return true;
      }
      case 'sleep': {
        const v = CFG.vendors.bar;
        if (P.money >= Camp.sleepCost()) { P.money -= Camp.sleepCost(); Camp.sleepBonus(); G.clock += (((7 - G.hour) + 24) % 24) * CFG.time.dayLen / 24; P.hp = 100; P.stam = maxStam(); P.rad = Math.max(0, P.rad - 20); P.stress = 0; P.food = Math.max(20, P.food - 15); this.genOffers(); save(); log('Ты выспался. Утро. Игра сохранена.'); closePanel(); }
        return true;
      }
      case 'wbuy': { const w = CFG.weapons[arg]; if (P.money >= w.price && !P.weapons.includes(arg)) { P.money -= w.price; P.weapons.push(arg); P.weapon = arg; Snd.pick(); log('Куплено: ' + w.name); } return true; }
      case 'wequip': P.weapon = arg; return true;
      case 'wbuyg': Wpn.buyOffer(i); return true;
      case 'wsell': { if (P.weapons.length > 1 && P.weapons.includes(arg)) { const p = Wpn.sellPrice(arg), nm = Wpn.name(arg); Wpn.remove(arg); P.money += p; P.earned += p; Snd.pick(); log('Продано: ' + nm + ' за ' + p + ' ₽'); } return true; }
      case 'wwork': u.wsel = u.wsel === arg ? null : arg; return true;
      case 'wrepairm': { if (!P.weapons.includes(arg)) return true; const c = this.repairMats(100 - P.cond[arg], 'gun'); if (Object.keys(c).length && this.canPay(c)) { this.pay(c); P.cond[arg] = 100; Snd.pick(); log('Оружие починено из хлама.', '#a8c890'); } return true; }
      case 'wtune': {
        if (!P.weapons.includes(arg) || !Wpn.tuneKeys(arg).includes(arg2)) return true; const n = Wpn.tuneCount(arg), c = this.tuneCost(n);
        if (n >= Camp.lvl('gun') || !this.canPay(c)) return true; this.pay(c); Wpn.tune(arg, arg2); Snd.pick(); addXp(8); log('Тюнинг: ' + Wpn.name(arg) + ' — ' + Wpn.TUNE[arg2].text.toLowerCase() + '.', '#8fbf7f'); return true;
      }
      case 'swork': u.ssel = !u.ssel; return true;
      case 'srepairm': { const c = this.repairMats(100 - P.suitCond, 'gear'); if (this.bestSuit() && Object.keys(c).length && this.canPay(c)) { this.pay(c); P.suitCond = 100; Snd.pick(); log('Костюм починен из хлама.', '#a8c890'); } return true; }
      case 'gtune': {
        const s = P.inv[i]; if (!s || !Gear.isGear(s.id) || !Gear.keys(s.id).includes(arg2)) return true; const n = (s.g && s.g.t) || 0, c = this.tuneCost(n);
        if (n >= Camp.lvl('gear') || !this.canPay(c)) return true; this.pay(c); Gear.tune(s, arg2); Snd.pick(); addXp(8); log('Тюнинг: ' + Gear.name(s) + ' — ' + Gear.TUNE[arg2].text.toLowerCase() + '.', '#8fbf7f'); return true;
      }
      case 'wrepair': { const c = this.repairCost(arg); if (P.money >= c) { P.money -= c; P.cond[arg] = 100; Snd.pick(); } return true; }
      case 'srepair': { const c = this.suitRepairCost(); if (P.money >= c) { P.money -= c; P.suitCond = 100; Snd.pick(); } return true; }
      case 'upslot': { const c = this.slotPrice(); if (c && P.money >= c) { P.money -= c; P.equip.push(null); Snd.pick(); log('Контейнер добавлен.'); } return true; }
      case 'qacc': this.accept(i); return true;
      case 'qturn': this.turnIn(i); return true;
      case 'qdrop': P.quests.splice(i, 1); return true;
      case 'ins': if (P.money >= 150 && !P.insured) { P.money -= 150; P.insured = true; log('Страховка оформлена.', '#a8c890'); } return true;
      case 'pass': if (P.money >= 250 && P.rep >= 5 && !P.pass) { P.money -= 250; P.pass = true; log('Пропуск получен. Оцепление тебя пропустит.', '#a8c890'); } return true;
      case 'guide': {
        if (P.money < 220) return true; P.money -= 220;
        const p = W.spot(500, Math.random); reveal(p.x, p.y, 900); let n = 0;
        for (const a2 of W.anoms) if (Math.hypot(a2.x - p.x, a2.y - p.y) < 900) { a2.known = true; n++; }
        for (const b of W.bunkers) if (Math.hypot(b.x - p.x, b.y - p.y) < 900) b.known = true;
        log('Проводник показал большой участок: аномалий отмечено — ' + n + '. До ближайшего выброса.', '#9ab8d8'); return true;
      }
      case 'sellmap': {
        const cells = known.reduce((x, y) => x + y, 0) - P.mapSold, pay = Math.round(Math.max(0, cells) * 0.04 * (1 + 0.1 * P.sk.mapping));
        if (pay >= 20) { P.money += pay; P.earned += pay; P.mapSold += Math.max(0, cells); addXp(pay * 0.05); Snd.pick(); log('Данные разведки проданы: +' + pay + ' ₽', '#e8c060'); } return true;
      }
      case 'research': {
        const s = P.inv[i]; if (s && s.art && P.money >= Camp.researchCost() && !P.researched[s.art]) { P.money -= Camp.researchCost(); P.researched[s.art] = true; P.karma.study += 1; addXp(30); this.gainLore(); } return true;
      }
      case 'tk': this.talk(u, i); return true;
      case 'nrumor': u.msg = U.pick(CFG.rumors); return true;
      case 'ntip': {
        if (P.money < 60) return true; P.money -= 60; let n = 0;
        for (const a2 of W.anoms) if (Math.hypot(a2.x - P.x, a2.y - P.y) < 700) { a2.known = true; n++; }
        reveal(P.x, P.y, 500); u.msg = 'Показал на местности. Отмечено аномалий: ' + n + '.'; return true;
      }
      case 'nhelp': {
        if (P.rep < 10) { u.msg = 'Тебя тут мало знают. Приходи, когда о тебе будут говорить.'; return true; }
        u.s.gave = true; invAdd('medkit', 1); u.msg = 'Отдал аптечку. «Только не забудь, кому должен».'; return true;
      }
      case 'natk': u.s.hostile = true; P.rep -= 20; log('Ты напал на своего. Теперь ты бандит.', '#e06060'); closePanel(); return true;
      case 'nheal': {
        if (invCount('medkit') < 1) return true; invTake('medkit', 1); const s = u.s;
        s.kind = 'loner'; s.c = CFG.stalkers.loner; s.state = 'wander'; s.hp = s.c.hp; P.rep += 8; P.karma.mercy += 2; P.money += 40; addXp(20); this.onHelp();
        for (const a2 of W.anoms) if (Math.hypot(a2.x - s.x, a2.y - s.y) < 600) a2.known = true;
        log('Раненый очнулся: «Спасибо. Держи деньги и наводку на аномалии». +40 ₽, репутация +8', '#a8c890'); closePanel(); return true;
      }
      case 'nkill': u.s.hurt(999, P); closePanel(); return true;
      case 'endcont': closePanel(); return true;
      case 'endnew': try { localStorage.removeItem('zone_save_v2'); } catch (e) { } closePanel(); newGame(); return true;
    }
    return false;
  },
  nearExtra(c) {
    for (const s of Stalkers.list) {
      if (s.dead) continue; const d = Math.hypot(s.x - P.x, s.y - P.y);
      if (s.state === 'wounded') c(s, d, 50, 'Помочь раненому', () => Meta.openNpc(s));
      else if (!s.hostile) c(s, d, 60, 'Поговорить: ' + s.name, () => Meta.openNpc(s));
    }
  },
  // ---- отрисовка дальних меток на карте: см. drawMap ----
};

// ---- переопределения функций main.js ----
function shoot() {
  const w = Wpn.of(P.weapon); if (P.cd > 0) return;
  if (invCount(w.ammo || 'ammo') < 1 && !(w.perAmmo && P.fuel > 0)) { Snd.tick(); P.cd = 0.3; log(w.perAmmo ? 'Топлива нет.' : 'Патронов нет.'); return; }
  const cond = P.cond[P.weapon];
  if (cond < 25 && Math.random() < 0.15 + 0.3 * (1 - cond / 25)) { P.cd = 0.6; Snd.tick(); log('Осечка! Оружие изношено — почини у оружейника.', '#e0a060'); return; }
  const saved = w.ammoSave && Math.random() < w.ammoSave;   // Уникальное «Скряга»: выстрел бесплатный
  if (saved) { /* патрон цел */ } else if (w.perAmmo) { if (P.fuel <= 0) { invTake(w.ammo, 1); P.fuel = w.perAmmo; } P.fuel--; } else invTake(w.ammo || 'ammo', 1);
  P.cd = w.cd; P.recoil = 1; P.cond[P.weapon] = Math.max(0, cond - w.wear);
  if (w.cone) return Meta.flame(w);
  const moving = Math.hypot(keys.mx || 0, keys.my || 0) > 0;
  for (let n = 0; n < w.pellets; n++) {
    const a = P.ang + (Math.random() - 0.5) * w.spread * (P.sneak ? 0.6 : 1) * (moving ? 1.6 : 1) * (cond < 50 ? 1.3 : 1);
    const dx = Math.cos(a), dy = Math.sin(a), dun = G.scene === 'dungeon'; let best = null, bt = dun ? Dungeon.rayLen(P.x, P.y, dx, dy, w.range) : w.range;
    for (const list of dun ? [Dungeon.enemies] : [Mutants.list, Stalkers.list]) for (const m of list) {
      if (m.dead || Mutants.hidden(m)) continue; const rx = m.x - P.x, ry = m.y - P.y, t = rx * dx + ry * dy; if (t < 0 || t > bt) continue;
      if (Math.abs(rx * dy - ry * dx) < m.r + 3) { best = m; bt = t; }
    }
    tracers.push({ x1: P.x, y1: P.y, x2: P.x + dx * bt, y2: P.y + dy * bt, t: 0.07 });
    if (best) { const unaware = w.ambush && (best.state === 'idle' || best.state === 'wander' || best.state === 'sleep'); const crit = w.crit && Math.random() < w.crit; best.hurt(w.dmg * (unaware ? w.ambush : 1) * (crit ? 2 : 1), P); if (unaware) log('Удар из засады!', '#c8b0e8'); if (crit) log('Критический удар!', '#e8a040'); for (let i = 0; i < 4; i++) parts.push({ x: best.x, y: best.y, vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 80, life: 0.5, col: '#7a1a1a' }); }
  }
  Snd.shot(); G.shake = 0.12; Mutants.hear(P.x, P.y, w.noise);
}
function useSel() {
  const h = heldNames[P.sel];
  if (G.scene === 'dungeon' && (h === 'bolt' || h === 'lure' || h === 'shock')) { if (!(G.t < (Meta._dunLog || 0))) { Meta._dunLog = G.t + 3; log('Под землёй это ни к чему.'); } return; }
  if (h === 'weapon') shoot(); else if (h === 'bolt') throwBolt(); else if (h === 'lure') Meta.throwLure(); else if (h === 'shock') Meta.throwShock(); else if (invCount(h) > 0) useItem(h);
}
function useItem(id) {
  const u = CFG.items[id].use; if (!u || invCount(id) < 1) return;
  if (u.sensor) { invTake(id, 1); Meta.sensors.push({ x: P.x, y: P.y, t: 600, cool: 0, ping: 0 }); Meta.onSensor(); Snd.pick(); log('Датчик установлен. Услышишь, если что-то подойдёт.', '#9ab8d8'); return; }
  if (u.fixFracture && !P.fracture) return log('Переломов нет.');
  if (u.cureInfect && P.infect <= 0) return log('Заражения нет.');
  if (u.identify && !P.inv.some(x => x.art && !P.known[x.art])) return log('Нет неопознанных артефактов.');
  if (u.repairGun && P.cond[P.weapon] >= 99) return log('Оружие исправно.');
  if (u.repairSuit && (!Meta.bestSuit() || P.suitCond >= 99)) return log('Костюм не нуждается в ремонте.');
  invTake(id, 1); Snd.pick();
  if (u.repairGun) { P.cond[P.weapon] = Math.min(100, P.cond[P.weapon] + u.repairGun); log('Оружие подлатано.'); }
  if (u.repairSuit) { P.suitCond = Math.min(100, P.suitCond + u.repairSuit); log('Костюм залатан.'); }
  if (u.identify) { const s = P.inv.find(x => x.art && !P.known[x.art]); P.known[s.art] = true; P.karma.study += 0.5; addXp(15); log('Реагент показал: ' + CFG.arts[s.art].name + ' (' + Gear.grade(s.q).n.toLowerCase() + '). ' + CFG.arts[s.art].desc, Gear.grade(s.q).col); }
  if (u.heal) P.hp = Math.min(100, P.hp + u.heal);
  if (u.stopBleed) { P.bleed = 0; P.burn = 0; }
  if (u.food) P.food = Math.min(100, P.food + u.food);
  if (u.rad) P.rad = Math.max(0, Math.min(100, P.rad + u.rad));
  if (u.fixFracture) P.fracture = false;
  if (u.cureInfect) P.infect = 0;
  log('Использовано: ' + CFG.items[id].name);
}
function sellPrice(s, vk) {
  const v = CFG.vendors[vk], it = s.art ? null : CFG.items[s.id];
  const kind = s.art ? 'art' : it.part ? 'part' : it.junk ? 'junk' : s.id === 'meat' ? 'meat' : null;
  const m = kind && v.buys[kind]; if (!m) return 0;
  let val = baseVal(s);
  if (s.art) { if (!P.known[s.art]) val *= 0.3; else { val *= G.demand[s.art] || 1; if (CFG.arts[s.art].sci && vk === 'sci') val *= 1.3; } }
  else val *= G.demand[s.id] || 1;
  const key = s.art || s.id; val *= Camp.sellMul(vk); val *= (v.likes && v.likes[key]) || 1; val *= Meta.ev([key, kind]);
  return Math.max(1, Math.round(val * m * (1 + P.sk.trade * 0.05) * (1 + U.clamp(P.rep, -50, 50) * 0.002)));
}
function reachGoal() { Meta.ending(); }
function renderPanel() {
  const u = G.ui; if (!u || u.k === 'map') return;
  if (Camp.render(u)) return;
  if (u.k === 'journal') { panel.style.display = 'block'; panel.innerHTML = Meta.journalHTML(); return; }
  if (u.k === 'npc') { panel.style.display = 'block'; panel.innerHTML = Meta.npcHTML(u); return; }
  if (u.k === 'talk') { panel.style.display = 'block'; panel.innerHTML = Meta.talkHTML(u); return; }
  if (u.k === 'ending') { panel.style.display = 'block'; panel.innerHTML = Meta.endingHTML(u); return; }
  renderPanelBase();
  if (u.k === 'trade') panel.insertAdjacentHTML('beforeend', Meta.tradeExtra(u.v));
  else if (u.k === 'inv') panel.insertAdjacentHTML('beforeend', Meta.invExtra());
}

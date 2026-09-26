'use strict';
// Главный цикл: игрок, ввод, выброс, отрисовка, интерфейс, сохранение.
const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d'), lc = document.createElement('canvas').getContext('2d');
let VW = 0, VH = 0;
const G = { t: 0, clock: 0, hour: 7, night: 0, fog: 0.3, dead: false, deadT: 0, started: false, ui: null, shake: 0, hurtFlash: 0,
  scene: 'camp', demand: {}, emi: { s: 'calm', left: 0, next: CFG.emission.firstIn }, near: null, tip: null };
let W = null;
const P = { x: 0, y: 0, ang: 0, r: CFG.player.r, hp: 100, stam: 100, rad: 0, food: 80, stress: 0, bleed: 0, xp: 0, lvl: 1, sp: 0,
  sk: {}, money: 0, inv: [], equip: [null, null], notes: [], known: {}, sel: 0, cd: 0, slow: 1, sneak: false, running: false,
  dead: false, goal: false, wasOut: false, noiseT: 0, geigerRate: 0, burn: 0, fuel: 0,
  rep: 0, karma: { greed: 0, cruelty: 0, mercy: 0, study: 0 }, quests: [], offers: [], lore: 0, weapons: ['pistol'], weapon: 'pistol',
  cond: Object.fromEntries(Object.keys(CFG.weapons).map(k => [k, 100])), suitCond: 100, insured: false, pass: false, fracture: false, infect: 0, earned: 0, researched: {}, kills: 0, mapSold: 0,
  hurt(d, src) {
    if (G.dead) return;
    if (src === 'anom') d *= 1 - Meta.suitAnom();
    if (src !== 'emi') Meta.wearSuit(d);
    this.hp -= d; if (d >= 4) G.hurtFlash = 0.35;
    if (this.hp <= 0) die();
  } };
const keys = {}, mouse = { x: 0, y: 0, l: false, r: false };
const bolts = [], tracers = [], parts = [];
let cam = { x: 0, y: 0 };

// ---------- утилиты инвентаря ----------
const hasItem = id => P.inv.some(s => s.id === id);
const invCount = id => P.inv.reduce((n, s) => n + (s.id === id ? s.n : 0), 0);
function invAdd(id, n = 1, art) {
  if (art) { P.inv.push({ id: 'art', n: 1, art }); return; }
  const s = P.inv.find(s => s.id === id && !s.art); if (s) s.n += n; else P.inv.push({ id, n });
}
function invTake(id, n = 1) {
  for (let i = 0; i < P.inv.length && n > 0; i++) {
    const s = P.inv[i]; if (s.id !== id) continue;
    const t = Math.min(n, s.n); s.n -= t; n -= t; if (!s.n) { P.inv.splice(i, 1); i--; }
  }
}
const slotW = s => s.art ? CFG.arts[s.art].w : CFG.items[s.id].w * s.n;
const fx = k => P.equip.reduce((v, a) => v + (a ? (CFG.arts[a].fx[k] || 0) : 0), 0);
const weight = () => P.inv.reduce((w, s) => w + slotW(s), 0) + P.equip.reduce((w, a) => w + (a ? CFG.arts[a].w : 0), 0);
const carryCap = () => CFG.player.carry + P.sk.carry * 4 + fx('carry');
const maxStam = () => CFG.player.stam * (1 + 0.15 * P.sk.endurance);
const radRes = () => Math.min(0.85, fx('radRes') + Meta.suitRad() + P.sk.resist * 0.05);
const hintR = () => 210 + P.sk.sense * 50 + (hasItem('detector2') ? 170 : hasItem('detector') ? 90 : 0);
const inCamp = (x = P.x, y = P.y) => G.scene !== 'zone' || Math.hypot(x - W.C.x, y - W.C.y) < W.C.r;
const isSheltered = () => G.scene !== 'zone' || W.sheltered(P.x, P.y);
const itemName = s => Meta.itemName(s);
const itemIcon = s => s.art ? Icons.html(P.known[s.art] ? 'art' : 'art_u') : CFG.items[s.id].icon;
const baseVal = s => s.art ? CFG.arts[s.art].val : CFG.items[s.id].val;
function log(txt, col) { const d = document.createElement('div'); d.textContent = txt; if (col) d.style.color = col; $('log').appendChild(d); while ($('log').children.length > 7) $('log').firstChild.remove(); setTimeout(() => d.remove(), 9000); }
function addXp(n) {
  P.xp += n;
  while (P.xp >= 60 * Math.pow(P.lvl, 1.4)) { P.xp -= 60 * Math.pow(P.lvl, 1.4); P.lvl++; P.sp++; log('Опыт растёт: уровень ' + P.lvl + '. Очко навыка (Tab).', '#e8c060'); }
}

// ---------- торговля ----------
function sellPrice(s, vk) {
  const v = CFG.vendors[vk];
  const kind = s.art ? 'art' : CFG.items[s.id].part ? 'part' : CFG.items[s.id].junk ? 'junk' : s.id === 'meat' ? 'meat' : null;
  const m = kind && v.buys[kind]; if (!m) return 0;
  let val = baseVal(s);
  if (s.art) { if (!P.known[s.art]) val *= 0.3; else { val *= G.demand[s.art] || 1; if (CFG.arts[s.art].sci && vk === 'sci') val *= 1.3; } }
  else val *= G.demand[s.id] || 1;
  return Math.max(1, Math.round(val * m * (1 + P.sk.trade * 0.05)));
}
const buyPrice = id => Meta.buyPrice(id);

// ---------- новая игра / сохранение ----------
const known = new Uint8Array((CFG.world.size / CFG.world.cell) ** 2);
const KN = CFG.world.size / CFG.world.cell;
function reveal(x, y, r) {
  const c = CFG.world.cell;
  for (let i = Math.max(0, Math.floor((x - r) / c)); i <= Math.min(KN - 1, Math.floor((x + r) / c)); i++)
    for (let j = Math.max(0, Math.floor((y - r) / c)); j <= Math.min(KN - 1, Math.floor((y + r) / c)); j++)
      if (Math.hypot((i + 0.5) * c - x, (j + 0.5) * c - y) < r) known[j * KN + i] = 1;
}
function resetPlayer() {
  Object.assign(P, { hp: 100, stam: 100, rad: 0, food: 80, stress: 0, bleed: 0, xp: 0, lvl: 1, sp: 0, money: 50, inv: [], equip: [null, null],
    notes: [], known: {}, sel: 0, cd: 0, dead: false, goal: false, wasOut: false, burn: 0, fuel: 0,
    rep: 0, karma: { greed: 0, cruelty: 0, mercy: 0, study: 0 }, quests: [], offers: [], lore: 0, weapons: ['pistol'], weapon: 'pistol',
    cond: Object.fromEntries(Object.keys(CFG.weapons).map(k => [k, 100])), suitCond: 100, insured: false, pass: false, fracture: false, infect: 0, earned: 0, researched: {}, kills: 0, mapSold: 0 });
  for (const k in CFG.skills) P.sk[k] = 0;
  invAdd('ammo', 12); invAdd('bolt', 15); invAdd('medkit', 1); invAdd('food', 2);
  P.x = W.C.x; P.y = W.C.y + 40; known.fill(0); reveal(W.C.x, W.C.y, 320);
  G.clock = 0; G.emi = { s: 'calm', left: 0, next: CFG.emission.firstIn }; G.demand = {}; G.dead = false;
}
function newGame() {
  W = new World((Math.random() * 1e9) | 0); resetPlayer(); P.stash = []; P.bld = null; Mutants.spawn(); Stalkers.spawn(); Meta.reset(); Camp.enter(true);
  log('Ты в лагере «Обочина». Подготовься: купи, разложи, проверь. Выход в Зону — ворота справа.');
  log('Обыскивай остовы и тайники (E), хлам продавай Скупщику. Esc — меню и управление.', '#e8c060');
}
// force — сохранить и вне лагеря (автосейв в поле, закрытие вкладки, смерть). Такое сохранение помечается field:
// при загрузке игрок окажется в лагере с тем, что нёс, но заплатит за «вытаскивание» (см. load).
const idxWhere = (a, f) => a.reduce((r, x, i) => (f(x) && r.push(i), r), []);
function save(force) {
  if (!force && (!inCamp() || G.dead)) return;
  try {
    const kb = []; for (let i = 0; i < known.length; i++) kb.push(known[i]);
    localStorage.setItem('zone_save_v2', JSON.stringify({ seed: W.seed, P: { money: P.money, inv: P.inv, equip: P.equip, notes: P.notes, known: P.known,
      sk: P.sk, sp: P.sp, xp: P.xp, lvl: P.lvl, hp: P.hp, rad: P.rad, food: P.food, goal: P.goal, ...Meta.saveFields() }, clock: G.clock, demand: G.demand, events: G.events,
      caches: W.caches, kn: kb.join(''), field: !inCamp() && !G.dead,
      oc: idxWhere(W.conts, c => c.opened), cl: idxWhere(W.corpses.slice(0, W.nGenCorpses), c => c.looted),
      gone: W.seedArts.filter(id => !W.arts.some(a => a.id === id)) }));
  } catch (e) {}
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem('zone_save_v2')); if (!s) return false;
    W = new World(s.seed); resetPlayer(); Object.assign(P, s.P); P.sp = s.P.sp; G.clock = s.clock; G.demand = s.demand || {}; G.events = s.events || [];
    W.caches = s.caches || []; for (let i = 0; i < known.length; i++) known[i] = +s.kn[i] || 0;
    for (const k in CFG.skills) P.sk[k] = P.sk[k] || 0;
    // что уже вскрыто, обыскано и подобрано — не появляется заново (мир строится по сиду, а не хранится)
    for (const i of s.oc || []) if (W.conts[i]) W.conts[i].opened = true;
    for (const i of s.cl || []) if (W.corpses[i] && i < W.nGenCorpses) W.corpses[i].looted = true;
    if (s.gone) { const g = new Set(s.gone); W.arts = W.arts.filter(a => !g.has(a.id)); }
    Mutants.spawn(); Stalkers.spawn(); Meta.afterLoad(); Camp.enter(true); log('Игра загружена.');
    if (s.field) { P.money = Math.floor(P.money * 0.9); P.hp = Math.min(P.hp, CFG.death.hpOnRespawn); log('Связь оборвалась в Зоне. Тебя вытащили в лагерь: −10% денег, ты ранен.', '#e0a060'); }
    return true;
  } catch (e) { return false; }
}

// ---------- смерть ----------
function die() {
  if (G.dead) return; G.dead = true; P.dead = true; G.deadT = 4;
  if (P.insured) { P.insured = false; P.rep -= 1; $('deathtxt').textContent = 'Страховка сработала: тебя вытащили вместе с хабаром.'; $('death').style.display = 'flex'; closePanel(); Snd.hit(); save(true); return; }
  P.rep -= 2;
  const items = P.inv.filter(s => s.art), lostMoney = Math.floor(P.money * CFG.death.moneyLoss);
  const eq = P.equip.filter(Boolean).map(a => ({ id: 'art', n: 1, art: a }));
  const all = items.concat(eq);
  if (all.length || lostMoney) W.caches.push({ x: P.x, y: P.y, items: all, money: lostMoney });
  P.inv = P.inv.filter(s => !s.art); P.equip = P.equip.map(() => null); P.money -= lostMoney;
  $('deathtxt').textContent = all.length || lostMoney ? 'Хабар остался в Зоне. Отметка на карте (M). Навыки и опыт сохранены.' : 'Ты ничего не нёс. Зона равнодушна.';
  $('death').style.display = 'flex'; closePanel(); Snd.hit(); save(true);
}
function respawn() {
  G.dead = false; P.dead = false; $('death').style.display = 'none';
  Camp.enter(true); P.hp = CFG.death.hpOnRespawn; P.fracture = false; P.infect = 0; P.rad = Math.min(P.rad, 30); P.bleed = 0; P.burn = 0; P.stress = 0; P.wasOut = false;
  Mutants.refill(); save();
}

// ---------- действия игрока ----------
const heldNames = ['weapon', 'bolt', 'medkit', 'food', 'antirad', 'lure', 'splint', 'shock'];
function useSel() {
  const h = heldNames[P.sel];
  if (h === 'pistol') shoot(); else if (h === 'bolt') throwBolt();
  else if (invCount(h) > 0) useItem(h);
}
function useItem(id) {
  const u = CFG.items[id].use; if (!u || invCount(id) < 1) return;
  invTake(id, 1); Snd.pick();
  if (u.heal) P.hp = Math.min(100, P.hp + u.heal);
  if (u.stopBleed) P.bleed = 0;
  if (u.food) P.food = Math.min(100, P.food + u.food);
  if (u.rad) P.rad = Math.max(0, Math.min(100, P.rad + u.rad));
  log('Использовано: ' + CFG.items[id].name);
}
function shoot() {
  if (P.cd > 0 || inCamp() && false) return;
  if (invCount('ammo') < 1) { Snd.tick(); P.cd = 0.3; log('Патронов нет.'); return; }
  invTake('ammo', 1); P.cd = CFG.player.fireCd;
  const moving = Math.hypot(keys.mx || 0, keys.my || 0) > 0;
  const a = P.ang + (Math.random() - 0.5) * CFG.player.spread * (P.sneak ? 0.6 : 1) * (moving ? 1.6 : 1);
  const dx = Math.cos(a), dy = Math.sin(a); let best = null, bt = 520;
  for (const m of Mutants.list) {
    const rx = m.x - P.x, ry = m.y - P.y, t = rx * dx + ry * dy; if (t < 0 || t > bt) continue;
    if (Math.abs(rx * dy - ry * dx) < m.c.r + 3) { best = m; bt = t; }
  }
  tracers.push({ x1: P.x, y1: P.y, x2: P.x + dx * bt, y2: P.y + dy * bt, t: 0.07 });
  if (best) { best.hurt(CFG.player.pistolDmg, P); for (let i = 0; i < 5; i++) parts.push({ x: best.x, y: best.y, vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 80, life: 0.5, col: '#7a1a1a' }); }
  Snd.shot(); G.shake = 0.12; Mutants.hear(P.x, P.y, CFG.player.noise.shot);
}
function throwBolt() {
  if (P.cd > 0 || invCount('bolt') < 1) return;
  invTake('bolt', 1); P.cd = 0.35;
  const d = Math.min(CFG.player.boltRange, Math.hypot(mouse.x + cam.x - P.x, mouse.y + cam.y - P.y));
  bolts.push({ x: P.x, y: P.y, sx: P.x, sy: P.y, tx: P.x + Math.cos(P.ang) * d, ty: P.y + Math.sin(P.ang) * d, t: 0, dur: 0.2 + d / 900 });
  Snd.tick();
}
function updateBolts(dt) {
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i]; b.t += dt; const k = Math.min(1, b.t / b.dur); b.x = b.sx + (b.tx - b.sx) * k; b.y = b.sy + (b.ty - b.sy) * k;
    if (k < 1) continue;
    bolts.splice(i, 1); Snd.clink(); Mutants.hear(b.tx, b.ty, CFG.player.noise.bolt, 'metal');
    const hit = W.boltHit(b.tx, b.ty);
    if (hit) {
      log(CFG.anoms[hit.a.type].react + (hit.first ? ' Отмечено: ' + CFG.anoms[hit.a.type].name + '.' : ''), '#9ab8d8');
      if (hit.first) { addXp(6); Meta.onDiscover(); }
    } else W.loot.push({ x: b.tx, y: b.ty, id: 'bolt', n: 1 });
  }
}

// ---------- взаимодействие ----------
function findNear() {
  let best = null, bd = 9999;
  const c = (o, d, lim, label, fn) => { if (d < lim && d < bd) { bd = d; best = { label, fn, o }; } };
  for (const l of W.loot) if (l.id !== 'bolt') c(l, Math.hypot(l.x - P.x, l.y - P.y), 28, 'Подобрать: ' + CFG.items[l.id].name, () => { invAdd(l.id, l.n); W.loot.splice(W.loot.indexOf(l), 1); Snd.pick(); });
  for (const a of W.arts) c(a, Math.hypot(a.x - P.x, a.y - P.y), 28, 'Взять: ' + (P.known[a.type] ? CFG.arts[a.type].name : 'непонятную штуку'), () => takeArt(a));
  for (const s of W.corpses) if (!s.looted) c(s, Math.hypot(s.x - P.x, s.y - P.y), 32, 'Обыскать тело сталкера', () => lootCorpse(s));
  for (const s of W.caches) c(s, Math.hypot(s.x - P.x, s.y - P.y), 34, 'Забрать своё', () => lootCache(s));
  for (const s of W.conts) if (!s.opened) c(s, Math.hypot(s.x - P.x, s.y - P.y), s.kind === 'house' ? 62 : 36, s.kind === 'stash' ? 'Открыть тайник' : s.kind === 'house' ? 'Обыскать дом' : s.kind === 'lab' ? 'Вскрыть шкаф лаборатории' : 'Обыскать остов', () => openCont(s));
  for (const r of W.rest) c(r, Math.hypot(r.x - P.x, r.y - P.y), 62, 'Сделать привал (отдых у костра)', () => doRest(r));
  for (const m of Mutants.corpses) if (m.meat > 0) c(m, Math.hypot(m.x - P.x, m.y - P.y), 32, 'Разделать тушу (' + CFG.mut[m.sp].name + ')', () => butcher(m));
  for (const k in CFG.vendors) { const p = npcPos(k); c(k, Math.hypot(p.x - P.x, p.y - P.y), 52, 'Говорить: ' + CFG.vendors[k].name, () => openTrade(k)); }
  c('goal', Math.hypot(CFG.world.goal.x - P.x, CFG.world.goal.y - P.y), 70, 'Осмотреть странный объект', reachGoal);
  c('gate', Math.hypot(W.C.x - P.x, W.C.y - P.y), 80, 'Вернуться в лагерь', () => enterCamp());
  Meta.nearExtra(c);
  return best;
}
const npcPos = k => Camp.vendorPos(k);
function takeArt(a) {
  invAdd('art', 1, a.type); W.arts.splice(W.arts.indexOf(a), 1); Snd.pick();
  log(P.known[a.type] ? 'Взят артефакт: ' + CFG.arts[a.type].name : 'Взят неопознанный артефакт. Учёный скажет, что это.', '#e8c060');
}
function lootCorpse(s) {
  s.looted = true; const got = [];
  for (const [id, n] of s.items) { if (id === 'money') { P.money += n; got.push(n + ' ₽'); } else { invAdd(id, n); got.push(CFG.items[id].name + ' ×' + n); } }
  if (s.art) { invAdd('art', 1, s.art); got.push('артефакт'); }
  log('Найдено: ' + (got.join(', ') || 'пусто'), '#c8c090');
  if (s.note) { P.notes.push({ txt: s.note.txt, sold: false }); log('Записка: «' + s.note.txt + '»', '#b8b298'); if (s.note.anom) s.note.anom.known = true; addXp(5); }
  Snd.pick();
}
function openCont(c) {
  c.opened = true; const got = [];
  for (const [id, n] of c.loot) { if (id === 'money') { P.money += n; got.push(n + ' ₽'); } else { invAdd(id, n); got.push(CFG.items[id].name + ' ×' + n); } }
  log('Найдено: ' + got.join(', '), '#c8c090'); Snd.pick(); Mutants.hear(P.x, P.y, 90);
  if (c.kind === 'lab') Meta.onLab();
}
function lootCache(s) { for (const it of s.items) invAdd(it.id, it.n, it.art); P.money += s.money; W.caches.splice(W.caches.indexOf(s), 1); log('Ты вернул своё. Повезло.', '#e8c060'); Snd.pick(); }
function butcher(m) {
  const n = Math.min(m.meat, 1 + Math.floor(Math.random() * (1 + P.sk.butcher * 0.5) + 0.5)); m.meat -= n;
  invAdd('meat', n); const part = CFG.mut[m.sp].part; if (Math.random() < 0.35 + P.sk.butcher * 0.12) { invAdd(part, 1); log('Снят трофей: ' + CFG.items[part].name); }
  Snd.pick(); m.meat = 0; Mutants.corpses.splice(Mutants.corpses.indexOf(m), 1);
}
function reachGoal() {
  if (!P.goal) { P.goal = true; addXp(200); }
  log('Странный объект не реагирует на тебя. Ты вдруг понимаешь, что тебя тут никто не ждал. Конец первой главы (прототип).', '#f0d080');
}

// ---------- выброс ----------
function updateEmission(dt) {
  const e = G.emi, E = CFG.emission;
  if (e.s === 'calm') { e.next -= dt; if (e.next <= 0) { e.s = 'warn'; e.left = E.warn; Snd.siren(true); log('СИРЕНА. Выброс через ' + E.warn + ' сек. В укрытие — лагерь или бункер!', '#e06060'); } }
  else if (e.s === 'warn') { e.left -= dt; if (e.left <= 0) { e.s = 'blast'; e.left = E.dur; Snd.boom(); } }
  else if (e.s === 'blast') {
    e.left -= dt; G.shake = Math.max(G.shake, 0.06);
    if (!isSheltered()) { P.hurt(E.dps * dt * (1 - P.sk.resist * 0.05), 'emi'); P.stress = Math.min(100, P.stress + 6 * dt); }
    else P.stress = Math.min(100, P.stress + 1.5 * dt);
    if (e.left <= 0) {
      e.s = 'calm'; e.next = E.gapMin + Math.random() * (E.gapMax - E.gapMin); Snd.siren(false);
      W.shake(); Mutants.migrate(); G.fogBoost = 0.4;
      for (const k in CFG.arts) G.demand[k] = 0.75 + Math.random() * 0.6;
      log('Выброс окончился. Зона стала другой: старые отметки ненадёжны.', '#e0c070'); Meta.onEmission();
    }
  }
}

// ---------- обновление ----------
function update(dt) {
  G.t += dt; G.clock += dt;
  G.hour = (CFG.time.start + G.clock * 24 / CFG.time.dayLen) % 24;
  const h = G.hour; G.night = h >= 22 || h < 5 ? 1 : h >= 20 ? (h - 20) / 2 : h < 7 ? (7 - h) / 2 : 0;
  updateWeather(dt);
  G.hurtFlash = Math.max(0, G.hurtFlash - dt); G.shake = Math.max(0, G.shake - dt * 0.6);
  for (const k in G.demand) G.demand[k] += (1 - G.demand[k]) * dt * 0.002;
  if (G.dead) { G.deadT -= dt; if (G.deadT <= 0) respawn(); return; }

  const camp = inCamp();
  // движение
  const mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  const my = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  keys.mx = mx; keys.my = my; const moving = mx || my;
  P.sneak = !!(keys.ControlLeft || keys.KeyC);
  P.running = !!(keys.ShiftLeft && !P.sneak && moving && P.stam > 0 && !P.fracture);
  const over = Math.max(0, weight() - carryCap()) / carryCap();
  let sp = CFG.player.speed * (P.running ? CFG.player.run : 1) * (P.sneak ? CFG.player.sneak : 1) * P.slow * (1 - Math.min(0.65, over * 1.2));
  if (P.food <= 0) sp *= 0.8;
  if (P.fracture) sp *= 0.6;
  if (moving) { const l = Math.hypot(mx, my); P.x += mx / l * sp * dt; P.y += my / l * sp * dt; }
  Camp.grid().query(P.x, P.y, P.r + 40, o => {
    const ox = P.x - o.x, oy = P.y - o.y, od = Math.hypot(ox, oy), m = o.r + P.r;
    if (od < m && od > 0) { P.x = o.x + ox / od * m; P.y = o.y + oy / od * m; }
  });
  if (G.scene !== 'zone') Camp.clampP(); else { P.x = U.clamp(P.x, 15, W.S - 15); P.y = U.clamp(P.y, 15, W.S - 15); }
  P.ang = Math.atan2(mouse.y + cam.y - P.y, mouse.x + cam.x - P.x);
  // выносливость
  if (P.running) P.stam -= CFG.player.drain * dt * (1 + over);
  else P.stam = Math.min(maxStam(), P.stam + (CFG.player.regen * (1 + 0.15 * P.sk.endurance) + fx('stamRegen')) * dt * (moving ? 0.6 : 1) * (P.food < 20 ? 0.6 : 1));
  if (P.stam < 0) P.stam = 0;
  // шум
  P.noiseT -= dt;
  if (moving && P.noiseT <= 0 && G.scene === 'zone') {
    P.noiseT = 0.5; const n = CFG.player.noise, r = (P.running ? n.run : P.sneak ? n.sneak : n.walk) * Math.pow(0.85, P.sk.stealth);
    Mutants.hear(P.x, P.y, r * (1 + (P.equip.includes('moonlight') ? 1.2 : 0)) * (fx('repel') ? 0.7 : 1));
  }
  // шаги
  if (moving) { G.step += sp * dt; if (G.step > 26) { G.step = 0; Snd.step(P.running ? 2 : P.sneak ? 0 : 1); } }
  // лунный свет привлекает
  if (P.equip.includes('moonlight') && Math.random() < dt * 0.3) Mutants.hear(P.x, P.y, 400);
  // оружие
  P.cd -= dt; P.recoil = Math.max(0, (P.recoil || 0) - dt * 7); if (mouse.l && !G.ui && G.scene === 'zone') useSel();
  if (G.scene !== 'zone') return campTick(dt);
  // голод, кровь, регенерация, радиация
  P.food = Math.max(0, P.food - CFG.player.foodRate * dt * (P.running ? 1.5 : 1));
  if (P.food <= 0) P.hp -= 0.5 * dt;
  if (P.bleed > 0) { P.bleed -= dt; P.hp -= 1.5 * dt; }
  else if (P.food > 20 && P.rad < 40) P.hp = Math.min(100, P.hp + (0.4 + fx('hpRegen')) * dt);
  else if (fx('hpRegen')) P.hp = Math.min(100, P.hp + fx('hpRegen') * 0.5 * dt);
  let rad = W.radAt(P.x, P.y);
  for (const s of P.inv) if (s.art) rad += CFG.arts[s.art].rad * 0.5;
  for (const a of P.equip) if (a) rad += CFG.arts[a].rad * 0.5;
  rad *= 1 - radRes(); P.geigerRate = rad;
  if (rad > 0) P.rad = Math.min(100, P.rad + rad * dt); else if (camp) P.rad = Math.max(0, P.rad - 1.5 * dt); else P.rad = Math.max(0, P.rad - CFG.player.radDecay * 0.1 * dt);
  if (P.rad > 60) P.hp -= (P.rad - 60) / 40 * dt;
  if (P.rad >= 100) P.hp -= 3 * dt;
  if (P.hp <= 0) return die();
  // стресс
  let ds = 0;
  if (!camp) { ds += G.night * 0.4 + G.fog * 0.25; if (P.hp < 30) ds += 0.4; } else ds -= 4;
  for (const s of W.corpses) if (Math.hypot(s.x - P.x, s.y - P.y) < 80) { ds += 1; break; }
  P.stress = U.clamp(P.stress + ds * (ds > 0 ? 1 - 0.05 * P.sk.resist : 1) * dt - (camp ? 0 : 0.08 * dt), 0, 100);
  // фон: птицы, сверчки, костёр, сердце
  G.amb -= dt;
  if (G.amb <= 0) {
    if (G.night > 0.5 && G.rain < 0.3) { G.amb = 0.3 + Math.random() * 0.6; Snd.cricket(); }
    else if (G.night < 0.4 && G.rain < 0.3 && G.wx !== 'fog') { G.amb = 3 + Math.random() * 6; Snd.chirp(); }
    else G.amb = 2;
  }
  if (camp && Math.random() < dt * 6) Snd.crackle();
  G.beat -= dt; if (G.beat <= 0 && (P.hp < 35 || P.stress > 75)) { G.beat = 0.9; Snd.beat(); }
  // мир
  W.update(dt, [P, ...Mutants.list, ...Stalkers.list]);
  if (W.inWater(P.x, P.y)) { P.slow = Math.min(P.slow, 0.55); if (P.burn > 0) { P.burn = 0; log('Ты потушил себя в воде.', '#9ab8d8'); } }
  Mutants.update(dt); Stalkers.update(dt); updateBolts(dt); updateEmission(dt); Meta.update(dt);
  reveal(P.x, P.y, 130 * (1 + 0.25 * P.sk.mapping));
  for (const b of W.bunkers) if (!b.known && Math.hypot(b.x - P.x, b.y - P.y) < 150) { b.known = true; log('Найден бункер — укрытие от выброса.', '#a8c890'); }
  for (const r of W.roads) if (!r.known && Math.hypot(r.x - P.x, r.y - P.y) < 260) { r.known = true; addXp(15); log('Пепельный тракт: выгоревшие остовы в ряд. В них ещё что-то осталось, но днём в золе кто-то спит.', '#d0a070'); }
  for (const l of W.labs) if (!l.known && Math.hypot(l.x - P.x, l.y - P.y) < 260) { l.known = true; addXp(20); log('Заброшенная лаборатория. Ограда, фон и «пружины» на подходах. Шкафы внутри не тронуты.', '#9ab8d8'); }
  // автоподбор болтов
  for (let i = W.loot.length - 1; i >= 0; i--) { const l = W.loot[i]; if (l.id === 'bolt' && Math.hypot(l.x - P.x, l.y - P.y) < 16) { invAdd('bolt', 1); W.loot.splice(i, 1); Snd.clink(); } }
  // вход/выход из Зоны
  if (!camp) P.wasOut = true;
  else if (P.wasOut) { P.wasOut = false; Mutants.refill(); save(); log('Ты у периметра блокпоста. Вход в лагерь — на E у ворот.', '#a8c890'); }
  else if (Math.floor(G.t) % 15 === 0 && Math.floor(G.t - dt) % 15 !== 0) save();
  if (!camp && Math.floor(G.t) % 30 === 0 && Math.floor(G.t - dt) % 30 !== 0) save(true);
  G.near = G.ui ? null : findNear();
  // звук
  let hd = 999, ha = null; for (const a of W.anoms) { const d = Math.hypot(a.x - P.x, a.y - P.y); if (d < hd) { hd = d; ha = a; } }
  if (ha && hd < 240) { const f = { funnel: 55, electra: 110 + (ha.state ? 120 * ha.t / CFG.anoms.electra.charge : 0), fluff: 190, slime: 80, plesh: 45, grinder: 140, spring: 95 + (ha.state ? 90 * ha.t / CFG.anoms.spring.charge : 0), magnet: 70, smolder: 65 + (ha.state ? 60 * ha.t / CFG.anoms.smolder.charge : 0) }[ha.type]; Snd.setHum(f, 0.05 * (1 - hd / 240)); } else Snd.setHum(60, 0);
  if (Math.random() < P.geigerRate * dt * 8) Snd.geiger();
  Snd.siren(G.emi.s === 'warn' || G.emi.s === 'blast' && false);
  for (let i = tracers.length - 1; i >= 0; i--) if ((tracers[i].t -= dt) <= 0) tracers.splice(i, 1);
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.x += p.vx * dt; p.y += p.vy * dt; if ((p.life -= dt) <= 0) parts.splice(i, 1); }
}

// ---------- погода и время суток ----------
const WX = {
  clear:  { name: '☀ Ясно',      fog: 0.12, rain: 0,   cloud: 0.05, wind: 0.2 },
  cloudy: { name: '☁ Пасмурно',  fog: 0.25, rain: 0,   cloud: 0.5,  wind: 0.5 },
  fog:    { name: '🌫 Туман',    fog: 0.85, rain: 0,   cloud: 0.4,  wind: 0.1 },
  rain:   { name: '🌧 Дождь',    fog: 0.4,  rain: 0.7, cloud: 0.75, wind: 0.6 },
  storm:  { name: '⛈ Гроза',    fog: 0.5,  rain: 1,   cloud: 0.95, wind: 1 },
};
const WXNEXT = { clear: [['cloudy', 5], ['fog', 2], ['clear', 1]], cloudy: [['clear', 3], ['rain', 3], ['fog', 2]], fog: [['cloudy', 3], ['clear', 2], ['rain', 1]],
  rain: [['storm', 2], ['cloudy', 4], ['fog', 1]], storm: [['rain', 4], ['cloudy', 2]] };
G.wx = 'cloudy'; G.wxT = 90; G.rain = 0; G.cloud = 0.3; G.fogBoost = 0; G.flash = 0; G.lt = 6; G.wind = 0.4; G.amb = 2; G.beat = 0; G.step = 0;
function updateWeather(dt) {
  G.wxT -= dt;
  if (G.wxT <= 0) { const o = WXNEXT[G.wx]; G.wx = U.wpick(o.map(x => x[0]), o.map(x => x[1])); G.wxT = 70 + Math.random() * 100; log('Погода: ' + WX[G.wx].name.slice(2), '#8aa0b0'); }
  const w = WX[G.wx], k = Math.min(1, dt * 0.15);
  G.fogBoost = Math.max(0, G.fogBoost - dt * 0.004);
  G.rain += (w.rain - G.rain) * k; G.cloud += (w.cloud - G.cloud) * k; G.wind += (w.wind - G.wind) * k;
  G.fog += (U.clamp(w.fog + G.night * 0.1 + G.fogBoost, 0, 1) - G.fog) * k;
  Snd.setWeather(G.rain, G.wind);
  G.flash = Math.max(0, G.flash - dt * 2.5);
  if (G.wx === 'storm') { G.lt -= dt; if (G.lt <= 0) { G.lt = 4 + Math.random() * 10; lightning(); } }
}
function lightning() {
  G.flash = 1; const a = Math.random() * 6.28, d = 100 + Math.random() * 500, x = P.x + Math.cos(a) * d, y = P.y + Math.sin(a) * d;
  Snd.thunder(d / 600);
  for (const an of W.anoms) if (an.type === 'electra' && Math.hypot(an.x - x, an.y - y) < 300 && an.state === 0) { an.state = 1; an.t = CFG.anoms.electra.charge - 0.3; }
}
const SKY = [[0, 10, 15, 45, 0.5], [5, 30, 30, 70, 0.4], [6.5, 255, 140, 80, 0.16], [8, 255, 220, 160, 0], [17, 255, 220, 160, 0], [19, 255, 120, 60, 0.2], [20.5, 90, 40, 110, 0.32], [22, 10, 15, 45, 0.5], [24, 10, 15, 45, 0.5]];
function skyTint(h) {
  for (let i = 0; i < SKY.length - 1; i++) if (h <= SKY[i + 1][0]) { const a = SKY[i], b = SKY[i + 1], t = (h - a[0]) / (b[0] - a[0]); return [1, 2, 3, 4].map(j => U.lerp(a[j], b[j], t)); }
  return [0, 0, 0, 0];
}

// ---------- отрисовка ----------
let groundPat = null;
function circle(x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fillStyle = fill; ctx.fill(); }
function px(x, y, col, s = 2) { ctx.fillStyle = col; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, s, s); }
function shadow(x, y, w) { ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(x, y + 1, w, w * 0.4, 0, 0, 6.28); ctx.fill(); }
function drawGroundFx(x0, y0, x1, y1) {
  const CL = W.CELL;
  for (let cy = Math.max(0, Math.floor(y0 / CL)); cy <= Math.min(W.N - 1, Math.floor(y1 / CL)); cy++) for (let cx = Math.max(0, Math.floor(x0 / CL)); cx <= Math.min(W.N - 1, Math.floor(x1 / CL)); cx++) {
    if (BIOME_KEYS[W.bg[cy * W.N + cx]] !== 'town') continue;
    const wx = cx * CL, wy = cy * CL;
    if (cy % 3 === 0) { ctx.fillStyle = '#2b2c2d'; ctx.fillRect(wx, wy + 50, CL, 60); ctx.fillStyle = '#5a5a3a'; for (let k = 0; k < CL; k += 24) ctx.fillRect(wx + k, wy + 79, 12, 2); }
    if (cx % 3 === 0) { ctx.fillStyle = '#2b2c2d'; ctx.fillRect(wx + 50, wy, 60, CL); ctx.fillStyle = '#5a5a3a'; for (let k = 0; k < CL; k += 24) ctx.fillRect(wx + 79, wy + k, 2, 12); }
  }
  for (const w of W.water) if (w.x + w.rx > x0 && w.x - w.rx < x1 && w.y + w.ry > y0 && w.y - w.ry < y1) {
    ctx.fillStyle = '#16302f'; ctx.beginPath(); ctx.ellipse(w.x, w.y, w.rx + 5, w.ry + 4, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#1f4646'; ctx.beginPath(); ctx.ellipse(w.x, w.y, w.rx, w.ry, 0, 0, 6.28); ctx.fill();
    ctx.strokeStyle = 'rgba(160,210,210,.25)'; ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) { const ph = (G.t * 0.4 + i * 0.25) % 1; ctx.beginPath(); ctx.ellipse(w.x + Math.sin(i * 2.1) * w.rx * 0.4, w.y + Math.cos(i * 1.7) * w.ry * 0.3, w.rx * 0.25 * ph + 1, w.ry * 0.2 * ph + 1, 0, 0, 6.28); ctx.stroke(); }
  }
  for (const r of W.rest) if (Math.abs(r.x - P.x) < VW && Math.abs(r.y - P.y) < VH) {
    Spr.draw(ctx, 'tent', r.x - 18, r.y - 8, false, null, 1.4); Spr.draw(ctx, 'fire_l', r.x + 12, r.y + 2, false, null, 1.2 + 0.25 * Math.sin(G.t * 9));
  }
}
function doRest(r) {
  if (G.emi.s !== 'calm') return log('Не время отдыхать.');
  if (P.food < 8) return log('Слишком голоден. Сначала поешь.');
  P.stress = Math.max(0, P.stress - 40); P.stam = maxStam(); P.hp = Math.min(100, P.hp + 20); P.food = Math.max(0, P.food - 6); P.bleed = 0;
  G.clock += 25 / 60 * CFG.time.dayLen / 24; log('Привал у чужого костра. Отдохнул, время ушло.', '#a8c890'); Snd.pick(); Mutants.hear(r.x, r.y, 60);
}
function enterCamp() { Camp.enter(false); }
function draw() {
  if (G.scene === 'interior') return drawInterior();
  if (G.scene === 'camp') return drawCampScene();
  ctx.imageSmoothingEnabled = false;
  if (!groundPat) groundPat = ctx.createPattern(Spr.ground, 'repeat');
  const sh = G.shake;
  cam.x = P.x - VW / 2 + (Math.random() - 0.5) * sh * 30; cam.y = P.y - VH / 2 + (Math.random() - 0.5) * sh * 30;
  ctx.save(); ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
  const x0 = cam.x, y0 = cam.y, x1 = cam.x + VW, y1 = cam.y + VH;
  ctx.fillStyle = groundPat; ctx.fillRect(x0 - 2, y0 - 2, VW + 4, VH + 4);
  for (let gx = Math.floor(x0 / 120) * 120 - 120; gx < x1 + 120; gx += 120) for (let gy = Math.floor(y0 / 120) * 120 - 120; gy < y1 + 120; gy += 120) {
    const hh = U.hash(gx / 120, gy / 120), s = 260 + hh * 140, bi = BIOME_KEYS.indexOf(W.biomeAt(gx + 60, gy + 60)); ctx.drawImage(Spr.patch[bi], gx + 60 - s / 2, gy + 60 - s / 2, s, s);
  }
  drawGroundFx(x0, y0, x1, y1);
  for (const z of W.rad) if (z.x + z.r > x0 && z.x - z.r < x1 && z.y + z.r > y0 && z.y - z.r < y1) {
    const g = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r); g.addColorStop(0, 'rgba(160,170,40,.12)'); g.addColorStop(1, 'rgba(160,170,40,0)');
    ctx.fillStyle = g; ctx.fillRect(z.x - z.r, z.y - z.r, z.r * 2, z.r * 2);
  }
  drawCamp();
  for (const b of W.bunkers) if (b.known || Math.hypot(b.x - P.x, b.y - P.y) < 200) {
    Spr.draw(ctx, 'bunker', b.x, b.y, false, null, 1.5);
    ctx.strokeStyle = '#7a8a6a'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(b.x, b.y, CFG.emission.shelterR, 0, 6.28); ctx.stroke(); ctx.setLineDash([]);
  }
  for (const a of W.anoms) if (a.x + a.r * 2 > x0 && a.x - a.r * 2 < x1 && a.y + a.r * 2 > y0 && a.y - a.r * 2 < y1) drawAnom(a);
  const g = CFG.world.goal; if (g.x > x0 - 100 && g.x < x1 + 100 && g.y > y0 - 100 && g.y < y1 + 100) {
    const pl = 0.5 + 0.5 * Math.sin(G.t * 1.3); ctx.strokeStyle = `rgba(230,200,90,${0.2 + pl * 0.3})`; ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.arc(g.x, g.y, 14 * i + pl * 6, 0, 6.28); ctx.stroke(); } px(g.x, g.y, '#e0c050', 12);
  }
  for (const l of W.loot) px(l.x, l.y, l.id === 'bolt' ? '#a8a8a8' : '#d8d0a0', 4);
  for (const a of W.arts) { const d = Math.hypot(a.x - P.x, a.y - P.y), lim = hintR(); if (d < lim) Spr.draw(ctx, 'star', a.x, a.y, false, (0.4 + 0.6 * Math.abs(Math.sin(G.t * 3 + a.x))) * (1 - d / lim)); }
  for (const s of W.corpses) Spr.draw(ctx, s.looted ? 'corpse_l' : 'corpse', s.x, s.y);
  for (const s of W.caches) { ctx.strokeStyle = '#e06060'; ctx.lineWidth = 2; ctx.strokeRect(s.x - 9, s.y - 9, 18, 18); }
  for (const c of W.conts) {
    if (c.kind === 'stash') Spr.draw(ctx, c.opened ? 'crate_o' : 'crate', c.x, c.y, false, null, 1.5);
    if (!c.opened && Math.hypot(c.x - P.x, c.y - P.y) < 150) Spr.draw(ctx, 'star', c.x, c.y - 16, false, 0.4 + 0.5 * Math.abs(Math.sin(G.t * 4 + c.x)));
  }
  for (const c of Mutants.corpses) Spr.draw(ctx, c.meat > 0 ? 'meat' : 'corpse_l', c.x, c.y);
  for (const e of Mutants.embers) if (e.x > x0 - 20 && e.x < x1 + 20 && e.y > y0 - 20 && e.y < y1 + 20) { ctx.globalAlpha = Math.min(1, e.t / 2) * (0.7 + 0.3 * Math.sin(G.t * 12 + e.x)); px(e.x, e.y, '#ff8a30', 4); px(e.x + 2, e.y - 2, '#ffd070', 2); ctx.globalAlpha = 1; }
  const dl = [];
  const decor = [];
  W.dg.query((x0 + x1) / 2, (y0 + y1) / 2, Math.max(VW, VH) / 2 + 120, o => { if (o.x > x0 - 90 && o.x < x1 + 90 && o.y > y0 - 90 && o.y < y1 + 90) { if (o.decor) decor.push(o); else dl.push({ y: o.ys, o }); } });
  for (const o of decor) Spr.draw(ctx, o.spr, o.x, o.y, o.flip, null, o.sc);
  for (const m of Mutants.list) if (m.x > x0 - 40 && m.x < x1 + 40 && m.y > y0 - 40 && m.y < y1 + 40) dl.push({ y: m.y + 6, m });
  for (const s of Stalkers.list) if (s.x > x0 - 40 && s.x < x1 + 40 && s.y > y0 - 40 && s.y < y1 + 40) dl.push({ y: s.y + 8, s });
  if (!G.dead) dl.push({ y: P.y + 8, p: true });
  dl.sort((a, b) => a.y - b.y);
  for (const e of dl) {
    if (e.o) { const o = e.o; Spr.draw(ctx, o.spr, o.x, o.y, o.flip, null, o.sc); }
    else if (e.m) drawMutant(e.m);
    else if (e.s) drawStalker(e.s);
    else {
      const mv = keys.mx || keys.my, bob = mv ? (Math.floor(G.t * 10) % 2 ? -1 : 0) : 0;
      shadow(P.x, P.y + 10, 8); Spr.draw(ctx, P.sneak ? 'player_s' : 'player', P.x, P.y + bob - 2, Math.cos(P.ang) < 0);
      if (P.sel === 0) Gun.draw(ctx, P.x, P.y + 2, P.ang, P.weapon, P.recoil || 0);
    }
  }
  for (const b of bolts) px(b.x, b.y, '#d0d0d0', 3);
  Meta.drawWorld();
  for (const t of tracers) { ctx.strokeStyle = 'rgba(255,230,150,.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke(); }
  for (const p of parts) { ctx.globalAlpha = Math.max(0, p.life * 2); px(p.x, p.y, p.col); } ctx.globalAlpha = 1;
  for (let i = 0; i < 9; i++) {
    const fx0 = ((i * 613 + G.t * 6 * (1 + i % 3 * 0.3)) % (VW + 600)) - 300 + cam.x, fy0 = cam.y + ((i * 397) % VH);
    const gg = ctx.createRadialGradient(fx0, fy0, 0, fx0, fy0, 260); gg.addColorStop(0, `rgba(160,170,160,${G.fog * 0.17})`); gg.addColorStop(1, 'rgba(160,170,160,0)');
    ctx.fillStyle = gg; ctx.fillRect(fx0 - 260, fy0 - 260, 520, 520);
  }
  ctx.restore();
  drawOverlays();
}
function drawOverlays() {
  drawLight();
  const sk = skyTint(G.hour); if (sk[3] > 0.01 && G.scene !== 'interior') { ctx.fillStyle = `rgba(${sk[0] | 0},${sk[1] | 0},${sk[2] | 0},${sk[3] * (1 - G.cloud * 0.4)})`; ctx.fillRect(0, 0, VW, VH); }
  if (G.rain > 0.02 && G.scene !== 'interior') {
    ctx.fillStyle = `rgba(40,60,85,${G.rain * 0.14})`; ctx.fillRect(0, 0, VW, VH);
    ctx.strokeStyle = 'rgba(175,195,225,.4)'; ctx.lineWidth = 1; ctx.beginPath();
    const n = Math.floor(G.rain * 170), sl = G.wx === 'storm' ? 8 : 4;
    for (let i = 0; i < n; i++) { const x = ((i * 211.7 + G.t * 90) % (VW + 100)) - 50, y = ((i * 97.3 + G.t * (650 + i % 5 * 90)) % (VH + 40)) - 20; ctx.moveTo(x, y); ctx.lineTo(x - sl, y + 13); }
    ctx.stroke();
  }
  if (G.flash > 0.01 && G.scene !== 'interior') { ctx.fillStyle = `rgba(215,225,255,${G.flash * 0.55})`; ctx.fillRect(0, 0, VW, VH); }
  const e = G.emi;
  if (e.s === 'warn') { ctx.fillStyle = `rgba(160,20,10,${0.08 + 0.07 * Math.sin(G.t * 5)})`; ctx.fillRect(0, 0, VW, VH); }
  else if (e.s === 'blast') { ctx.fillStyle = `rgba(200,40,20,${0.25 + 0.15 * Math.sin(G.t * 12)})`; ctx.fillRect(0, 0, VW, VH); if (Math.random() < 0.06) { ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(0, 0, VW, VH); } }
  if (P.stress > 40 || G.hurtFlash > 0 || P.rad > 60) {
    const a = Math.max((P.stress - 40) / 100, G.hurtFlash, (P.rad - 60) / 80);
    const vg = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.3, VW / 2, VH / 2, VH * 0.8); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, G.hurtFlash > 0 ? `rgba(160,0,0,${a})` : `rgba(40,0,50,${a * 1.2})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, VW, VH);
  }
  if (P.stress > 65) {
    const seed = Math.floor(G.t * 2); ctx.fillStyle = 'rgba(0,0,0,.7)';
    for (let i = 0; i < 2; i++) { const a = U.hash(seed, i) * 6.28, d = 130 + U.hash(i, seed) * 120, px2 = VW / 2 + Math.cos(a) * d, py = VH / 2 + Math.sin(a) * d; if ((G.t * 2) % 1 < 0.6) { ctx.beginPath(); ctx.ellipse(px2, py, 8, 13, a, 0, 6.28); ctx.fill(); } }
  }
}
function drawLight() {
  lc.globalCompositeOperation = 'source-over'; lc.clearRect(0, 0, VW, VH);
  const dark = G.scene === 'interior' ? 0.42 : Math.min(0.95, 0.2 + 0.65 * G.night + G.cloud * 0.16 + G.fog * 0.1);
  lc.fillStyle = `rgba(4,6,8,${dark})`; lc.fillRect(0, 0, VW, VH);
  lc.globalCompositeOperation = 'destination-out';
  const vis = (U.lerp(CFG.player.vision, CFG.player.visionNight, G.night) + fx('sight')) * (1 - G.fog * 0.28) * (1 - G.rain * 0.1) * (P.sneak ? 0.95 : 1) * (G.scene === 'zone' && W.biomeAt(P.x, P.y) === 'forest' ? 0.82 : 1);
  const hole = (x, y, r, a) => { const g = lc.createRadialGradient(x, y, r * 0.2, x, y, r); g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)'); lc.fillStyle = g; lc.fillRect(x - r, y - r, r * 2, r * 2); };
  hole(P.x - cam.x, P.y - cam.y, vis, 1);
  if (G.scene !== 'zone') { const fl = 0.85 + 0.15 * Math.sin(G.t * 9); for (const l of Camp.curLights()) hole(l.x - cam.x, l.y - cam.y, l.r, Math.min(1, l.a * fl)); }
  else {
    hole(W.C.x - cam.x, W.C.y - cam.y, 260, 0.85 * (0.85 + 0.15 * Math.sin(G.t * 9)));
    for (const r of W.rest) if (Math.abs(r.x - P.x) < VW && Math.abs(r.y - P.y) < VH) hole(r.x - cam.x, r.y - cam.y, 130, 0.65);
  }
  ctx.drawImage(lc.canvas, 0, 0);
}
function drawCamp() {
  const C = W.C; if (C.x + 300 < cam.x || C.x - 300 > cam.x + VW || C.y + 300 < cam.y || C.y - 300 > cam.y + VH) return;
  ctx.globalAlpha = 0.55; circle(C.x, C.y, C.r, '#3a3626'); ctx.globalAlpha = 1;
  ctx.strokeStyle = '#4a4634'; ctx.lineWidth = 2; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.arc(C.x, C.y, C.r, 0, 6.28); ctx.stroke(); ctx.setLineDash([]);
  [[-110, -60], [100, -90], [-30, 120]].forEach(([dx, dy]) => Spr.draw(ctx, 'tent', C.x + dx, C.y + dy, false, null, 2));
  const f = Math.floor(G.t * 8) % 3;
  px(C.x - 6, C.y + 2, '#3a2010', 12); px(C.x, C.y - 2 - f, '#e08a30', 8); px(C.x - 2, C.y - 6 - f, '#f0b040', 4); px(C.x + 1, C.y - 9 - f * 2, '#ffd870', 2);
  for (const k in CFG.vendors) {
    const p = npcPos(k), v = CFG.vendors[k]; shadow(p.x, p.y + 10, 8); Spr.draw(ctx, 'npc_' + k, p.x, p.y - 2, Math.cos(G.t * 0.3 + p.x) < 0);
    ctx.font = 'bold 11px Consolas'; ctx.textAlign = 'center'; ctx.fillStyle = '#c9c2a8'; ctx.fillText(v.name.split('«')[0].trim(), p.x, p.y - 22);
  }
}
function drawAnom(a) {
  const c = CFG.anoms[a.type], d = Math.hypot(a.x - P.x, a.y - P.y), vis = a.revealed > 0 ? 1 : a.known ? 0.6 : 0;
  const h = U.clamp(1 - (d - a.r) / hintR(), 0, 1), ah = Math.max(h * 0.7, vis), t = G.t;
  if (ah <= 0.02 && a.flash <= 0) return;
  ctx.globalAlpha = 0.2 * Math.max(h, vis); circle(a.x, a.y, a.r * 1.05, '#6a5030'); ctx.globalAlpha = ah;
  if (a.type === 'funnel') for (let i = 0; i < 9; i++) { const an = t * 0.7 + i * 0.7, rr = a.r * (0.2 + ((i * 0.13 + t * 0.12) % 1) * 0.8); px(a.x + Math.cos(an) * rr, a.y + Math.sin(an) * rr, '#c9b98f'); }
  else if (a.type === 'electra') {
    if (a.state === 1 || (t * 2.7 + a.ph) % 1 < 0.05) { ctx.strokeStyle = '#9ad0ff'; ctx.lineWidth = 2; for (let i = 0; i < 4; i++) { const an = Math.random() * 6.28; ctx.beginPath(); ctx.moveTo(a.x + Math.cos(an) * 6, a.y + Math.sin(an) * 6); ctx.lineTo(a.x + Math.cos(an + 0.4) * a.r * 0.8, a.y + Math.sin(an + 0.4) * a.r * 0.8); ctx.stroke(); } }
  } else if (a.type === 'fluff') for (let i = 0; i < 16; i++) { const an = i * 2.4 + t * 0.1, rr = a.r * Math.sqrt(((i * 0.37) % 1)); px(a.x + Math.cos(an) * rr, a.y + Math.sin(an) * rr + Math.sin(t + i) * 2, '#f4ecdc'); }
  else if (a.type === 'plesh') { ctx.globalAlpha = ah * 0.7; circle(a.x, a.y, a.r * 0.9, '#2e2416'); ctx.globalAlpha = ah; for (let i = 0; i < 10; i++) { const an = i * 2.1, rr = a.r * ((i * 0.31) % 0.9); px(a.x + Math.cos(an) * rr, a.y + Math.sin(an) * rr, i % 3 ? '#15110a' : '#8a8a70'); } }
  else if (a.type === 'grinder') {
    ctx.globalAlpha = ah * 0.6; circle(a.x, a.y, a.r * 0.85, '#23201c'); ctx.globalAlpha = ah;
    for (let i = 0; i < 8; i++) { const an = i * 0.8 + (a.act ? t * 8 : 0), rr = a.r * (0.3 + (i % 3) * 0.22); px(a.x + Math.cos(an) * rr, a.y + Math.sin(an) * rr, i % 2 ? '#b0a890' : '#6a2a2a', 3); }
    if (a.act) { ctx.strokeStyle = '#c0c0c0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + Math.cos(t * 8) * a.r, a.y + Math.sin(t * 8) * a.r); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x - Math.cos(t * 8) * a.r, a.y - Math.sin(t * 8) * a.r); ctx.stroke(); }
  }
  else if (a.type === 'spring') {
    // кольца-вмятины; перед прыжком сжимаются к центру
    const k = a.state ? a.t / c.charge : 0;
    ctx.strokeStyle = '#8a6a34'; ctx.lineWidth = 2;
    for (let i = 1; i <= 3; i++) { ctx.globalAlpha = ah * (0.7 - i * 0.15); ctx.beginPath(); ctx.arc(a.x, a.y, a.r * (i / 3.2) * (1 - k * 0.35), 0, 6.28); ctx.stroke(); }
    ctx.globalAlpha = ah; for (let i = 0; i < 6; i++) { const an = i * 1.05 + a.ph; px(a.x + Math.cos(an) * a.r * 0.75, a.y + Math.sin(an) * a.r * 0.75 - k * 6, '#e0c080', 3); }
  }
  else if (a.type === 'smolder') {
    const k = a.state ? a.t / c.charge : 0;
    ctx.globalAlpha = ah * 0.55; circle(a.x, a.y, a.r * 0.8, '#1c100c'); ctx.globalAlpha = ah;
    for (let i = 0; i < 10; i++) { const an = i * 2.3 + a.ph, rr = a.r * (0.15 + ((i * 0.19 + t * 0.1) % 1) * 0.75); px(a.x + Math.cos(an) * rr, a.y + Math.sin(an) * rr - ((t * 14 + i * 5) % 12), i % 3 ? '#e0602a' : '#ffb050', 3); }
    circle(a.x, a.y, a.r * (0.22 + 0.04 * Math.sin(t * 5 + a.ph)), '#c8461e');
    if (a.state) {
      ctx.globalAlpha = Math.min(0.55, 0.12 + k * 0.5); ctx.fillStyle = '#ff7a30'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.arc(a.x, a.y, a.r * c.reach, a.dir - c.arc / 2, a.dir + c.arc / 2); ctx.closePath(); ctx.fill(); ctx.globalAlpha = ah;
    }
  }
  else if (a.type === 'magnet') {
    ctx.globalAlpha = ah * 0.45; circle(a.x, a.y, a.r * 0.35, '#1c2028'); ctx.globalAlpha = ah;
    for (let i = 0; i < 12; i++) { const an = i * 2.4 + a.ph, rr = a.r * (0.35 + ((i * 0.17 + t * 0.05) % 1) * 0.65); px(a.x + Math.cos(an) * rr, a.y + Math.sin(an) * rr, i % 3 ? '#7a4a30' : '#9aa0a8', 3); }
    ctx.strokeStyle = 'rgba(140,170,210,.5)'; ctx.lineWidth = 1; for (let i = 0; i < 4; i++) { const an = i * 1.57 + t * 0.4; ctx.beginPath(); ctx.arc(a.x, a.y, a.r * 0.6, an, an + 0.9); ctx.stroke(); }
  }
  else { ctx.globalAlpha = ah * 0.4; ctx.beginPath(); ctx.ellipse(a.x, a.y, a.r * 0.8, a.r * 0.6, 0.3, 0, 6.28); ctx.fillStyle = '#4a7a55'; ctx.fill(); ctx.globalAlpha = ah; px(a.x - a.r * 0.25 + Math.sin(t) * 3, a.y - a.r * 0.2, '#cfe8d0', 4); }
  if (a.flash > 0) { ctx.globalAlpha = a.flash; circle(a.x, a.y, a.r * (1.1 - a.flash * 0.3), a.type === 'electra' ? '#cfe6ff' : c.col); }
  if (a.type === 'smolder' && a.flash > 0) { ctx.globalAlpha = a.flash * 0.5; ctx.fillStyle = '#ffb050'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.arc(a.x, a.y, a.r * c.reach, a.dir - c.arc / 2, a.dir + c.arc / 2); ctx.closePath(); ctx.fill(); }
  if (vis) { ctx.globalAlpha = vis; ctx.strokeStyle = c.col; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 6.28); ctx.stroke(); ctx.setLineDash([]); ctx.font = 'bold 11px Consolas'; ctx.textAlign = 'center'; ctx.fillStyle = c.col; ctx.fillText(c.name, a.x, a.y - a.r - 6); }
  ctx.globalAlpha = 1;
}
function drawMutant(m) {
  const asleep = m.state === 'sleep', pd = Math.hypot(m.x - P.x, m.y - P.y); let al = asleep ? 0.75 : 1;
  if (m.sp === 'fogger') { if (asleep) return; al = U.clamp(0.22 + (m.watched ? 0.5 : 0) + (pd < 90 ? 0.3 : 0), 0, 1) * (pd > 300 ? 0 : 1); if (al <= 0.02) return; }
  if (m.sp === 'cinder' && asleep) { if (pd < 220) { ctx.globalAlpha = 0.3 * (1 - pd / 220) + 0.1; Spr.draw(ctx, 'ashpile', m.x, m.y, false, null, 1.1); ctx.globalAlpha = 1; } return; }
  shadow(m.x, m.y + m.r * 0.7, m.r); Spr.draw(ctx, m.sp, m.x, m.y - 2, m.face < 0, al);
  if (m.burn > 0) { px(m.x - 3 + Math.sin(G.t * 20) * 2, m.y - 12 - (G.t * 30) % 6, '#ff8a30', 4); px(m.x + 3, m.y - 8 - (G.t * 24) % 6, '#ffd070', 3); }
  const sym = { sleep: 'z', investigate: '?', hunt: '!', flee: '«', eat: '♨' }[m.state];
  if (sym && pd < 300 && al > 0.3) { ctx.font = 'bold 13px Consolas'; ctx.textAlign = 'center'; ctx.fillStyle = m.state === 'hunt' ? '#e05050' : '#d8c070'; ctx.fillText(sym, m.x, m.y - 18); }
  if (m.hp < m.c.hp && al > 0.3) { ctx.fillStyle = '#000'; ctx.fillRect(m.x - 10, m.y - 24, 20, 3); ctx.fillStyle = '#a33'; ctx.fillRect(m.x - 10, m.y - 24, 20 * m.hp / m.c.hp, 3); }
}

// ---------- HUD ----------
let hudT = 0;
function hud(dt) {
  hudT -= dt; if (hudT > 0) return; hudT = 0.1;
  $('b_hp').style.width = U.clamp(P.hp, 0, 100) + '%'; $('b_st').style.width = P.stam / maxStam() * 100 + '%';
  $('b_rad').style.width = P.rad + '%'; $('b_food').style.width = P.food + '%'; $('b_psy').style.width = P.stress + '%';
  const w = weight(), cap = carryCap();
  $('state').innerHTML = `Вес <b style="color:${w > cap ? '#e06060' : ''}">${w.toFixed(1)}/${cap}</b> кг · Ур.${P.lvl}${P.sp ? ' <b style="color:#e8c060">(+' + P.sp + ' очко)</b>' : ''}` + (P.bleed > 0 ? ' <b style="color:#e06060">КРОВОТЕЧЕНИЕ</b>' : '') + (P.geigerRate > 0.2 ? ' <b style="color:#d8d040">ФОН</b>' : '') + Meta.status();
  const hh = Math.floor(G.hour), mm = Math.floor((G.hour % 1) * 60), e = G.emi;
  const ez = e.s === 'warn' ? `<div class="warn">ВЫБРОС ЧЕРЕЗ ${Math.ceil(e.left)} с${isSheltered() ? ' · ты в укрытии' : ' · В УКРЫТИЕ!'}</div>` : e.s === 'blast' ? '<div class="warn">ВЫБРОС!</div>' : '';
  $('top').innerHTML = `<div class="stat">${WX[G.wx].name}</div>${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${G.night > 0.5 ? '☾' : '☀'} · <b style="color:#e8c060">${P.money} ₽</b>${ez}<div class="stat">${G.scene === 'interior' ? Camp.roomName() : G.scene === 'camp' ? 'Лагерь «Обочина»' : inCamp() ? 'Блокпост' : CFG.biomes[W.biomeAt(P.x, P.y)].name + ' · сектор ' + W.danger(P.x, P.y)}</div>`;
  $('prompt').textContent = G.near ? '[E] ' + G.near.label : '';
  let q = ''; heldNames.forEach((h, i) => { const ic = h === 'weapon' ? Icons.html('w_' + P.weapon) : CFG.items[h].icon, n = h === 'weapon' ? invCount(CFG.weapons[P.weapon].ammo || 'ammo') : invCount(h); q += `<div class="qs ${P.sel === i ? 'on' : ''}" data-q="${i}"><u>${i + 1}</u>${ic}<b>${n}</b></div>`; });
  if ($('quick').dataset.s !== q) { $('quick').innerHTML = q; $('quick').dataset.s = q; }
  // осмотр (ПКМ)
  const tip = $('tip');
  if (mouse.r && !G.ui && G.scene === 'zone') {
    const mx = mouse.x + cam.x, my = mouse.y + cam.y; let txt = null;
    for (const a of W.anoms) if (Math.hypot(a.x - mx, a.y - my) < a.r + 25 && Math.hypot(a.x - P.x, a.y - P.y) < hintR()) { txt = CFG.anoms[a.type].hint + (P.sk.sense >= 2 ? ' — похоже на «' + CFG.anoms[a.type].name + '».' : ''); break; }
    if (!txt) for (const a of W.arts) if (Math.hypot(a.x - mx, a.y - my) < 30 && Math.hypot(a.x - P.x, a.y - P.y) < hintR() * 0.75) { txt = 'Что-то поблёскивает.'; break; }
    if (!txt) for (const s of W.corpses) if (Math.hypot(s.x - mx, s.y - my) < 30 && Math.hypot(s.x - P.x, s.y - P.y) < 300) { txt = s.looted ? 'Обшаренный труп сталкера.' : 'Труп сталкера. Может, что-то осталось.'; break; }
    if (!txt) txt = Math.hypot(P.x - W.C.x, P.y - W.C.y) < W.C.r ? 'Лагерь.' : 'Ничего необычного. Пока.';
    tip.textContent = txt; tip.style.display = 'block'; tip.style.left = Math.min(VW - 320, mouse.x + 14) + 'px'; tip.style.top = mouse.y + 14 + 'px';
  } else tip.style.display = 'none';
}

// ---------- панели ----------
const panel = $('panel');
function closePanel() { G.ui = null; panel.style.display = 'none'; $('mapwrap').style.display = 'none'; }
function row(icon, name, sub, btns) { return `<div class="row"><div class="ic">${icon}</div><div class="nm">${name}<div class="sub">${sub || ''}</div></div>${btns || ''}</div>`; }
const btn = (a, t, dis) => `<button class="btn ${dis ? 'dis' : ''}" data-a="${a}">${t}</button>`;
function openInv() { G.ui = { k: 'inv' }; renderPanel(); }
function openTrade(k) { G.ui = { k: 'trade', v: k }; renderPanel(); }
function renderPanelBase() {
  const u = G.ui; if (!u || u.k === 'map') return; panel.style.display = 'block';
  if (u.k === 'menu') { panel.innerHTML = menuHTML(u); return; }
  if (u.k === 'inv') {
    let h = '<div class="x" data-a="close">✕ Esc</div><h2>Снаряжение</h2><div class="cols"><div><h3>Рюкзак — ' + weight().toFixed(1) + ' / ' + carryCap() + ' кг</h3>';
    P.inv.forEach((s, i) => {
      const def = s.art ? null : CFG.items[s.id];
      const act = s.art ? btn('equip:' + i, 'В контейнер') : def.use ? btn('use:' + i, 'Исп.') : '';
      h += row(itemIcon(s), itemName(s) + (s.n > 1 ? ' ×' + s.n : ''), (s.art ? (P.known[s.art] ? CFG.arts[s.art].desc : 'Свойства неизвестны. Нужен учёный.') : (def.desc || '')) + ' · ' + slotW(s).toFixed(1) + ' кг', act + btn('drop:' + i, '↓'));
    });
    if (!P.inv.length) h += '<div class="stat">Пусто.</div>';
    h += '</div><div><h3>Контейнеры для артефактов</h3>';
    P.equip.forEach((a, i) => { h += `<span class="slot" data-a="unequip:${i}" title="${a ? CFG.arts[a].name + ': ' + CFG.arts[a].desc : 'Пусто'}">${a ? Icons.html('art') : '·'}</span>`; });
    h += '<div class="stat">' + P.equip.map(a => a ? CFG.arts[a].name : '—').join(' · ') + '</div>';
    h += `<h3>Навыки — очков: ${P.sp} · опыт ${Math.floor(P.xp)}/${Math.floor(60 * Math.pow(P.lvl, 1.4))}</h3>`;
    for (const k in CFG.skills) { const s = CFG.skills[k]; h += row('', `${s.name} <b>${P.sk[k]}/${s.max}</b>`, s.desc, btn('skill:' + k, '+', !P.sp || P.sk[k] >= s.max)); }
    h += `<h3>Записки (${P.notes.length})</h3>` + (P.notes.map(n => `<div class="note">${n.txt}</div>`).join('') || '<div class="stat">Нет.</div>') + '</div></div>';
    panel.innerHTML = h;
  } else if (u.k === 'trade') {
    const v = CFG.vendors[u.v];
    let h = `<div class="x" data-a="close">✕ Esc</div><h2>${v.name}</h2><div class="stat">Деньги: <b style="color:#e8c060">${P.money} ₽</b> · Вес ${weight().toFixed(1)}/${carryCap()}</div><div class="cols">`;
    if (Camp.stock(u.v).length) { h += '<div><h3>Купить</h3>'; for (const id of Camp.stock(u.v)) { const p = buyPrice(id), d = CFG.items[id]; h += row(d.icon, d.name + (d.pack ? ' ×' + d.pack : ''), (d.desc || '') + ' · ' + d.w + ' кг', btn('buy:' + id, p + ' ₽', P.money < p)); } h += '</div>'; }
    if (Object.keys(v.buys).length || v.ident) {
      h += '<div><h3>' + (v.ident ? 'Опознать / продать' : 'Продать') + '</h3>'; let any = false;
      P.inv.forEach((s, i) => {
        const p = sellPrice(s, u.v), unk = s.art && !P.known[s.art];
        if (v.ident && unk) { any = true; h += row(itemIcon(s), itemName(s), 'Опознание: ' + Camp.identCost() + ' ₽', btn('ident:' + i, 'Опознать', P.money < Camp.identCost())); }
        else if (p) { any = true; const dm = !s.art ? (G.demand[s.id] || 1) : (G.demand[s.art] || 1); h += row(itemIcon(s), itemName(s) + (s.n > 1 ? ' ×' + s.n : ''), unk ? 'Ценность неясна — берут по низу' : 'Спрос ' + (dm > 1.05 ? '↑' : dm < 0.95 ? '↓' : '→'), btn('sell:' + i, p + ' ₽') + (s.n > 1 ? btn('sellall:' + i, 'Все') : '')); }
      });
      if (!any) h += '<div class="stat">Нечего предложить.</div>'; h += '</div>';
    }
    if (u.v === 'bar') {
      h += `<div><h3>Услуги</h3>${row('☾', 'Переночевать', 'Утро, здоровье, сохранение', btn('sleep', Camp.sleepCost() + ' ₽', P.money < Camp.sleepCost()))}${row('🗺', 'Карта участка', 'Открывает район и отмечает аномалии', btn('map', v.map + ' ₽', P.money < v.map))}${row('💬', 'Слухи', 'Бесплатно', btn('rumor', 'Слушать'))}<div class="note" id="rumortxt">${u.r || ''}</div>`;
      h += '<h3>Продать информацию</h3>'; let any = false; P.notes.forEach((n, i) => { if (!n.sold) { any = true; h += row('✎', n.txt.slice(0, 46) + '…', '', btn('tell:' + i, v.noteSell + ' ₽')); } });
      if (!any) h += '<div class="stat">Новых записок нет.</div>'; h += '</div>';
    }
    panel.innerHTML = h + '</div>';
  }
}
panel.addEventListener('click', e => {
  const t = e.target.closest('[data-a]'); if (!t) return; Snd.tick(); const [a, arg, arg2] = t.dataset.a.split(':'), i = +arg;
  const u = G.ui;
  if (a === 'close' || a === 'resume') return closePanel();
  if (Camp.click(a, arg, arg2, u)) { renderPanel(); return; }
  if (Meta.click(a, arg, arg2, u)) { renderPanel(); return; }
  if (a === 'vol') { Snd.vol = U.clamp(Math.round((Snd.vol + (arg === 'up' ? 0.1 : -0.1)) * 10) / 10, 0, 1); if (Snd.master) Snd.master.gain.value = Snd.vol; }
  else if (a === 'savenow') { if (inCamp()) { save(); log('Сохранено.'); } else log('Сохраняться можно только в лагере.'); }
  else if (a === 'newgame') { if (u.conf) { try { localStorage.removeItem('zone_save_v2'); } catch (e) {} closePanel(); newGame(); return; } u.conf = true; }
  if (a === 'use') { const s = P.inv[i]; if (s) useItem(s.id); }
  else if (a === 'drop') { const s = P.inv[i]; if (s) { if (s.art) W.arts.push({ id: 0, type: s.art, x: P.x + 20, y: P.y, anom: 0 }); else W.loot.push({ x: P.x + 20, y: P.y, id: s.id, n: s.n }); P.inv.splice(i, 1); } }
  else if (a === 'equip') {
    const s = P.inv[i], slot = P.equip.indexOf(null);
    if (!P.known[s.art]) log('Неизвестный артефакт в контейнер не положишь — опознай у учёного.');
    else if (slot < 0) log('Контейнеры заняты.'); else { P.equip[slot] = s.art; P.inv.splice(i, 1); }
  } else if (a === 'unequip') { if (P.equip[i]) { invAdd('art', 1, P.equip[i]); P.equip[i] = null; } }
  else if (a === 'skill') { if (P.sp > 0 && P.sk[arg] < CFG.skills[arg].max) { P.sk[arg]++; P.sp--; } }
  else if (a === 'buy') { const p = buyPrice(arg); if (P.money >= p) { P.money -= p; invAdd(arg, CFG.items[arg].pack || 1); Snd.pick(); } }
  else if (a === 'sell' || a === 'sellall') {
    const s = P.inv[i]; if (!s) return; const n = a === 'sellall' ? s.n : 1, p = sellPrice(s, u.v) * n;
    P.money += p; addXp(p * 0.06); const key = s.art || s.id; G.demand[key] = Math.max(0.5, (G.demand[key] || 1) * Math.pow(0.94, n));
    if (s.art) P.inv.splice(i, 1); else { s.n -= n; if (s.n <= 0) P.inv.splice(i, 1); } Snd.pick();
  } else if (a === 'ident') {
    const s = P.inv[i], v = CFG.vendors[u.v]; if (s && s.art && P.money >= v.ident) { P.money -= v.ident; P.known[s.art] = true; addXp(25); log('Опознан: ' + CFG.arts[s.art].name + '. ' + CFG.arts[s.art].desc, '#e8c060'); }
  } else if (a === 'sleep') {
    const v = CFG.vendors.bar; if (P.money >= v.sleep) { P.money -= v.sleep; const day = CFG.time.dayLen / 24; G.clock += (((7 - G.hour) + 24) % 24) * day; P.hp = 100; P.stam = maxStam(); P.rad = Math.max(0, P.rad - 20); P.stress = 0; P.food = Math.max(20, P.food - 15); save(); log('Ты выспался. Утро. Игра сохранена.'); closePanel(); }
  } else if (a === 'map') {
    const v = CFG.vendors.bar; if (P.money >= v.map) {
      P.money -= v.map; let p = null; for (let t = 0; t < 30; t++) { const q = W.spot(400, Math.random); const k = known[Math.floor(q.y / 40) * KN + Math.floor(q.x / 40)]; if (!k) { p = q; break; } }
      p = p || W.spot(400, Math.random); reveal(p.x, p.y, 420); let n = 0; for (const a2 of W.anoms) if (Math.hypot(a2.x - p.x, a2.y - p.y) < 420) { a2.known = true; n++; } for (const b of W.bunkers) if (Math.hypot(b.x - p.x, b.y - p.y) < 420) b.known = true;
      log(`Карта: открыт участок, отмечено аномалий — ${n}. Действует до ближайшего выброса.`, '#9ab8d8');
    }
  } else if (a === 'rumor') u.r = U.pick(CFG.rumors);
  else if (a === 'tell') { const n = P.notes[i]; if (n && !n.sold) { n.sold = true; P.money += CFG.vendors.bar.noteSell; addXp(4); Snd.pick(); } }
  renderPanel();
});

function openMenu() { closePanel(); G.ui = { k: 'menu' }; renderPanel(); }
function menuHTML(u) {
  const ctl = [['WASD / стрелки', 'движение'], ['Shift', 'бег (тратит силы, шумно)'], ['Ctrl / C', 'красться (тихо, незаметнее)'], ['Мышь', 'направление взгляда и броска'],
    ['ЛКМ', 'применить выбранное: выстрел / бросок болта / лечение / еда'], ['ПКМ (держать)', 'осмотреть место под курсором'], ['E / F', 'подобрать, обыскать, говорить'],
    ['1–8 / Q / колесо', 'оружие (1 ещё раз — сменить), болты, аптечка, еда, антирад, приманка, шина, шок-бомба'], ['J', 'журнал: задания, репутация, знания'], ['Tab / I', 'рюкзак, навыки, записки'], ['M', 'карта'], ['Esc / F1', 'это меню (пауза)']];
  const tips = ['Обыскивай остовы машин и тайники (E): хлам, патроны, деньги. Отмечены мерцанием рядом.', 'Хлам, трофеи с туш и артефакты неси Скупщику «Бороде» в лагере.',
    'Артефакты лежат в аномалиях. Бросай болты (слот 2), потом рискуй. Неопознанные — к учёному.', 'Слухачи слепые: красться. Стеклоеды не опасны. Жестянка бьёт сильно — води её через аномалии. Туманник: смотри на него.', 'Выброс: сирена, 25 сек, в лагерь или бункер.'];
  return `<div class="x" data-a="resume">✕ Esc</div><h2>Меню — игра на паузе</h2><div class="cols"><div><h3>Управление</h3>${ctl.map(([k, d]) => row('', '<b>' + k + '</b>', d)).join('')}</div>
    <div><h3>Как заработать</h3>${tips.map(t => '<div class="note">' + t + '</div>').join('')}<h3>Игра</h3>
    <div class="row"><div class="nm">Громкость: <b>${Math.round(Snd.vol * 100)}%</b></div>${btn('vol:down', '−')}${btn('vol:up', '+')}</div>
    <div class="row"><div class="nm">Сохранение<div class="sub">в лагере; в Зоне — автосейв каждые 30 с (при обрыве связи: −10% денег)</div></div>${btn('savenow', 'Сохранить', !inCamp())}</div>
    <div class="row"><div class="nm">Новая игра<div class="sub">${u.conf ? 'Нажми ещё раз: сохранение будет стёрто' : 'Начать заново'}</div></div>${btn('newgame', u.conf ? 'Точно?' : 'Новая')}</div>
    <div style="margin-top:12px">${btn('resume', '▶ Продолжить')}</div></div></div>`;
}
// ---------- карта ----------
const BASE = ['#2c3a24', '#333a22', '#3a3520', '#403022'];
function drawMap() {
  const wrap = $('mapwrap'), mc = $('mapcv'), s = Math.min(VW, VH) * 0.92; mc.width = mc.height = s; wrap.style.display = 'flex';
  const m = mc.getContext('2d'), k = s / W.S; m.fillStyle = '#080a07'; m.fillRect(0, 0, s, s);
  const c = CFG.world.cell * k;
  for (let i = 0; i < KN; i++) for (let j = 0; j < KN; j++) if (known[j * KN + i]) { m.fillStyle = CFG.biomes[W.biomeAt((i + 0.5) * 40, (j + 0.5) * 40)].map; m.fillRect(i * c, j * c, c + 1, c + 1); }
  m.strokeStyle = '#3a3a2a'; m.strokeRect(0, 0, s, s); m.font = '12px Consolas'; m.textAlign = 'center';
  for (const a of W.anoms) if (a.known) { m.strokeStyle = CFG.anoms[a.type].col; m.beginPath(); m.arc(a.x * k, a.y * k, Math.max(3, a.r * k), 0, 6.28); m.stroke(); m.fillStyle = CFG.anoms[a.type].col; m.fillText(CFG.anoms[a.type].name[0], a.x * k, a.y * k + 4); }
  for (const b of W.bunkers) if (b.known) { m.fillStyle = '#8aa070'; m.fillRect(b.x * k - 4, b.y * k - 4, 8, 8); }
  for (const l of W.labs) if (l.known) { m.fillStyle = '#7fb8ff'; m.fillRect(l.x * k - 5, l.y * k - 5, 10, 10); m.fillStyle = '#0b0d0a'; m.fillText('Л', l.x * k, l.y * k + 4); }
  for (const r of W.roads) if (r.known) { m.strokeStyle = '#d0a070'; m.lineWidth = 3; m.beginPath(); m.moveTo((r.x - Math.cos(r.ang) * r.len / 2) * k, (r.y - Math.sin(r.ang) * r.len / 2) * k); m.lineTo((r.x + Math.cos(r.ang) * r.len / 2) * k, (r.y + Math.sin(r.ang) * r.len / 2) * k); m.stroke(); m.lineWidth = 1; m.fillStyle = '#d0a070'; m.fillText('Тракт', r.x * k, r.y * k - 8); }
  for (const x of W.caches) { m.strokeStyle = '#e06060'; m.strokeRect(x.x * k - 4, x.y * k - 4, 8, 8); }
  m.fillStyle = '#e8c060'; m.fillText('БЛОКПОСТ', W.C.x * k, W.C.y * k - 12); m.beginPath(); m.arc(W.C.x * k, W.C.y * k, 5, 0, 6.28); m.fill();
  m.fillStyle = '#c9a93a'; m.fillText('?', CFG.world.goal.x * k, CFG.world.goal.y * k);
  Meta.drawMap(m, k);
  const pk = G.scene !== 'zone' ? W.C : P; m.save(); m.translate(pk.x * k, pk.y * k); m.rotate(G.scene !== 'zone' ? 0 : P.ang); m.fillStyle = '#fff'; m.beginPath(); m.moveTo(8, 0); m.lineTo(-5, -5); m.lineTo(-5, 5); m.fill(); m.restore();
  m.fillStyle = '#7d7864'; m.textAlign = 'left'; m.fillText('Цвет: сектор 1 (безопаснее) → 4 (опаснее). Карта неточна: после выброса отметки устаревают.', 8, s - 8);
}

// ---------- ввод ----------
addEventListener('keydown', e => {
  if (!G.started) return;
  if (e.code === 'Tab' || e.code === 'ControlLeft' && false) e.preventDefault();
  if (e.repeat) { keys[e.code] = true; return; }
  keys[e.code] = true;
  if (e.code === 'Tab' || e.code === 'KeyI') { e.preventDefault(); G.ui && G.ui.k === 'inv' ? closePanel() : (closePanel(), openInv()); }
  else if (e.code === 'KeyJ') { G.ui && G.ui.k === 'journal' ? closePanel() : (closePanel(), Meta.openJournal()); }
  else if (e.code === 'KeyM') { if (G.ui && G.ui.k === 'map') closePanel(); else { closePanel(); G.ui = { k: 'map' }; drawMap(); } }
  else if (e.code === 'Escape' || e.code === 'F1') { e.preventDefault(); G.ui ? closePanel() : openMenu(); }
  else if (e.code === 'KeyE' || e.code === 'KeyF') { if (G.ui) closePanel(); else if (G.near && !G.dead) G.near.fn(); }
  else if (e.code === 'KeyQ') P.sel = (P.sel + 1) % heldNames.length;
  else if (/^Digit[1-8]$/.test(e.code)) { const n = +e.code[5] - 1; if (n === 0 && P.sel === 0) Meta.cycleWeapon(); P.sel = n; }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.l = mouse.r = false; });
cv.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
cv.addEventListener('mousedown', e => { if (e.button === 0) mouse.l = true; if (e.button === 2) mouse.r = true; });
addEventListener('mouseup', e => { if (e.button === 0) mouse.l = false; if (e.button === 2) mouse.r = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('wheel', e => { if (G.started && !G.ui) P.sel = (P.sel + (e.deltaY > 0 ? 1 : heldNames.length - 1)) % heldNames.length; });
$('quick').addEventListener('click', e => { const q = e.target.closest('[data-q]'); if (q) P.sel = +q.dataset.q; });
$('mapwrap').addEventListener('click', closePanel);
$('menubtn').onclick = () => { if (G.started) openMenu(); };

// ---------- старт и цикл ----------
function resize() { VW = cv.width = innerWidth; VH = cv.height = innerHeight; lc.canvas.width = VW; lc.canvas.height = VH; }
addEventListener('resize', resize); resize();
function start(cont) {
  Snd.init(); if (!(cont && load())) newGame();
  $('splash').style.display = 'none'; G.started = true;
}
$('bNew').onclick = () => start(false);
$('bCont').onclick = () => start(true);
Spr.init();
try { if (!localStorage.getItem('zone_save_v2')) $('bCont').style.display = 'none'; } catch (e) { $('bCont').style.display = 'none'; }
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (cv.width !== innerWidth || cv.height !== innerHeight) resize();
  if (!VW || !VH) { requestAnimationFrame(frame); return; }
  if (G.started) { if (!(G.ui && G.ui.k === 'menu')) update(dt); draw(); hud(dt); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener('beforeunload', () => save(true));

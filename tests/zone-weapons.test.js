"use strict";
// «Обочина» v0.14: оружие со случайными характеристиками — генерация, редкости, цены, экземпляры, прилавок, добыча, сохранение.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createZone } = require("./zone-load");

const z = createZone();
const CFG = z.get("CFG");
const run = code => JSON.parse(JSON.stringify(z.run(code) ?? null));
const plain = h => String(h).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const fresh = () => z.run(`(() => {
  W = new World(1234); resetPlayer(); P.stash = []; P.bld = null; Mutants.spawn(); Stalkers.spawn(); Meta.reset(); Camp.enter(true); Dungeon.levels = {};
  G.events = []; G.dead = false; G.scene = "zone"; G.started = true; G.ui = null; G.emi = { s: "calm", left: 0, next: 99999 }; G.t = 5; P.hp = 100; P.money = 5000; P.inv = []; invAdd("ammo", 30); invAdd("bolt", 20);
  P.quests = []; Stalkers.list = []; Mutants.list = []; P.x = 3000; P.y = 3000; keys.mx = 0; keys.my = 0; P.cd = 0; localStorage.removeItem("zone_save_v2");
  if (!globalThis.__log) { globalThis.__log = log; log = (t, c) => { globalThis.__logs.push(String(t)); }; } globalThis.__logs = [];
})()`);
const ALL = ["pistol", "sawnoff", "revolver", "crossbow", "rifle", "flamer", "smg"];

test("бросок: множители в жёстких границах, параметры подходят типу, число плюсов и минусов по редкости", () => {
  fresh();
  const o = run(`(() => {
    const rnd = U.rng(11), bad = [], seen = { 0: 0, 1: 0, 2: 0, 3: 0 }, res = { plus: {}, minus: {}, perks: {}, names: new Set() };
    for (let i = 0; i < 4000; i++) {
      const base = ${JSON.stringify(ALL)}[i % ${ALL.length}], b = CFG.weapons[base], d = Wpn.roll(base, rnd); seen[d.rar]++;
      const ks = Object.keys(d.mods), good = ks.filter(k => Wpn.goodness(k, d.mods[k]) > 0.0005).length, worse = ks.filter(k => Wpn.goodness(k, d.mods[k]) < -0.0005).length;
      (res.plus[d.rar] = res.plus[d.rar] || new Set()).add(good); (res.minus[d.rar] = res.minus[d.rar] || new Set()).add(worse);
      for (const k of ks) { const s = Wpn.STATS[k], v = d.mods[k]; if (v < s.lim[0] - 1e-9 || v > s.lim[1] + 1e-9) bad.push(base + ":" + k + "=" + v); }
      if (b.spread <= 0.01 && d.mods.spread != null) bad.push(base + ": разброс у оружия без разброса"); if (b.cone && d.mods.range != null) bad.push(base + ": дальность у огнемёта");
      const np = Object.keys(d.perks).length; (res.perks[d.rar] = res.perks[d.rar] || new Set()).add(np); if (d.rar === 3 && d.perks.hush && b.noise <= 100) bad.push(base + ": шёпот у бесшумного");
      if (d.rar === 3 && b.cone && d.perks.crit) bad.push("крит у огнемёта"); if (d.rar === 0 && d.name !== b.name) bad.push("обычное с эпитетом"); if (d.rar > 0 && !/«.+»/.test(d.name)) bad.push("нет эпитета: " + d.name);
    }
    return { bad, seen, plus: Object.fromEntries(Object.entries(res.plus).map(([k, v]) => [k, [...v].sort()])), minus: Object.fromEntries(Object.entries(res.minus).map(([k, v]) => [k, [...v].sort()])), perks: Object.fromEntries(Object.entries(res.perks).map(([k, v]) => [k, [...v]])) };
  })()`);
  assert.deepEqual(o.bad, []);
  assert.ok(o.plus[1].every(n => n >= 1) && o.minus[1].every(n => n <= 1), "Хорошее: минимум плюс, не больше одного минуса"); assert.deepEqual(o.plus[2], [2, 3].filter(n => o.plus[2].includes(n)).length ? o.plus[2] : [2]);
  assert.ok(o.plus[2].every(n => n >= 2) && o.minus[2].every(n => n <= 1), "Редкое: два плюса и не больше одного минуса");
  assert.ok(o.plus[3].every(n => n >= 3) && o.minus[3].every(n => n === 0), "Уникальное: три плюса без минусов"); assert.deepEqual(o.perks[3], [1]); assert.ok(o.perks[0].length === 1 && o.perks[0][0] === 0 && o.perks[1][0] === 0 && o.perks[2][0] === 0, "особое свойство — только у Уникального");
});

test("распределение редкостей ≈ 58/28/11/3; глубина сдвигает вверх; минимальная редкость соблюдается", () => {
  fresh();
  const o = run(`(() => {
    const rnd = U.rng(5), dist = (o, n = 20000) => { const t = [0, 0, 0, 0]; for (let i = 0; i < n; i++) t[Wpn.pickTier(rnd, o.luck || 0, o.min || 0)]++; return t.map(v => v / n); };
    return { normal: dist({}), deep: dist({ luck: 3 }), min1: dist({ min: 1 }), min2: dist({ min: 2, luck: 2 }) };
  })()`);
  [0.58, 0.28, 0.11, 0.03].forEach((p, i) => assert.ok(Math.abs(o.normal[i] - p) < 0.02, `норма ${i}: ${o.normal[i]}`));
  assert.ok(o.deep[0] < o.normal[0] - 0.1 && o.deep[3] > o.normal[3] * 1.8 && o.deep[2] > o.normal[2] * 1.5, "глубже — лучше");
  assert.equal(o.min1[0], 0); assert.equal(o.min2[0] + o.min2[1], 0); assert.ok(o.min2[2] > o.min2[3]);
});

test("сила и цена: растут с редкостью, средняя сила ≈ 1.0–1.08, у Обычного около 1, Уникальное 1.15–1.6; цена возрастает вместе с силой", () => {
  fresh();
  const o = run(`(() => {
    const rnd = U.rng(9), by = [[], [], [], []], vals = []; for (let i = 0; i < 6000; i++) { const base = ${JSON.stringify(ALL)}[i % ${ALL.length}], d = Wpn.roll(base, rnd); by[d.rar].push(Wpn.power(d)); vals.push([base, Wpn.power(d), Wpn.value(d)]); }
    const avg = a => a.reduce((s, v) => s + v, 0) / a.length, all = by.flat(), byBase = {}; for (const [b, p, v] of vals) (byBase[b] = byBase[b] || []).push([p, v]);
    let mono = true; for (const b in byBase) { const a = byBase[b].sort((x, y) => x[0] - y[0]); for (let i = 1; i < a.length; i++) if (a[i][1] < a[i - 1][1] - 1e-9) mono = false; }
    return { avg: by.map(avg), min: by.map(a => Math.min(...a)), max: by.map(a => Math.max(...a)), mean: avg(all), mono, plainPower: Wpn.power(Wpn.plain("rifle")), plainValue: Wpn.value(Wpn.plain("rifle")), pistolValue: Wpn.value(Wpn.plain("pistol")), rifleBase: CFG.weapons.rifle.price };
  })()`);
  assert.ok(o.avg[0] < o.avg[1] && o.avg[1] < o.avg[2] && o.avg[2] < o.avg[3]); assert.ok(o.mean >= 1.0 && o.mean <= 1.08, "средняя сила " + o.mean); assert.ok(Math.abs(o.avg[0] - 1) < 0.03);
  assert.ok(o.min[0] >= 0.88 && o.max[0] <= 1.12 && o.min[3] >= 1.15 && o.max[3] <= 1.65, JSON.stringify([o.min, o.max])); assert.ok(o.min.every(v => v >= 0.88), "нет откровенного хлама");
  assert.ok(o.mono, "дороже — сильнее (в пределах типа)"); assert.equal(o.plainPower, 1); assert.equal(o.plainValue, o.rifleBase); assert.equal(o.pistolValue, 200, "у пистолета цены нет: базовая 200");
});

test("детерминизм: тот же генератор — то же оружие; имя строится по лучшим параметрам", () => {
  fresh();
  const o = run(`(() => { const a = Wpn.roll("revolver", U.rng(42), { rar: 2 }), b = Wpn.roll("revolver", U.rng(42), { rar: 2 }), c = Wpn.roll("revolver", U.rng(43), { rar: 2 });
    return { same: JSON.stringify(a) === JSON.stringify(b), diff: JSON.stringify(a) !== JSON.stringify(c), name: a.name, goods: Object.keys(a.mods).filter(k => Wpn.goodness(k, a.mods[k]) > 0).map(k => Wpn.STATS[k].adj[0]), uniq: Wpn.roll("smg", U.rng(1), { rar: 3 }).name }; })()`);
  assert.ok(o.same && o.diff); assert.ok(o.goods.some(g => o.name.includes(g))); assert.match(o.name, /^Револьвер «/); assert.match(o.uniq, /«(Скряга|Палач|Шёпот)»/);
});

test("итоговые характеристики: базовое × множители, округления, перки; простое оружие — тот же объект конфига", () => {
  fresh();
  const o = run(`(() => {
    const b = CFG.weapons.revolver, def = { base: "revolver", rar: 3, mods: { dmg: 1.1, cd: 0.9, spread: 0.8, range: 1.05, noise: 0.7, wear: 0.75 }, perks: { crit: 0.15, ammoSave: 0.2 }, name: "Револьвер «Тест»" };
    const id = Wpn.add(def), w = Wpn.of(id), again = Wpn.of(id);
    return { plain: Wpn.of("pistol") === CFG.weapons.pistol, id, w: { dmg: w.dmg, cd: w.cd, spread: w.spread, range: w.range, noise: w.noise, wear: w.wear, crit: w.crit, ammoSave: w.ammoSave, name: w.name, base: w.base, ammo: w.ammo, repair: w.repair, lvl: w.lvl }, exp: { dmg: +(b.dmg * 1.1).toFixed(1), cd: +(b.cd * 0.9).toFixed(2), spread: +(b.spread * 0.8).toFixed(3), range: Math.round(b.range * 1.05), noise: Math.round(b.noise * 0.7), wear: +(b.wear * 0.75).toFixed(2) }, cached: w === again, baseSame: b.dmg };
  })()`);
  assert.ok(o.plain); assert.equal(o.id, "revolver#1"); assert.ok(o.cached); assert.equal(o.w.base, "revolver"); assert.equal(o.w.name, "Револьвер «Тест»");
  for (const k of Object.keys(o.exp)) assert.equal(o.w[k], o.exp[k], k); assert.equal(o.w.crit, 0.15); assert.equal(o.w.ammoSave, 0.2); assert.equal(o.baseSame, CFG.weapons.revolver.dmg, "конфиг не тронут");
});

test("экземпляры: id уникальны, сохраняются износ и описание; смена оружия и продажа; последний ствол тоже продаётся", () => {
  fresh();
  const o = run(`(() => {
    const d1 = Wpn.roll("rifle", U.rng(1), { rar: 1 }), d2 = Wpn.roll("rifle", U.rng(2), { rar: 1 }); const a = Wpn.add(d1), b = Wpn.add(d2, 60);
    const ids = [a, b], cond = { a: P.cond[a], b: P.cond[b] }; P.weapon = b; const cyc = []; for (let i = 0; i < 4; i++) { Meta.cycleWeapon(); cyc.push(P.weapon); }
    P.money = 0; const price = Wpn.sellPrice(b); P.weapon = b; Meta.click("wsell", b, 0, { v: "gun" }); const after = { has: P.weapons.includes(b), weapon: P.weapon, money: P.money, price, def: !!P.wdefs[b], cond: P.cond[b] };
    Meta.click("wsell", a, 0, {}); Meta.click("wsell", "pistol", 0, {}); const last = { weapons: P.weapons.slice() };
    return { ids, cond, cyc, after, last, value: Wpn.value(d2) };
  })()`);
  assert.deepEqual(o.ids, ["rifle#1", "rifle#2"]); assert.deepEqual(o.cond, { a: 100, b: 60 }); assert.equal(o.cyc.length, 4); assert.ok(new Set(o.cyc).size >= 3, "перебор проходит по всем");
  assert.equal(o.after.has, false); assert.ok(o.after.weapon && o.after.weapon !== "rifle#2"); assert.equal(o.after.money, o.after.price); assert.equal(o.after.def, false); assert.equal(o.after.cond, undefined);
  assert.equal(o.after.price, Math.max(1, Math.round(o.value * 0.45 * (0.5 + 0.5 * 0.6)))); assert.deepEqual(o.last.weapons, [], "последний ствол тоже продаётся");
});

test("стрельба: берутся итоговые урон, темп и шум экземпляра; износ по его wear", () => {
  fresh();
  const o = run(`(() => {
    const def = { base: "pistol", rar: 2, mods: { dmg: 1.2, cd: 0.8, noise: 0.5, wear: 0.5 }, perks: {}, name: "Пистолет «Тест»" }; const id = Wpn.add(def); P.weapon = id; P.sel = 0; P.cond[id] = 100; const w = Wpn.of(id);
    const m = new Mutant("tin", 3060, 3000, null); m.state = "wander"; m.hp = 1000; Mutants.list = [m]; P.ang = 0; const orig = Math.random; Math.random = () => 0.5;
    try { shoot(); } finally { Math.random = orig; }
    return { hp: 1000 - m.hp, dmg: w.dmg, armor: CFG.mut.tin.armor, cd: P.cd, wantCd: w.cd, wear: 100 - P.cond[id], wantWear: w.wear, noise: w.noise };
  })()`);
  assert.ok(Math.abs(o.hp - o.dmg * (1 - o.armor)) < 1e-9, o.hp + " vs " + o.dmg); assert.equal(o.cd, o.wantCd); assert.ok(Math.abs(o.wear - o.wantWear) < 1e-9); assert.equal(o.noise, Math.round(CFG.weapons.pistol.noise * 0.5));
});

test("Уникальные свойства: «Скряга» иногда не тратит патрон; «Палач» бьёт вдвое; «Шёпот» тише", () => {
  fresh();
  const o = run(`(() => {
    const mk = perks => { const id = Wpn.add({ base: "pistol", rar: 3, mods: {}, perks, name: "Пистолет «Тест»" }); P.weapon = id; P.cond[id] = 100; return id; };
    const shot = (rndv, keyPerks) => { const id = mk(keyPerks); P.cd = 0; const m = new Mutant("glass", 3060, 3000, null); m.state = "wander"; m.hp = 1000; m.c = Object.assign({}, m.c, { armor: 0 }); Mutants.list = [m]; P.ang = 0; const a0 = invCount("ammo"), orig = Math.random; Math.random = () => rndv; try { shoot(); } finally { Math.random = orig; } return { spent: a0 - invCount("ammo"), dmg: 1000 - m.hp }; };
    const saveHit = shot(0.1, { ammoSave: 0.2 }), saveMiss = shot(0.5, { ammoSave: 0.2 }), critHit = shot(0.05, { crit: 0.1 }), critMiss = shot(0.5, { crit: 0.1 });
    const hush = Wpn.roll("rifle", U.rng(8), { rar: 3 }); while (!hush.perks.hush) { Object.assign(hush, Wpn.roll("rifle", U.rng(Math.random() * 1e6 | 0), { rar: 3 })); }
    return { saveHit, saveMiss, critHit, critMiss, hushNoise: Wpn.eff(hush).noise, rifleNoise: CFG.weapons.rifle.noise, log: globalThis.__logs.filter(t => /Критический/.test(t)).length };
  })()`);
  assert.equal(o.saveHit.spent, 0); assert.equal(o.saveMiss.spent, 1); assert.equal(o.critHit.dmg, CFG.weapons.pistol.dmg * 2); assert.equal(o.critMiss.dmg, CFG.weapons.pistol.dmg); assert.ok(o.hushNoise < o.rifleNoise * 0.7); assert.ok(o.log >= 1);
});

test("прилавок: число и тип товаров зависят от уровня мастерской, цена = стоимость (как у стандартного товара), типы не повторяются, обновляется после ночёвки и выброса", () => {
  fresh();
  const o = run(`(() => {
    let dup = 0; const res = {}; for (const lvl of [1, 2, 3]) { P.bld = Camp.DEFAULT_BLD(); P.bld.gun = lvl; const bases = new Set(); let minRar = 9, n = 0, cnt = []; for (let i = 0; i < 60; i++) { const off = Wpn.genShop(U.rng(i + 1)); cnt.push(off.length); for (const x of off) { bases.add(x.def.base); minRar = Math.min(minRar, x.def.rar); if (x.price !== Math.round(Wpn.value(x.def) / 5) * 5) n++; } const types = off.map(x => x.def.base); if (new Set(types).size !== Math.min(types.length, Object.keys(CFG.weapons).filter(k => (CFG.weapons[k].lvl || 1) <= lvl).length)) dup++; } 
      res[lvl] = { cnt: [...new Set(cnt)], bases: [...bases].sort(), badPrice: n, maxLvl: Math.max(...[...bases].map(b => CFG.weapons[b].lvl || 1)) }; }
    P.bld = Camp.DEFAULT_BLD(); const first = JSON.stringify(P.gunOffers); Meta.genOffers(); const second = JSON.stringify(P.gunOffers); const emi = (P.gunOffers = [], Meta.onEmission(), P.gunOffers.length);
    return { res, dup, changed: first !== second, emi };
  })()`);
  assert.deepEqual(o.res[1].cnt, [3]); assert.deepEqual(o.res[2].cnt, [4]); assert.deepEqual(o.res[3].cnt, [5]); assert.ok(o.res[1].maxLvl <= 1 && o.res[2].maxLvl <= 2 && o.res[3].maxLvl <= 3);
  assert.ok(o.res[3].bases.length > o.res[1].bases.length); for (const l of [1, 2, 3]) assert.equal(o.res[l].badPrice, 0); assert.equal(o.dup, 0, "типы на прилавке не повторяются, пока хватает разных"); assert.ok(o.changed); assert.ok(o.emi >= 3, "выброс обновляет прилавок");
});

test("покупка с прилавка: платит, добавляет, берёт в руки, убирает товар; бедному не продают; стандартный товар как раньше", () => {
  fresh();
  const o = run(`(() => {
    P.bld = Camp.DEFAULT_BLD(); P.bld.gun = 3; Wpn.genShop(U.rng(4)); const offers = P.gunOffers.slice(), n0 = offers.length, first = offers[0], m0 = P.money;
    P.money = first.price - 1; Meta.click("wbuyg", 0, 0, { v: "gun" }); const poor = { weapons: P.weapons.length, offers: P.gunOffers.length };
    P.money = first.price + 10; Meta.click("wbuyg", 0, 0, { v: "gun" }); const rich = { weapons: P.weapons.length, offers: P.gunOffers.length, money: P.money, weapon: P.weapon, name: Wpn.name(P.weapon), inHand: P.weapon === P.weapons[P.weapons.length - 1], cond: P.cond[P.weapon] };
    P.money = 2000; Meta.click("wbuy", "smg", 0, { v: "gun" }); const std = { has: P.weapons.includes("smg") };
    return { n0, poor, rich, std, price: first.price, name: first.def.name, html: plain(Meta.tradeExtra("gun")) };
    function plain(h) { return String(h).replace(/<[^>]+>/g, " ").replace(/\\s+/g, " "); }
  })()`);
  assert.deepEqual(o.poor, { weapons: 1, offers: o.n0 }); assert.equal(o.rich.weapons, 2); assert.equal(o.rich.offers, o.n0 - 1); assert.equal(o.rich.money, 10); assert.equal(o.rich.name, o.name); assert.ok(o.rich.inHand); assert.equal(o.rich.cond, 100);
  assert.equal(o.std.has, true); assert.match(o.html, /Твоё оружие/); assert.match(o.html, /На прилавке сегодня/); assert.match(o.html, /Стандартный товар/);
});

test("интерфейс оружейника: имя цветом редкости, отличия от базового, цены; подсказка со сравнением и силой", () => {
  fresh();
  const o = run(`(() => {
    P.bld = Camp.DEFAULT_BLD(); P.bld.gun = 3; const def = { base: "revolver", rar: 2, mods: { dmg: 1.15, cd: 0.9, wear: 1.2 }, perks: {}, name: "Револьвер «Тяжёлый Скорый»" }; P.gunOffers = [{ def, price: 700 }]; const id = Wpn.add(Wpn.roll("rifle", U.rng(3), { rar: 3 }));
    const html = Meta.gunShopHTML(); const offerTip = Tip.fromAttr("wbuyg:0"), ownTip = Tip.fromAttr("wequip:" + id), plainTip = Tip.fromAttr("wequip:pistol"), hud = Tip.quick(1);
    return { html, offerTip, ownTip, plainTip, id, hasIcon: html.includes("<img") };
  })()`);
  assert.match(o.html, /color:#6fa8e8/); assert.match(o.html, /color:#e8a040/); assert.match(o.html, /урон \+15%/); assert.match(o.html, /темп \+10%/); assert.match(o.html, /износ \+20%/); assert.match(o.html, /wbuyg:0/); assert.match(o.html, /wsell:/); assert.ok(o.hasIcon);
  const t = plain(o.offerTip); assert.match(t, /Редкое/); assert.match(t, /Урон: 50\.6 \(\+15%\)/); assert.match(t, /Сила: 1\.\d\d/); assert.doesNotMatch(t, /Мастерская/); assert.ok(t.includes("выстр./с") && t.includes("(+11%)"), "темп +11% показан плюсом: " + t);
  const u = plain(o.ownTip); assert.match(u, /Уникальное/); assert.match(u, /★/); assert.match(u, /Состояние: 100%/); assert.match(u, /Цена продажи: \d+ ₽/); assert.match(plain(o.plainTip), /Обычное/);
});

test("добыча: сейф бункера часто даёт оружие не хуже Хорошего; бросок детерминирован; шкафчики и трупы бандитов иногда тоже", () => {
  fresh();
  const o = run(`(() => {
    const b = W.bunkers[3]; Dungeon.cur = b; Dungeon.lvl = Dungeon.level(b); let vault = 0, minRar = 9, lockers = 0; const seenBases = new Set();
    for (let g = 0; g < 200; g++) { b.gen = g; const L = Dungeon.vaultLoot(b), gun = L.find(x => x[0] === "gun"); if (gun) { vault++; minRar = Math.min(minRar, gun[1].rar); seenBases.add(gun[1].base); }
      for (let i = 0; i < 4; i++) if (Dungeon.lockerLoot(b, i).some(x => x[0] === "gun")) lockers++; }
    b.gen = 5; const a = JSON.stringify(Dungeon.vaultLoot(b)), a2 = JSON.stringify(Dungeon.vaultLoot(b));
    let bandit = 0, patrol = 0, orig = Math.random; Math.random = U.rng(6); try { for (let i = 0; i < 400; i++) { for (const kind of ["bandit", "patrol"]) { W.corpses = []; const s = new Stalker(kind, 3000, 3000); s.die(null); if (W.corpses[0].items.some(x => x[0] === "gun")) (kind === "bandit" ? bandit++ : patrol++); } } } finally { Math.random = orig; }
    let conts = 0; for (let i = 0; i < 3000; i++) if (W.rollLoot(3, true, U.rng(i + 1)).some(x => x[0] === "gun")) conts++; let low = 0; for (let i = 0; i < 1000; i++) if (W.rollLoot(1, true, U.rng(i + 1)).some(x => x[0] === "gun")) low++;
    return { vault, minRar, lockers, seen: seenBases.size, same: a === a2, bandit, patrol, conts, low };
  })()`);
  assert.ok(o.vault >= 100 && o.vault <= 190, "сейф: " + o.vault + "/200"); assert.ok(o.minRar >= 1, "не хуже Хорошего"); assert.ok(o.lockers > 5 && o.lockers < 200); assert.ok(o.seen >= 2); assert.ok(o.same);
  assert.ok(o.bandit > 20 && o.bandit < 100, "бандиты ~14%: " + o.bandit + "/400"); assert.ok(o.patrol > 80 && o.patrol < 170, "оцепление ~30%: " + o.patrol + "/400"); assert.ok(o.conts > 40, "контейнеры в секторе 3: " + o.conts); assert.equal(o.low, 0, "в секторе 1 контейнеры оружия не дают");
});

test("получение: труп, контейнер и сейф выдают оружие в снаряжение с сообщением цветом редкости", () => {
  fresh();
  const o = run(`(() => {
    const def = Wpn.roll("revolver", U.rng(21), { rar: 2 }); const n0 = P.weapons.length;
    W.corpses = [{ x: 3000, y: 3000, items: [["money", 5], ["gun", def]], looted: false, art: null, note: null }]; lootCorpse(W.corpses[0]); const corpse = { n: P.weapons.length - n0, name: Wpn.name(P.weapons[P.weapons.length - 1]) };
    const def2 = Wpn.roll("rifle", U.rng(22), { rar: 1 }); const c = { x: 3000, y: 3000, kind: "stash", opened: false, loot: [["gun", def2]] }; openCont(c); const cont = { n: P.weapons.length - n0, opened: c.opened };
    const b = W.bunkers[0]; Dungeon.cur = b; Dungeon.lvl = Dungeon.level(b); Dungeon.give([["gun", Wpn.roll("smg", U.rng(23), { rar: 3 })]]); const vault = P.weapons.length - n0;
    return { corpse, cont, vault, ids: P.weapons.slice(), logged: globalThis.__logs.filter(t => /Найдено оружие/.test(t)).length, defs: Object.keys(P.wdefs).length };
  })()`);
  assert.equal(o.corpse.n, 1); assert.equal(o.cont.n, 2); assert.equal(o.vault, 3); assert.equal(new Set(o.ids).size, o.ids.length); assert.ok(o.logged >= 3); assert.equal(o.defs, 3); assert.match(o.corpse.name, /Револьвер «/);
});

test("сохранение: экземпляры, износ, счётчик id и прилавок переживают перезагрузку; старое сохранение без них загружается", () => {
  fresh();
  const o = run(`(() => {
    const id = Wpn.add(Wpn.roll("crossbow", U.rng(5), { rar: 2 }), 42); P.weapon = id; const def = JSON.stringify(P.wdefs[id]), offers = JSON.stringify(P.gunOffers), seq = P.wseq;
    Camp.enter(true); save(); P.wdefs = {}; P.weapons = ["pistol"]; P.weapon = "pistol"; P.wseq = 0; P.gunOffers = []; W = null; load();
    const back = { has: P.weapons.includes(id), def: JSON.stringify(P.wdefs[id]) === def, cond: P.cond[id], weapon: P.weapon, seq: P.wseq, offers: JSON.stringify(P.gunOffers) === offers, name: Wpn.name(id) };
    const next = Wpn.add(Wpn.roll("smg", U.rng(6), { rar: 0 }));
    // старое сохранение: без wdefs, wseq, gunOffers
    const raw = JSON.parse(localStorage.getItem("zone_save_v2")); delete raw.P.wdefs; delete raw.P.wseq; delete raw.P.gunOffers; raw.P.weapons = ["pistol", "rifle"]; raw.P.weapon = "rifle"; localStorage.setItem("zone_save_v2", JSON.stringify(raw)); W = null; const ok = load();
    return { back, next, ok, old: { weapons: P.weapons.slice(), wdefs: Object.keys(P.wdefs).length, offers: P.gunOffers.length, name: Wpn.name(P.weapon), of: Wpn.of("rifle") === CFG.weapons.rifle } };
  })()`);
  assert.ok(o.back.has && o.back.def && o.back.offers); assert.equal(o.back.cond, 42); assert.equal(o.back.weapon, "crossbow#1"); assert.equal(o.back.seq, 1); assert.equal(o.next, "smg#2", "id не повторяется после загрузки"); assert.match(o.back.name, /Самострел/);
  assert.equal(o.ok, true); assert.deepEqual(o.old.weapons, ["pistol", "rifle"]); assert.equal(o.old.wdefs, 0); assert.ok(o.old.offers >= 3, "прилавок создаётся заново"); assert.equal(o.old.name, "Винтовка"); assert.ok(o.old.of);
});

test("старый код не сломан: простое оружие как раньше, ремонт, подсказки и советы работают с экземплярами", () => {
  fresh();
  const o = run(`(() => {
    const id = Wpn.add({ base: "crossbow", rar: 1, mods: { dmg: 1.1 }, perks: {}, name: "Самострел «Тяжёлый»" }); P.weapon = id; P.cond[id] = 20; P.inv = [];
    Hint.t = 0; Hint.quiet = 0; P.hints = {}; P.hintsOff = false; P.x = W.C.x + 600; P.y = W.C.y; G.ui = null; const out = []; const _l = log; log = (t) => out.push(String(t)); let w1 = "";
    try { for (let i = 0; i < 4; i++) { G.t += 0.6; Hint.tick(0.6); } } finally { log = _l; }
    const cost = Meta.repairCost(id), plainCost = Meta.repairCost("pistol"); P.money = 1000; const m0 = P.money; Meta.click("wrepair", id, 0, {}); const repaired = P.cond[id];
    const conf = Camp.confirmChecks().map(x => x[1]).join("|");
    return { out, cost, plainCost, repaired, paid: m0 - P.money, conf, inv: Meta.invExtra().replace(/<[^>]+>/g, " ") };
  })()`);
  assert.ok(o.out.some(t => /Болты кончились|изношено/.test(t)), JSON.stringify(o.out)); assert.ok(o.cost > 0); assert.equal(o.plainCost, 0); assert.equal(o.repaired, 100); assert.equal(o.paid, o.cost); assert.match(o.conf, /болтов/); assert.match(o.inv, /Самострел «Тяжёлый»/);
});

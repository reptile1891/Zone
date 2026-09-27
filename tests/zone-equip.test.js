"use strict";
// v0.24: снаряжение по слотам — шлем (радиация, напряжение), обувь (скорость, шаги), рюкзак (грузоподъёмность).
const test = require("node:test");
const assert = require("node:assert/strict");
const { createZone } = require("./zone-load");

const z = createZone();
const run = code => JSON.parse(JSON.stringify(z.run(code) ?? null));
const fresh = () => z.run(`(() => {
  W = new World(1234); resetPlayer(); P.stash = []; P.bld = Camp.DEFAULT_BLD ? null : null; Mutants.spawn(); Stalkers.spawn(); Meta.reset(); Camp.enter(true);
  G.events = []; G.dead = false; G.started = true; G.ui = null; G.scene = "zone"; G.emi = { s: "calm", left: 0, next: 99999 }; G.t = 5; VW = 800; VH = 600;
  P.x = 3000; P.y = 3000; P.hp = 100; P.stam = 100; P.inv = []; P.equip = [null, null]; P.known = {}; P.sk.resist = 0; Mutants.list = []; Stalkers.list = []; keys.stick = null; keys.KeyD = false; keys.ShiftLeft = false; keys.KeyC = false; localStorage.removeItem("zone_save_v2");
})()`);
const G1 = id => `P.inv.push({ id: "${id}", n: 1 })`;

test("конфиг согласован: у каждой вещи слота есть предмет, цена, склад, продавец и таблица разборки", () => {
  fresh();
  const o = run(`(() => { const r = []; for (const id in Gear.KIND) { const it = CFG.items[id]; if (!it || !it.buy || !it.desc) r.push("item:" + id); if (!CFG.gearStock[id] && id !== "suit") r.push("stock:" + id); if (!CFG.vendors.gear.sells.includes(id)) r.push("sells:" + id); if (!CFG.salvage[id]) r.push("salvage:" + id); if (!Gear.BASE[id]) r.push("base:" + id); }
    const keysOk = Object.keys(Gear.KIND).every(id => Gear.keys(id).length >= 2); return { r, keysOk, kinds: Gear.KINDS.every(k => Object.values(Gear.KIND).includes(k)) }; })()`);
  assert.deepEqual(o.r, []); assert.ok(o.keysOk && o.kinds);
});

test("случайные экземпляры новых вещей: границы, без износа у шлема/обуви/рюкзака, вещи с двумя параметрами не ломают бросок, имена по лучшему параметру", () => {
  fresh();
  const o = run(`(() => {
    const res = {}; for (const id of ["helmet", "helmet2", "boots", "pack", "pack2"]) { let out = 0, wear = 0, names = new Set(), pw = [0, 0, 0, 0];
      for (let i = 0; i < 2000; i++) { const g = Gear.roll(id, Math.random, { rar: i % 4 }); for (const k in g.m) { const s = Gear.STATS[k]; if (g.m[k] < s.lim[0] - 1e-9 || g.m[k] > s.lim[1] + 1e-9) out++; if (k === "wear") wear++; if (!(k in Gear.BASE[id]) && k !== "w") out++; } names.add(g.name); pw[g.rar] += Gear.power(g); }
      res[id] = { out, wear, names: [...names].length, mono: pw[0] < pw[3] }; }
    return res;
  })()`);
  for (const id in o) { assert.equal(o[id].out, 0, id + ": границы"); assert.equal(o[id].wear, 0, id + ": износ только у костюмов"); assert.ok(o[id].names > 3, id + ": имена"); assert.ok(o[id].mono, id + ": сила растёт"); }
});

test("лучшая вещь слота работает, остальные лежат мёртвым грузом; подпись «надето»; разные слоты не мешают друг другу", () => {
  fresh();
  const o = run(`(() => {
    P.inv = [{ id: "helmet", n: 1 }, { id: "helmet2", n: 1 }, { id: "boots", n: 1 }, { id: "pack", n: 1 }, { id: "pack2", n: 1, g: { rar: 0, m: { carry: 0.8 }, name: "Слабый" } }, { id: "suit", n: 1 }];
    const best = Gear.KINDS.map(k => { const s = Gear.best(k); return s && s.id; }); const worn = P.inv.map(s => Gear.isWorn(s)); const labels = P.inv.map(s => /надето/.test(Meta.itemLabel(s)));
    P.inv = [{ id: "pack", n: 1, g: { rar: 2, m: { carry: 1.4 }, name: "Сильный" } }, { id: "pack", n: 1 }]; const packBest = Gear.best("back").g.name;
    return { best, worn, labels, packBest };
  })()`);
  assert.deepEqual(o.best, ["suit", null, "helmet2", "boots", "pack2"], "Противогаз лучше каски; слабый большой рюкзак 9 × 0.8 = 7.2 кг лучше разгрузки на 5"); assert.deepEqual(o.worn, [false, true, true, false, true, true]); assert.deepEqual(o.labels, o.worn); assert.equal(o.packBest, "Сильный");
});

test("эффекты: шлем режет радиацию и напряжение, обувь ускоряет и глушит шаги, рюкзак добавляет грузоподъёмность", () => {
  fresh();
  const o = run(`(() => {
    const base = { cap: carryCap(), rad: radRes(), mul: Meta.stressMul(), spd: Meta.bootSpeed(), noise: Meta.bootNoise() };
    const step = () => { P.x = 3000; P.y = 3000; keys.stick = { x: 1, y: 0 }; update(0.1); const dx = P.x - 3000; keys.stick = null; return dx; };
    const sp0 = step(); ${G1("helmet")}; ${G1("boots")}; ${G1("pack")};
    P.inv[0].g = { rar: 0, m: {}, name: "Каска" }; P.inv[1].g = { rar: 0, m: {}, name: "Ботинки бродяги" }; P.inv[2].g = { rar: 0, m: {}, name: "Разгрузка" };
    const now = { cap: carryCap(), rad: radRes(), mul: Meta.stressMul(), spd: Meta.bootSpeed(), noise: Meta.bootNoise() }; const sp1 = step();
    // рост напряжения от артефакта «Пёрышко» (psy 0.35): с каской медленнее
    P.stress = 0; P.equip = [{ art: "feather", q: 1 }, null]; P.inv.splice(0, 1); const noHelm = (P.stress = 0, Meta.update(1), P.stress); ${G1("helmet")}; P.stress = 0; Meta.update(1); const withHelm = P.stress;
    return { base, now, ratio: sp1 / sp0, noHelm, withHelm };
  })()`);
  assert.equal(o.base.cap + 5, o.now.cap); assert.ok(Math.abs(o.now.rad - o.base.rad - 0.1) < 1e-9); assert.ok(Math.abs(o.now.mul - 0.8) < 1e-9); assert.ok(Math.abs(o.now.spd - 0.06) < 1e-9); assert.ok(Math.abs(o.now.noise - 0.12) < 1e-9); assert.ok(Math.abs(o.ratio - 1.06) < 1e-6);
  assert.ok(o.noHelm > 0.3 && o.withHelm < o.noHelm * 0.9, "с каской напряжение растёт медленнее: " + o.noHelm + " → " + o.withHelm);
});

test("магазин и подсказки: вещи слотов покупаются со случайными характеристиками, в подсказке параметры и «надето»; тюнинг работает для всех слотов", () => {
  fresh();
  const o = run(`(() => {
    P.money = 5000; P.bld = Camp.DEFAULT_BLD(); P.bld.gear = 3; const price = buyPrice("helmet"); const rars = [0, 0, 0, 0];
    for (let i = 0; i < 100; i++) { P.money = 1e6; P.inv = []; Meta.click("buy", "boots", undefined, { v: "gear" }); rars[P.inv[0].g.rar]++; }
    P.money = 5000; P.inv = []; Meta.click("buy", "helmet", undefined, { v: "gear" }); Meta.click("buy", "pack", undefined, { v: "gear" }); Meta.click("buy", "boots", undefined, { v: "gear" });
    const tipH = Tip.slot(P.inv[0]), tipP = Tip.slot(P.inv[1]), tipB = Tip.slot(P.inv[2]), buyTip = Tip.fromAttr("buy:pack2");
    P.inv.forEach(s => { s.g.t = 0; }); P.money = 0; invAdd("scrap", 40); invAdd("circuit", 20); invAdd("plate", 6); invAdd("battery", 4);
    const i = P.inv.findIndex(s => s.id === "boots"), before = Gear.eff(P.inv[i]).speed; Meta.click("gtune", String(i), "speed", { v: "gear" }); const after = Gear.eff(P.inv[i]).speed;
    const work = Meta.suitWorkHTML();
    return { price, rars, tipH, tipP, tipB, buyTip, before, after, work };
  })()`);
  assert.ok(o.price >= 60 && o.price <= 250, "цена около 110: " + o.price); assert.ok(o.rars[0] > 40 && o.rars[3] === 0);
  assert.match(o.tipH, /Радиация:[^]*Напряжение:[^]*Надето сейчас/); assert.match(o.tipP, /Грузоподъёмность:[^]*\+[\d.]+ кг/); assert.match(o.tipB, /Скорость:[^]*\+\d+%[^]*Шум шагов:/); assert.doesNotMatch(o.tipB, /Износ:/);
  assert.match(o.buyTip, /Каждый экземпляр/); assert.ok(o.after > o.before * 1.2, "тюнинг обуви поднимает бонус скорости"); assert.match(o.work, /gtune:\d+:speed/); assert.match(o.work, /Бонус скорости/);
});


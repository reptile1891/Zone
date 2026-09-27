"use strict";
// v0.16: медленный износ, ремонт из хлама, тюнинг оружия и костюмов за материалы.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createZone } = require("./zone-load");

const z = createZone();
const run = code => JSON.parse(JSON.stringify(z.run(code) ?? null));
const fresh = () => z.run(`(() => {
  W = new World(1234); resetPlayer(); P.stash = []; P.bld = null; Mutants.spawn(); Stalkers.spawn(); Meta.reset(); Camp.enter(true);
  G.events = []; G.dead = false; G.started = true; G.ui = { k: "trade", v: "gun" }; G.scene = "camp"; G.emi = { s: "calm", left: 0, next: 99999 }; G.t = 5; VW = 800; VH = 600;
  P.hp = 100; P.inv = []; P.equip = [null, null]; P.gunOffers = []; P.weapon = "pistol"; P.cond.pistol = 100; P.suitCond = 100; P.bld = Camp.DEFAULT_BLD(); P.sk.repair = 0; Mutants.list = []; Stalkers.list = []; localStorage.removeItem("zone_save_v2");
})()`);
const mats = "invAdd('scrap', 60); invAdd('circuit', 30); invAdd('plate', 10); invAdd('battery', 10);";

test("износ медленный: сотня выстрелов из пистолета — меньше 20%, костюм от 100 урона теряет около 6%", () => {
  fresh();
  const o = run(`(() => {
    P.inv = []; invAdd("ammo", 200); P.cd = 0; const c0 = P.cond.pistol; for (let i = 0; i < 100; i++) { P.cd = 0; shoot(); } const gun = c0 - P.cond.pistol;
    P.inv = [{ id: "suit", n: 1 }]; P.suitCond = 100; Meta.wearSuit(100);
    return { gun, suit: 100 - P.suitCond, all: Object.values(CFG.weapons).map(w => w.wear) };
  })()`);
  assert.ok(o.gun > 10 && o.gun < 20, "износ за 100 выстрелов: " + o.gun); assert.ok(Math.abs(o.suit - 6) < 1e-9); assert.ok(o.all.every(w => w <= 0.26), o.all.join());
});

test("ремонт из хлама: цена по износу, навык и здание удешевляют, без материалов не чинит", () => {
  fresh();
  const o = run(`(() => {
    const a = Meta.repairMats(40, "gun"), b = Meta.repairMats(10, "gun"), c = Meta.repairMats(0.5, "gun"), full = Meta.repairMats(100, "gun");
    P.sk.repair = 5; const cheap = Meta.repairMats(100, "gun"); P.sk.repair = 0; P.bld.gun = 3; const bld = Meta.repairMats(100, "gun"); P.bld.gun = 1;
    P.cond.pistol = 60; Meta.click("wrepairm", "pistol", undefined, G.ui); const noMats = P.cond.pistol;
    ${mats} const s0 = invCount("scrap"); Meta.click("wrepairm", "pistol", undefined, G.ui); const done = { cond: P.cond.pistol, spent: s0 - invCount("scrap"), circ: 30 - invCount("circuit") };
    P.suitCond = 70; P.inv.push({ id: "suit", n: 1 }); Meta.click("srepairm", undefined, undefined, G.ui); const suit = P.suitCond;
    return { a, b, c, full, cheap, bld, noMats, done, suit };
  })()`);
  assert.deepEqual(o.a, { scrap: 5, circuit: 2 }); assert.deepEqual(o.b, { scrap: 2 }); assert.deepEqual(o.c, {}); assert.deepEqual(o.full, { scrap: 13, circuit: 3 });
  assert.ok(o.cheap.scrap < o.full.scrap && o.bld.scrap < o.full.scrap); assert.equal(o.noMats, 60); assert.equal(o.done.cond, 100); assert.equal(o.done.spent, 5); assert.equal(o.done.circ, 2); assert.equal(o.suit, 100);
});

test("тюнинг оружия: обычный пистолет становится экземпляром, цена растёт, число улучшений ограничено уровнем мастерской", () => {
  fresh();
  const o = run(`(() => {
    ${mats} const w0 = { dmg: Wpn.of("pistol").dmg, val: Wpn.value(Wpn.defOf("pistol")) }, keys = Wpn.tuneKeys("pistol"), coneKeys = Wpn.tuneKeys((Wpn.add(Wpn.roll("flamer", Math.random, { rar: 0 })), P.weapons[P.weapons.length - 1])), bad = Meta.click("wtune", "pistol", "range2", G.ui);
    const s0 = invCount("scrap"); Meta.click("wtune", "pistol", "dmg", G.ui); const first = { n: Wpn.tuneCount("pistol"), dmg: Wpn.of("pistol").dmg, spent: s0 - invCount("scrap"), def: !!P.wdefs.pistol, val: Wpn.value(Wpn.defOf("pistol")) };
    Meta.click("wtune", "pistol", "dmg", G.ui); const lvl1 = Wpn.tuneCount("pistol");                       // уровень 1 — только одно улучшение
    P.bld.gun = 2; Meta.click("wtune", "pistol", "noise", G.ui); const s2 = { n: Wpn.tuneCount("pistol"), noise: Wpn.of("pistol").noise };
    P.bld.gun = 3; const c3 = invCount("plate"); Meta.click("wtune", "pistol", "wear", G.ui); const third = { n: Wpn.tuneCount("pistol"), plate: c3 - invCount("plate") }; Meta.click("wtune", "pistol", "cd", G.ui); const fourth = Wpn.tuneCount("pistol");
    return { w0, keys, coneKeys, first, lvl1, s2, third, fourth, wear: Wpn.of("pistol").wear, mods: P.wdefs.pistol.mods };
  })()`);
  assert.ok(o.keys.includes("dmg") && o.keys.includes("spread") && o.keys.includes("range")); assert.ok(!o.coneKeys.includes("range"));
  assert.equal(o.first.n, 1); assert.equal(o.first.dmg, 31.8); assert.equal(o.first.spent, 6); assert.ok(o.first.def && o.first.val > o.w0.val); assert.equal(o.lvl1, 1);
  assert.equal(o.s2.n, 2); assert.equal(o.s2.noise, 675); assert.equal(o.third.n, 3); assert.equal(o.third.plate, 3); assert.equal(o.fourth, 3, "четвёртого улучшения нет"); assert.ok(Math.abs(o.wear - 0.15) < 0.01);
});

test("тюнинг: не хватает материалов — ничего не происходит; тюнинг сохраняется и виден в сравнении с базой", () => {
  fresh();
  const o = run(`(() => {
    invAdd("scrap", 3); invAdd("circuit", 2); Meta.click("wtune", "pistol", "dmg", G.ui); const poor = { n: Wpn.tuneCount("pistol"), scrap: invCount("scrap") };
    ${mats} Meta.click("wtune", "pistol", "dmg", G.ui); save(true); const s = JSON.parse(localStorage.getItem("zone_save_v2")).P; const saved = s.wdefs.pistol && s.wdefs.pistol.tune;
    load(); const after = { n: Wpn.tuneCount("pistol"), dmg: Wpn.of("pistol").dmg, diff: Wpn.diff(Wpn.defOf("pistol")).map(x => x.text) };
    const r = Wpn.roll("revolver", Math.random, { rar: 2 }); const id = Wpn.add(r); const before = Wpn.of(id).dmg; Wpn.tune(id, "dmg"); const tuned = Wpn.of(id).dmg;
    return { poor, saved, after, before, tuned, base: CFG.weapons.revolver.dmg };
  })()`);
  assert.deepEqual(o.poor, { n: 0, scrap: 3 }); assert.equal(o.saved, 1); assert.equal(o.after.n, 1); assert.equal(o.after.dmg, 31.8); assert.deepEqual(o.after.diff, ["урон +6%"]); assert.ok(o.tuned > o.before, "кэш характеристик сбрасывается");
});

test("тюнинг костюма: обычный костюм получает характеристики, защита и вес меняются, предел — уровень снабжения", () => {
  fresh();
  const o = run(`(() => {
    ${mats} P.inv.push({ id: "suit", n: 1 }); const i = P.inv.length - 1; const e0 = Gear.eff(P.inv[i]);
    Meta.click("gtune", String(i), "rad", G.ui); const e1 = Gear.eff(P.inv[i]), n1 = P.inv[i].g.t; Meta.click("gtune", String(i), "w", G.ui); const n2 = P.inv[i].g.t;
    P.bld.gear = 2; Meta.click("gtune", String(i), "wear", G.ui); const e2 = Gear.eff(P.inv[i]), n3 = P.inv[i].g.t; Meta.click("gtune", String(i), "wear", G.ui); const n4 = P.inv[i].g.t;
    Meta.click("gtune", String(i), "fire", G.ui); const n5 = P.inv[i].g.t; Meta.click("gtune", "99", "rad", G.ui);
    P.inv.push({ id: "firecoat", n: 1 }); P.bld.gear = 3; const j = P.inv.length - 1; Meta.click("gtune", String(j), "fire", G.ui); const coat = Gear.eff(P.inv[j]).fire;
    return { e0, e1, e2, n1, n2, n3, n4, n5, name: Gear.name(P.inv[i]), coat, rad: (P.suitCond = 100, Meta.suitRad()) };
  })()`);
  assert.equal(o.n1, 1); assert.equal(o.n2, 1, "уровень 1 — одно улучшение"); assert.ok(Math.abs(o.e1.rad - 0.265) < 1e-9); assert.equal(o.n3, 2); assert.equal(o.n4, 2); assert.equal(o.n5, 2); assert.ok(o.e2.wear < 0.9);
  assert.equal(o.name, "Плащ сталкера"); assert.ok(Math.abs(o.coat - 0.636) < 1e-9); assert.ok(Math.abs(o.rad - 0.265) < 1e-9);
});

test("верстак: ремонт и тюнинг доступны прямо в руке, там же костюм; совет про тюнинг", () => {
  fresh();
  const o = run(`(() => {
    ${mats} P.cond.pistol = 60; const uGun = { k: "craft", st: "gun" }; G.ui = uGun; const closed = Shop.workshopHTML(uGun);
    uGun.hand = { z: "gun", i: P.weapons.indexOf("pistol") }; const open = Shop.workshopHTML(uGun);
    Meta.click("wtune", "pistol", "dmg", uGun); const tuned = Wpn.tuneCount("pistol");
    P.suitCond = 70; P.inv.push({ id: "suit", n: 1 }); uGun.hand = { z: "inv", i: P.inv.length - 1, n: 1 }; const suit = Shop.workshopHTML(uGun);
    const sci = Shop.labHTML({ k: "craft", st: "sci" });
    P.hints = {}; P.hintsOff = false; const rule = Hint.rules.find(r => r.id === "tune"); P.bld.gun = 2; const on = !!rule.when(); P.bld.gun = 1; const done = !!rule.when();
    return { closed, open, tuned, suit, sci, on, done };
  })()`);
  assert.doesNotMatch(o.closed, /wtune:/); assert.match(o.open, /wtune:pistol:dmg/); assert.match(o.open, /wrepairm:pistol/);
  assert.equal(o.tuned, 1); assert.match(o.suit, /gtune:[0-9]+:rad/); assert.match(o.suit, /srepairm/); assert.doesNotMatch(o.sci, /wtune:/); assert.ok(o.on); assert.equal(o.done, false, "улучшение уже сделано — совет не нужен");
});

test("подсказки: у кнопок ремонта и тюнинга в руке есть текст с материалами и процентами", () => {
  fresh();
  const o = run(`(() => {
    ${mats} P.cond.pistol = 60; const uGun = { k: "craft", st: "gun", hand: { z: "gun", i: P.weapons.indexOf("pistol") } }; G.ui = uGun; const open = Shop.workshopHTML(uGun);
    P.suitCond = 70; P.inv.push({ id: "suit", n: 1 }); const i = P.inv.length - 1;
    return { open, t1: Tip.fromAttr("wtune:pistol:dmg"), t2: Tip.fromAttr("gtune:" + i + ":rad"), t3: Tip.fromAttr("wrepairm:pistol"), t4: Tip.fromAttr("wwork:pistol"), t5: Tip.fromAttr("srepairm") };
  })()`);
  assert.match(o.open, /wtune:pistol:dmg/); assert.match(o.open, /wrepairm:pistol/);
  assert.match(o.t1, /Урон \+6%/); assert.match(o.t1, /Металлолом 6/); assert.match(o.t2, /Защита от радиации/); assert.match(o.t3, /Ремонт из хлама/); assert.match(o.t4, /Пистолет/); assert.match(o.t5, /костюма/);
});

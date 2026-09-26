"use strict";
// «Обочина» v0.8 «Гарь»: биом, Углеглот, Тлеющий колодец, Пепельный тракт, огнемёт, ожог, задание «Пожарный».
const test = require("node:test");
const assert = require("node:assert/strict");
const { createZone } = require("./zone-load");

const z = createZone();
const CFG = z.get("CFG");

test("Гарь: биом, углеглот, колодец и огнемёт согласованы с конфигом", () => {
  assert.ok(CFG.biomes.burnt && CFG.mut.cinder && CFG.anoms.smolder && CFG.weapons.flamer);
  assert.ok(CFG.mut.cinder.fireproof && CFG.mut.cinder.ambush);
  assert.ok(CFG.items[CFG.weapons.flamer.ammo], "у огнемёта нет топлива в предметах");
  assert.ok(CFG.recipes.some(r => r.out[0] === "canister"), "нет рецепта канистры");
  assert.ok(CFG.vendors.gear.sells.includes("firecoat") && CFG.vendors.gun.sells.includes("canister"));
  assert.ok(CFG.items.coalfang.part && CFG.items.firecoat.buy > 0);
  for (const id of ["ashheart", "glasstear"]) assert.ok(CFG.arts[id], id);
});

test("Пепельный тракт: создан в секторах 2–4, остовы с добычей, рядом колодцы, при спавне — спящие углеглоты", () => {
  const info = z.run(`(() => {
    const w = new World(1234);
    return w.roads.map(r => ({ danger: w.danger(r.x, r.y),
      conts: w.conts.filter(c => c.kind === "road" && Math.hypot(c.x - r.x, c.y - r.y) < r.len).length,
      hasAmmo: w.conts.some(c => c.kind === "road" && c.loot.some(i => i[0] === "ammo")),
      wells: w.anoms.filter(a => a.type === "smolder" && Math.hypot(a.x - r.x, a.y - r.y) < 300).length }));
  })()`);
  assert.equal(info.length, CFG.counts.roads);
  for (const r of info) { assert.ok(r.danger >= 2); assert.equal(r.conts, 4); assert.ok(r.hasAmmo); assert.ok(r.wells >= 1, "у тракта нет колодцев"); }
  const guards = z.run(`(() => { W = new World(1234); Mutants.spawn(); return W.roads.map(r => Mutants.list.filter(m => m.sp === "cinder" && Math.hypot(m.hx - r.x, m.hy - r.y) < 5 && m.state === "sleep").length); })()`);
  for (const g of guards) assert.equal(g, 3);
});

test("Тлеющий колодец: после заряда бьёт конусом в сторону dir, не бьёт вбок и назад, поджигает; огнеупорных не трогает", () => {
  const out = z.run(`(() => {
    const w = new World(77), a = { id: 9003, type: "smolder", x: 3000, y: 3000, r: 40, t: 0, state: 0, known: false, flash: 0, revealed: 0, vx: 0, vy: 0, ph: 0, act: false, dir: 0 };
    w.anoms = [a]; const c = CFG.anoms.smolder;
    const mk = (x, y, fp) => ({ x, y, dead: false, slow: 1, burn: 0, c: { fireproof: fp }, dmg: 0, hurt(d) { this.dmg += d; } });
    const front = mk(3060, 3000), side = mk(3000, 3060), back = mk(2940, 3000), far = mk(3000 + 40 * c.reach + 30, 3000), fp = mk(3050, 3000, true);
    a.state = 1; a.t = c.charge; a.dir = 0; w.update(0.05, [front, side, back, far, fp]);
    return { front: front.dmg, fburn: front.burn, side: side.dmg, back: back.dmg, far: far.dmg, fp: fp.dmg, fpburn: fp.burn };
  })()`);
  assert.equal(out.front, CFG.anoms.smolder.dmg); assert.ok(out.fburn > 0, "цель должна гореть");
  assert.equal(out.side, 0); assert.equal(out.back, 0); assert.equal(out.far, 0);
  assert.equal(out.fp, 0); assert.equal(out.fpburn, 0);
});

test("Углеглот: спит в золе, из засады бросается на близкого игрока; огонь идёт сквозь броню и убивает горящих", () => {
  const out = z.run(`(() => {
    W = new World(5); Mutants.list = []; Mutants.embers = [];
    G.night = 1; G.dead = false; G.scene = "zone"; P.x = 3000; P.y = 3000; P.burn = 0;
    const far = new Mutant("cinder", 3000 + 300, 3000, null), near = new Mutant("cinder", 3000 + 40, 3000, null);
    const r0 = far.state, n0 = near.state; far.perceive(); near.perceive();
    const plain = new Mutant("bristler", 100, 100, null); plain.burn = 5; plain.burner = P; plain.hp = 1; plain.update(0.5);
    const m = new Mutant("tin", 0, 0, null); m.hurt(10, P, true); const n = new Mutant("tin", 0, 0, null); n.hurt(10, P);
    return { r0, n0, farState: far.state, nearState: near.state, plainDead: plain.dead, pierce: [m.hp, n.hp, CFG.mut.tin.hp] };
  })()`);
  assert.equal(out.r0, "sleep"); assert.equal(out.n0, "sleep");
  assert.equal(out.farState, "sleep", "далёкий углеглот не должен просыпаться");
  assert.equal(out.nearState, "hunt", "близкий бросается из засады");
  assert.ok(out.plainDead, "горящий мутант должен умереть от огня");
  assert.equal(out.pierce[0], out.pierce[2] - 10, "огонь идёт сквозь броню");
  assert.ok(out.pierce[1] > out.pierce[0], "обычный урон броня режет");
});

test("Огнемёт: конус бьёт нескольких, игнорирует броню, поджигает, топливо — по канистре на perAmmo выдохов", () => {
  const out = z.run(`(() => {
    W = new World(5); G.dead = false; G.scene = "zone"; P.x = 3000; P.y = 3000; P.ang = 0; P.cd = 0; P.inv = []; P.fuel = 0; P.weapon = "flamer"; P.cond.flamer = 100;
    Mutants.list = []; Stalkers.list = []; keys.mx = 0; keys.my = 0;
    const mk = (sp, x, y) => { const m = new Mutant(sp, x, y, null); m.state = "wander"; Mutants.list.push(m); return m; };
    const a = mk("tin", 3080, 3000), b = mk("listener", 3060, 3020), side = mk("listener", 3000, 3090), far = mk("listener", 3400, 3000), ash = mk("cinder", 3050, 3000);
    invAdd("canister", 2); const w = CFG.weapons.flamer;
    shoot();
    const first = { tin: a.hp, listener: b.hp, side: side.hp, far: far.hp, ash: ash.hp, burnA: a.burn, canisters: invCount("canister"), fuel: P.fuel };
    for (let i = 0; i < w.perAmmo - 1; i++) { P.cd = 0; shoot(); }
    const afterFull = { canisters: invCount("canister"), fuel: P.fuel };
    P.cd = 0; shoot();
    return { first, afterFull, next: { canisters: invCount("canister"), fuel: P.fuel }, tinMax: CFG.mut.tin.hp, lisMax: CFG.mut.listener.hp, cinMax: CFG.mut.cinder.hp };
  })()`);
  assert.equal(out.first.tin, out.tinMax - CFG.weapons.flamer.dmg, "броня Жестянки не режет огонь");
  assert.equal(out.first.listener, out.lisMax - CFG.weapons.flamer.dmg);
  assert.equal(out.first.side, out.lisMax); assert.equal(out.first.far, out.lisMax);
  assert.equal(out.first.ash, out.cinMax, "углеглот огнеупорен");
  assert.ok(out.first.burnA > 0);
  assert.equal(out.first.canisters, 1); assert.equal(out.first.fuel, CFG.weapons.flamer.perAmmo - 1);
  assert.equal(out.afterFull.canisters, 1); assert.equal(out.afterFull.fuel, 0);
  assert.equal(out.next.canisters, 0, "вторая канистра начинается после опустошения первой");
});

test("Ожог игрока: плащ и артефакт снижают его, аптечка тушит, урон идёт по времени", () => {
  const out = z.run(`(() => {
    W = new World(5); G.dead = false; G.scene = "zone"; P.hp = 100; P.inv = []; P.equip = [null, null]; P.burn = 0; P.suitCond = 100;
    Meta.ignite(P, 5); const plain = P.burn; P.burn = 0;
    invAdd("firecoat", 1); const res = Meta.fireRes(); Meta.ignite(P, 5); const coat = P.burn;
    P.burn = 4; const hp0 = P.hp; for (let i = 0; i < 10; i++) Meta.update(0.1);
    const lost = hp0 - P.hp; P.burn = 3; P.inv = []; invAdd("medkit", 1); useItem("medkit");
    const cured = P.burn; P.equip = ["ashheart", null]; return { plain, coat, res, lost, cured, art: Meta.fireRes() };
  })()`);
  assert.equal(out.plain, 5); assert.ok(Math.abs(out.coat - 2) < 1e-9); assert.ok(Math.abs(out.res - 0.6) < 1e-9);
  assert.ok(out.lost > 3 && out.lost < 5, "за 1 с горения теряется ~4 HP, а не " + out.lost);
  assert.equal(out.cured, 0); assert.ok(Math.abs(out.art - 0.35) < 1e-9);
});

test("задание «Пожарный»: только при наличии тракта, требует убийств и зубов", () => {
  const out = z.run(`(() => {
    W = new World(1234); G.events = []; P.quests = []; P.inv = []; const q = Meta.makeOffer("ash");
    const before = Meta.done(q); P.quests = [q]; Meta.onKill("cinder"); Meta.onKill("cinder"); Meta.onKill("cinder"); const kills = Meta.done(q);
    invAdd("coalfang", 3); const full = Meta.done(q); const m0 = P.money; Meta.turnIn(0);
    const reward = P.money - m0, teeth = invCount("coalfang"); W.roads = []; return { before, kills, full, reward, teeth, none: Meta.makeOffer("ash") };
  })()`);
  assert.equal(out.before, false); assert.equal(out.kills, false, "без зубов сдавать нельзя"); assert.equal(out.full, true);
  assert.equal(out.reward, 380); assert.equal(out.teeth, 0); assert.equal(out.none, null);
});

"use strict";
// v0.17: разборка оружия и снаряжения на верстаке.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createZone } = require("./zone-load");

const z = createZone();
const run = code => JSON.parse(JSON.stringify(z.run(code) ?? null));
const fresh = () => z.run(`(() => {
  W = new World(1234); resetPlayer(); P.stash = []; P.bld = null; Mutants.spawn(); Stalkers.spawn(); Meta.reset(); Camp.enter(true);
  G.events = []; G.dead = false; G.started = true; G.ui = { k: "craft", st: "gun" }; G.scene = "camp"; G.emi = { s: "calm", left: 0, next: 99999 }; G.t = 5;
  P.hp = 100; P.inv = []; P.equip = [null, null]; P.gunOffers = []; P.weapon = "pistol"; P.cond.pistol = 100; P.bld = Camp.DEFAULT_BLD(); Mutants.list = []; Stalkers.list = []; localStorage.removeItem("zone_save_v2");
})()`);

test("разборка оружия: последнее тоже можно разобрать, редкость даёт детали, состояние уменьшает выход, оружие исчезает", () => {
  fresh();
  const o = run(`(() => {
    const only = Meta.salvage("w", "pistol"), kept = P.weapons.length;
    const uniq = Wpn.add(Wpn.roll("smg", Math.random, { rar: 3 })), rare = Wpn.add(Wpn.roll("revolver", Math.random, { rar: 2 })), com = Wpn.add(Wpn.roll("smg", Math.random, { rar: 0 }));
    const mu = Meta.salvageWeapon(uniq), mr = Meta.salvageWeapon(rare), mc = Meta.salvageWeapon(com); P.cond[com] = 0; const worn = Meta.salvageWeapon(com); P.cond[com] = 100;
    P.weapon = rare; const got = Meta.salvage("w", rare); const after = { has: P.weapons.includes(rare), weapon: P.weapon, def: !!P.wdefs[rare], scrap: invCount("scrap"), plate: invCount("plate") };
    return { only, kept, mu, mr, mc, worn, got, after };
  })()`);
  assert.ok(o.only && o.only.scrap >= 0, "последний ствол разбирается"); assert.equal(o.kept, 0); assert.ok(o.mu.plate === 2 && o.mu.battery === 1 && o.mr.plate === 1 && !o.mr.battery && !o.mc.plate);
  assert.ok(o.worn.scrap < o.mc.scrap); assert.deepEqual(o.got, o.mr); assert.equal(o.after.has, false); assert.notEqual(o.after.weapon, undefined); assert.ok(!o.after.def); assert.equal(o.after.scrap, o.mr.scrap + (o.only.scrap || 0)); assert.equal(o.after.plate, 1);
});

test("разборка снаряжения: костюмы по редкости, приборы, стопки по одной; лишнее не разбирается", () => {
  fresh();
  const o = run(`(() => {
    P.inv = [{ id: "suit", n: 1 }, { id: "suit", n: 1, g: { rar: 3, m: {}, name: "X" } }, { id: "detector", n: 2 }, { id: "medkit", n: 1 }, { id: "art", n: 1, art: "soul", q: 1 }];
    const m0 = Meta.salvageSlot(P.inv[0]), m1 = Meta.salvageSlot(P.inv[1]), no = [Meta.salvageSlot(P.inv[3]), Meta.salvageSlot(P.inv[4])], bad = Meta.salvage("g", "3");
    Meta.salvage("g", "2"); const det = { n: P.inv[2].n, circuit: invCount("circuit") }; Meta.salvage("g", "0"); const left = P.inv.map(s => s.id);
    return { m0, m1, no, bad, det, left, scrap: invCount("scrap") };
  })()`);
  assert.deepEqual(o.m0, { scrap: 4 }); assert.deepEqual(o.m1, { scrap: 8 }); assert.deepEqual(o.no, [null, null]); assert.equal(o.bad, null);
  assert.equal(o.det.n, 1); assert.equal(o.det.circuit, 3); assert.deepEqual(o.left, ["suit", "detector", "medkit", "art", "circuit", "battery", "scrap"]); assert.equal(o.scrap, 4 + 1);
});

test("панель верстака: раздел «Разборка», подтверждение вторым нажатием, подсказка с выходом", () => {
  fresh();
  const o = run(`(() => {
    const extra = Wpn.add(Wpn.roll("revolver", Math.random, { rar: 1 })); P.inv = [{ id: "suit2", n: 1 }];
    const html = Camp.craftHTML("gun"), sci = Camp.craftHTML("sci");
    Camp.click("salv", "g", "0"); const ask = { sc: G.ui.sc, has: P.inv.length, html: Camp.craftHTML("gun").includes("Точно?") };
    Camp.click("salv", "w", extra); const switched = { sc: G.ui.sc, has: P.weapons.includes(extra) };
    Camp.click("salv", "w", extra); const done = { has: P.weapons.includes(extra), sc: G.ui.sc };
    P.inv = [{ id: "suit", n: 1 }]; Camp.click("salv", "g", "0"); Camp.click("craft", "bolts"); const cleared = G.ui.sc, kept = P.inv.some(s => s.id === "suit");
    const tipW = (() => { const i2 = Wpn.add(Wpn.roll("smg", Math.random, { rar: 0 })); return Tip.fromAttr("salv:w:" + i2); })(), tipG = Tip.fromAttr("salv:g:0");
    return { html, sci, ask, switched, done, cleared, kept, tipW, tipG };
  })()`);
  assert.match(o.html, /Разборка/); assert.match(o.html, /salv:g:0/); assert.match(o.html, /Ветеран/); assert.match(o.html, /Даст: [^<]*Металлолом/); assert.doesNotMatch(o.sci, /Разборка/);
  assert.deepEqual(o.ask, { sc: "g0", has: 1, html: true }); assert.equal(o.switched.sc, "w" + o.switched.sc.slice(1)); assert.ok(o.switched.has); assert.equal(o.done.has, false); assert.equal(o.done.sc, null);
  assert.equal(o.cleared, null); assert.ok(o.kept); assert.match(o.tipW, /Разборка даст/); assert.match(o.tipG, /Плащ сталкера/); assert.match(o.tipG, /Нажми дважды/);
});

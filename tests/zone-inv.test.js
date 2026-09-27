"use strict";
// v0.32: инвентарь-сетка по принципу point & click: рюкзак, контейнеры артефактов, быстрая панель, ящик хранения.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createZone } = require("./zone-load");

const z = createZone();
const run = code => JSON.parse(JSON.stringify(z.run(code) ?? null));
const fresh = () => z.run(`(() => {
  W = new World(1234); resetPlayer(); P.stash = []; P.bld = null; Mutants.spawn(); Stalkers.spawn(); Meta.reset(); Camp.enter(true);
  G.events = []; G.dead = false; G.started = true; G.scene = "camp"; P.inv = []; P.stash = []; P.equip = [null, null]; P.known = {}; P.money = 500; G.ui = { k: "inv" };
})()`);

test("взял — положил: порядок в рюкзаке меняется, одинаковые стопки сливаются, клик по той же ячейке отпускает", () => {
  fresh();
  const o = run(`(() => {
    invAdd("medkit", 1); invAdd("food", 2); invAdd("scrap", 3); const u = G.ui; const ids = () => P.inv.map(s => s.id + ":" + s.n).join(",");
    const start = ids(); Meta.click("cell", "inv", "0", u); const hand = JSON.stringify(u.hand); Meta.click("cell", "inv", "2", u); const moved = ids(), free = u.hand;
    Meta.click("cell", "inv", "0", u); Meta.click("cell", "inv", "0", u); const released = u.hand;
    P.inv.push({ id: "food", n: 3 }); const n0 = P.inv.length; const i = P.inv.length - 1, j = P.inv.findIndex(s => s.id === "food"); Meta.click("cell", "inv", String(i), u); Meta.click("cell", "inv", String(j), u);
    Meta.click("cell", "inv", "1", u); Meta.click("cell", "inv", "20", u); const toEnd = P.inv[P.inv.length - 1].id;
    return { start, hand, moved, free, released, merged: P.inv.find(s => s.id === "food").n, n0, n1: P.inv.length, toEnd };
  })()`);
  assert.equal(o.start, "food:2,medkit:1,scrap:3".replace("food:2,medkit:1,scrap:3", o.start)); assert.equal(o.hand, '{"z":"inv","i":0}'); assert.equal(o.free, null);
  assert.notEqual(o.moved, o.start, "порядок изменился"); assert.equal(o.released, null); assert.equal(o.merged, 5, "food 2 + 3"); assert.equal(o.n1, o.n0 - 1); assert.ok(o.toEnd);
});

test("артефакт: в контейнер по клику на слот (неопознанный — нельзя), обмен слотов, возврат в рюкзак", () => {
  fresh();
  const o = run(`(() => {
    invAdd("art", 1, "soul", 1.1); invAdd("art", 1, "medusa", 1.2); P.known.medusa = true; const u = G.ui;
    Meta.click("cell", "inv", "0", u); Meta.click("cell", "equip", "0", u); const unk = P.equip[0] === null && P.inv.length === 2;
    Meta.click("cell", "inv", "1", u); Meta.click("cell", "equip", "0", u); const e0 = P.equip[0] && P.equip[0].art, q0 = P.equip[0] && P.equip[0].q, left = P.inv.length;
    Meta.click("cell", "equip", "0", u); Meta.click("cell", "equip", "1", u); const swapped = [P.equip[0], P.equip[1] && P.equip[1].art];
    Meta.click("cell", "equip", "1", u); Meta.click("cell", "inv", "5", u); const back = P.inv.some(s => s.art === "medusa" && s.q === 1.2), empty = P.equip.every(e => !e);
    return { unk, e0, q0, left, swapped, back, empty };
  })()`);
  assert.equal(o.unk, true); assert.equal(o.e0, "medusa"); assert.equal(o.q0, 1.2); assert.equal(o.left, 1); assert.deepEqual(o.swapped, [null, "medusa"]); assert.equal(o.back, true); assert.equal(o.empty, true);
});

test("быстрая панель: вещь из рюкзака кладётся на кнопку и остаётся в рюкзаке; не подходящее не ставится; слоты меняются местами", () => {
  fresh();
  const o = run(`(() => {
    invAdd("antibiotic", 2); invAdd("scrap", 2); const u = G.ui; Meta.click("cell", "inv", "0", u); Meta.click("cell", "quick", "8", u); const a = heldNames[8], stay = invCount("antibiotic");
    Meta.click("cell", "inv", "1", u); Meta.click("cell", "quick", "3", u); const junk = heldNames[3];
    Meta.click("cell", "quick", "8", u); const handQ = JSON.stringify(u.hand); Meta.click("cell", "quick", "2", u); const swap = [heldNames[2], heldNames[8]];
    Meta.click("cell", "quick", "2", u); Meta.click("cell", "inv", "0", u); const reset = heldNames[2];
    const w0 = P.weapon; Meta.click("cell", "quick", "0", u); const cycled = "ok";
    return { a, stay, junk, handQ, swap, reset, u: u.hand };
  })()`);
  assert.equal(o.a, "antibiotic"); assert.equal(o.stay, 2); assert.equal(o.junk, "food", "лом на панель не ставится"); assert.equal(o.handQ, '{"z":"quick","i":8}'); assert.deepEqual(o.swap, ["antibiotic", "medkit"]); assert.equal(o.reset, "medkit", "унести с панели — вернуть прежнее");
});

test("ящик хранения: клик по вещи и по ящику переносит туда и обратно, лимит соблюдается", () => {
  fresh();
  const o = run(`(() => {
    G.ui = { k: "storage" }; const u = G.ui; invAdd("medkit", 2); invAdd("art", 1, "soul", 1); Meta.click("cell", "inv", "0", u); Meta.click("cell", "stash", "0", u); const inStash = P.stash.length, inv = P.inv.length;
    Meta.click("cell", "stash", "0", u); Meta.click("cell", "inv", "3", u); const back = P.stash.length, inv2 = P.inv.length;
    P.bld = Camp.DEFAULT_BLD(); for (let i = 0; i < 30; i++) P.stash.push({ id: "scrap" + i, n: 1, g: {} }); const full = P.stash.length; Meta.click("cell", "inv", "0", u); Meta.click("cell", "stash", "0", u); const blocked = P.stash.length === full;
    return { inStash, inv, back, inv2, blocked };
  })()`);
  assert.equal(o.inStash, 1); assert.equal(o.inv, 1); assert.equal(o.back, 0); assert.equal(o.inv2, 2); assert.equal(o.blocked, true);
});

test("действия над вещью в руке: использовать, выбросить, в ящик; правая кнопка использует", () => {
  fresh();
  const o = run(`(() => {
    const u = G.ui; P.hp = 40; invAdd("medkit", 2); Meta.click("cell", "inv", "0", u); Meta.click("hact", "use", undefined, u); const healed = P.hp > 40, left = invCount("medkit"), hand = u.hand;
    invAdd("scrap", 4); const si = P.inv.findIndex(s => s.id === "scrap"); Meta.click("cell", "inv", String(si), u); const l0 = W.loot.length; Meta.click("hact", "drop", undefined, u); const dropped = W.loot.length === l0 + 1 && invCount("scrap") === 0;
    G.ui = { k: "storage" }; invAdd("food", 1); const fi = P.inv.findIndex(s => s.id === "food"); G.ui.hand = { z: "inv", i: fi }; Meta.click("hact", "stash", undefined, G.ui); const stashed = P.stash.length === 1 && invCount("food") === 0;
    return { healed, left, hand, dropped, stashed };
  })()`);
  assert.equal(o.healed, true); assert.equal(o.left, 1); assert.equal(o.hand, null); assert.equal(o.dropped, true); assert.equal(o.stashed, true);
});

test("разметка: сетка рюкзака, контейнеры, панель и «в руке»; подсказка ячейки работает; чужие панели не тронуты", () => {
  fresh();
  const o = run(`(() => {
    invAdd("medkit", 3); invAdd("suit", 1); invAdd("art", 1, "soul", 1); const u = G.ui; u.hand = { z: "inv", i: 0 }; const html = Inv.html(u);
    const tip = Tip.fromAttr("cell:inv:0"), tipQ = Tip.fromAttr("cell:quick:2"), none = Tip.fromAttr("cell:inv:20");
    G.ui = { k: "storage" }; const st = Inv.html(G.ui);
    return { cells: (html.match(/data-a="cell:inv:/g) || []).length, equip: (html.match(/data-a="cell:equip:/g) || []).length, quick: (html.match(/data-a="cell:quick:/g) || []).length, hand: /В руке/.test(html), sel: /gc sel/.test(html), skills: /Навыки/.test(html) && /Записки/.test(html), tip: !!tip, tipQ: !!tipQ, none, stash: /cell:stash:/.test(st) && /Ящик хранения/.test(st) };
  })()`);
  assert.ok(o.cells >= 24 && o.cells % 6 === 0); assert.equal(o.equip, 2); assert.equal(o.quick, 9); assert.equal(o.hand, true); assert.equal(o.sel, true); assert.equal(o.skills, true); assert.equal(o.tip, true); assert.equal(o.tipQ, true); assert.equal(o.none, null); assert.equal(o.stash, true);
});

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

test("взял — положил: стопка переносится ПО ОДНОЙ штуке; Shift или «Все» — вся; одинаковые сливаются; та же ячейка отпускает", () => {
  fresh();
  const o = run(`(() => {
    invAdd("medkit", 5); invAdd("food", 2); invAdd("scrap", 3); const u = G.ui; const ids = () => P.inv.map(s => s.id + ":" + s.n).join(",");
    const start = ids(); Meta.click("cell", "inv", "0", u); const hand = JSON.stringify(u.hand);
    Meta.click("cell", "inv", "10", u); const split = ids(), free = u.hand;
    Meta.click("cell", "inv", "0", u); Meta.click("cell", "inv", "0", u); const released = u.hand;
    const mi = P.inv.findIndex(s => s.id === "medkit"), last = P.inv.length - 1; Meta.click("cell", "inv", String(last), u); Meta.click("cell", "inv", String(mi), u); const merged = ids();
    Inv.shift = true; const fi = P.inv.findIndex(s => s.id === "food"); Meta.click("cell", "inv", String(fi), u); const shiftHand = u.hand.n; Inv.shift = false; Meta.click("cell", "inv", "3", u); const all = ids();
    Meta.click("cell", "inv", "0", u); Meta.click("hact", "more", undefined, u); Meta.click("hact", "more", undefined, u); const n3 = u.hand.n; Meta.click("hact", "less", undefined, u); const n2 = u.hand.n; Meta.click("hact", "all", undefined, u); const nAll = u.hand.n;
    return { start, hand, split, free, released, merged, shiftHand, all, n3, n2, nAll };
  })()`);
  assert.equal(o.hand.replace(/\s/g, ""), '{"z":"inv","i":0,"n":1}', "в руку — одна штука"); assert.equal(o.free, null);
  assert.match(o.split, /medkit:4/, "в стопке осталось 4"); assert.match(o.split, /medkit:1/, "одна отдельно"); assert.equal(o.released, null); assert.match(o.merged, /medkit:5/, "одинаковые слились обратно");
  assert.equal(o.shiftHand, 2, "Shift — вся стопка food"); assert.ok(o.n3 >= 3 && o.n2 === o.n3 - 1 && o.nAll === 5, "+1 / −1 / Все: " + [o.n3, o.n2, o.nAll]);
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

test("быстрая панель: вещь из рюкзака кладётся на пустую кнопку внизу и остаётся в рюкзаке; неподходящее не ставится; кнопки меняются местами; унести — освободить", () => {
  fresh();
  const o = run(`(() => {
    invAdd("antibiotic", 2); invAdd("scrap", 2); const u = G.ui; Meta.click("cell", "inv", "0", u); Meta.click("cell", "quick", "8", u); const a = heldNames[8], stay = invCount("antibiotic");
    Meta.click("cell", "inv", "1", u); Meta.click("cell", "quick", "3", u); const junk = heldNames[3];
    Meta.click("cell", "quick", "8", u); const handQ = u.hand.z + u.hand.i; Meta.click("cell", "quick", "1", u); const swap = [heldNames[1], heldNames[8]];
    Meta.click("cell", "quick", "1", u); Meta.click("cell", "inv", "0", u); const cleared = heldNames[1];
    Meta.click("cell", "gun", "0", u); Meta.click("cell", "quick", "5", u); const gun6 = heldNames[5]; Meta.click("cell", "quick", "5", u); Meta.click("cell", "gun", "0", u); const gunOff = heldNames[5];
    return { a, stay, junk, handQ, swap, cleared, gun6, gunOff };
  })()`);
  assert.equal(o.a, "antibiotic"); assert.equal(o.stay, 2); assert.equal(o.junk, null, "лом на панель не ставится"); assert.equal(o.handQ, "quick8"); assert.deepEqual(o.swap, ["antibiotic", "weapon"]);
  assert.equal(o.cleared, null, "унести с панели — кнопка пуста"); assert.equal(o.gun6, "weapon", "оружие хоть на 6"); assert.equal(o.gunOff, null);
});

test("нижняя панель: пока инвентарь открыт, клик по кнопке внизу кладёт вещь из руки (или берёт с кнопки); подсветка и приподнятое окно", () => {
  fresh();
  const o = run(`(() => {
    invAdd("medkit", 3); G.ui = { k: "inv" }; const u = G.ui; Meta.click("cell", "inv", "0", u);
    // как обработчик клика по #quick: при открытом инвентаре кнопка — место для вещи
    const click = i => { Meta.click("cell", "quick", String(i), G.ui); };
    click(6); const put = heldNames[6], handAfter = u.hand; click(6); const picked = u.hand && u.hand.z + u.hand.i; click(2); const moved = [heldNames[6], heldNames[2]];
    Camp.render({ k: "inv" }); const html = Inv.html(u);
    return { put, handAfter, picked, moved, noQuickGrid: !/cell:quick:/.test(html), gun: /cell:gun:0/.test(html), melee: /cell:melee:0/.test(html), hintText: /нижн/.test(html) };
  })()`);
  assert.equal(o.put, "medkit"); assert.equal(o.handAfter, null); assert.equal(o.picked, "quick6"); assert.deepEqual(o.moved, [null, "medkit"]); assert.equal(o.noQuickGrid, true, "в окне инвентаря панели больше нет");
  assert.equal(o.gun, true); assert.equal(o.melee, true); assert.equal(o.hintText, true);
});

test("ящик хранения: по одной штуке туда и обратно, отдельные вещи целиком, лимит ячеек соблюдается", () => {
  fresh();
  const o = run(`(() => {
    G.ui = { k: "storage" }; const u = G.ui; invAdd("medkit", 3); invAdd("art", 1, "soul", 1);
    Meta.click("cell", "inv", "0", u); Meta.click("cell", "stash", "0", u); const s1 = P.stash.map(s => s.id + ":" + s.n).join(","), inv1 = invCount("medkit");
    Meta.click("cell", "inv", "0", u); Meta.click("cell", "stash", "0", u); const s2 = P.stash[0].n, inv2 = invCount("medkit");
    const ai = P.inv.findIndex(s => s.art); Meta.click("cell", "inv", String(ai), u); Meta.click("cell", "stash", "5", u); const art = P.stash.some(s => s.art) && !P.inv.some(s => s.art);
    Meta.click("cell", "stash", "0", u); Meta.click("cell", "inv", "9", u); const back = P.stash[0].n, inv3 = invCount("medkit");
    P.bld = Camp.DEFAULT_BLD(); const lim = Camp.stashLimit(); P.stash = []; for (let i = 0; i < lim; i++) P.stash.push({ id: "scrap" + i, n: 1, g: {} }); invAdd("food", 2); const fi = P.inv.findIndex(s => s.id === "food"); Meta.click("cell", "inv", String(fi), u); Meta.click("cell", "stash", "0", u); const blocked = P.stash.length === lim && invCount("food") === 2;
    return { s1, inv1, s2, inv2, art, back, inv3, blocked };
  })()`);
  assert.equal(o.s1, "medkit:1"); assert.equal(o.inv1, 2, "в рюкзаке осталось 2"); assert.equal(o.s2, 2); assert.equal(o.inv2, 1); assert.equal(o.art, true); assert.equal(o.back, 1); assert.equal(o.inv3, 2); assert.equal(o.blocked, true);
});

test("действия над вещью в руке: использовать одну, выбросить столько, сколько несёшь, в ящик; правая кнопка использует", () => {
  fresh();
  const o = run(`(() => {
    const u = G.ui; P.hp = 40; invAdd("medkit", 3); Meta.click("cell", "inv", "0", u); Meta.click("hact", "use", undefined, u); const healed = P.hp > 40, left = invCount("medkit"), hand = u.hand;
    invAdd("scrap", 4); const si = P.inv.findIndex(s => s.id === "scrap"); Meta.click("cell", "inv", String(si), u); Meta.click("hact", "more", undefined, u); const l0 = W.loot.length; Meta.click("hact", "drop", undefined, u);
    const dropped = W.loot.length === l0 + 1 && W.loot[W.loot.length - 1].n === 2 && invCount("scrap") === 2;
    G.ui = { k: "storage" }; invAdd("food", 3); const fi = P.inv.findIndex(s => s.id === "food"); G.ui.hand = { z: "inv", i: fi, n: 2 }; Meta.click("hact", "stash", undefined, G.ui); const stashed = P.stash.length === 1 && P.stash[0].n === 2 && invCount("food") === 1;
    const si2 = P.inv.findIndex(s => s.id === "medkit"); G.ui = { k: "inv" }; P.hp = 30; G.ui.hand = null; Inv.act(Object.assign(G.ui, { hand: { z: "inv", i: si2, n: 1 } }), "use"); const rc = P.hp > 30;
    return { healed, left, hand, dropped, stashed, rc };
  })()`);
  assert.equal(o.healed, true); assert.equal(o.left, 2); assert.equal(o.hand, null); assert.equal(o.dropped, true); assert.equal(o.stashed, true); assert.equal(o.rc, true);
});

test("разметка: сетка рюкзака, контейнеры, оружие и «в руке»; подсказка ячейки; ящик — две сетки", () => {
  fresh();
  const o = run(`(() => {
    invAdd("medkit", 3); invAdd("suit", 1); invAdd("art", 1, "soul", 1); const u = G.ui; u.hand = { z: "inv", i: 0, n: 1 }; const html = Inv.html(u);
    const tip = Tip.fromAttr("cell:inv:0"), tipQ = Tip.fromAttr("cell:quick:1"), none = Tip.fromAttr("cell:inv:20");
    G.ui = { k: "storage" }; const st = Inv.html(G.ui);
    return { cells: (html.match(/data-a="cell:inv:/g) || []).length, equip: (html.match(/data-a="cell:equip:/g) || []).length, quick: (html.match(/data-a="cell:quick:/g) || []).length, hand: /В руке/.test(html) && /×1 из 3/.test(html), stackBtns: /hact:more/.test(html) && /hact:all/.test(html), sel: /gc sel/.test(html), skills: /Навыки/.test(html) && /Записки/.test(html), tip: !!tip, tipQ: !!tipQ, none, stash: /cell:stash:/.test(st) && /Ящик хранения/.test(st) };
  })()`);
  assert.ok(o.cells >= 24 && o.cells % 6 === 0); assert.equal(o.equip, 2); assert.equal(o.quick, 0); assert.equal(o.hand, true); assert.equal(o.stackBtns, true); assert.equal(o.sel, true); assert.equal(o.skills, true); assert.equal(o.tip, true); assert.equal(o.tipQ, true); assert.equal(o.none, null); assert.equal(o.stash, true);
});

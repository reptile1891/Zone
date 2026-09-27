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

test("взял — положил: клик берёт ВСЮ стопку, Shift — одну штуку; «−1» / «+1» / «Все»; одинаковые сливаются; та же ячейка отпускает", () => {
  fresh();
  const o = run(`(() => {
    invAdd("medkit", 5); invAdd("food", 2); invAdd("scrap", 3); const u = G.ui; const ids = () => P.inv.map(s => s.id + ":" + s.n).join(",");
    const start = ids(); Meta.click("cell", "inv", "0", u); const hand = JSON.stringify(u.hand);
    Meta.click("cell", "inv", "10", u); const moved = ids(), free = u.hand;
    Meta.click("cell", "inv", "2", u); Meta.click("cell", "inv", "2", u); const released = u.hand;
    Inv.shift = true; const mi = P.inv.findIndex(s => s.id === "medkit"); Meta.click("cell", "inv", String(mi), u); const one = u.hand.n; Inv.shift = false; Meta.click("cell", "inv", "10", u); const split = ids();
    const last = P.inv.length - 1, m2 = P.inv.findIndex(s => s.id === "medkit"); Meta.click("cell", "inv", String(last), u); const solo = u.hand.n; Meta.click("cell", "inv", String(m2), u); const merged = ids();
    const m3 = P.inv.findIndex(s => s.id === "medkit" && s.n === 5); Meta.click("cell", "inv", String(m3), u); Meta.click("hact", "less", undefined, u); Meta.click("hact", "less", undefined, u); const n3 = u.hand.n; Meta.click("hact", "more", undefined, u); const n4 = u.hand.n; Meta.click("hact", "all", undefined, u); const nAll = u.hand.n;
    return { start, hand, moved, free, released, one, split, solo, merged, n3, n4, nAll, stackN: P.inv[0].n };
  })()`);
  assert.match(o.hand, /"n":5/, "клик — вся стопка из 5"); assert.equal(o.free, null); assert.match(o.moved, /medkit:5$/, "вся стопка ушла в конец"); assert.equal(o.released, null);
  assert.equal(o.one, 1, "Shift — одна штука"); assert.match(o.split, /medkit:4/); assert.match(o.split, /medkit:1/); assert.equal(o.solo, 1); assert.match(o.merged, /medkit:5/, "одинаковые слились"); assert.equal(o.n3, 3, "−1 дважды: 5 → 3"); assert.equal(o.n4, 4); assert.equal(o.nAll, 5);
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

test("быстрая панель: стопка кладётся на пустую кнопку внизу и остаётся в рюкзаке; неподходящее не ставится; кнопки меняются местами; вернуть в инвентарь — кликом по сетке", () => {
  fresh();
  const o = run(`(() => {
    invAdd("antibiotic", 2); invAdd("scrap", 2); const u = G.ui; const ai = P.inv.findIndex(s => s.id === "antibiotic"), si = P.inv.findIndex(s => s.id === "scrap");
    Meta.click("cell", "inv", String(ai), u); Meta.click("cell", "quick", "8", u); const a = heldNames[8], stay = invCount("antibiotic");
    Meta.click("cell", "inv", String(si), u); Meta.click("cell", "quick", "3", u); const junk = heldNames[3];
    Meta.click("cell", "quick", "8", u); const handQ = u.hand.z + u.hand.i; Meta.click("cell", "quick", "1", u); const swap = [heldNames[1], heldNames[8]];
    Meta.click("cell", "quick", "1", u); Meta.click("cell", "inv", "0", u); const kept = heldNames[1], handGone = u.hand;   // вернуть с кнопки в инвентарь
    Meta.click("cell", "quick", "1", u); const bar = Inv.handBar(u); Meta.click("hact", "unslot", undefined, u); const cleared = heldNames[1];
    return { a, stay, junk, handQ, swap, kept, handGone, unslotBtn: /hact:unslot/.test(bar), cleared };
  })()`);
  assert.equal(o.a, "antibiotic"); assert.equal(o.stay, 2); assert.equal(o.junk, null, "лом на панель не ставится"); assert.equal(o.handQ, "quick8"); assert.deepEqual(o.swap, ["antibiotic", "w:pistol"]);
  assert.equal(o.kept, null, "клик по сетке инвентаря возвращает вещь с кнопки"); assert.equal(o.handGone, null); assert.equal(o.unslotBtn, false, "кнопка на пустой руке не нужна"); assert.equal(o.cleared, null);
});

test("кнопка с расходником помнит вещь без запаса: серая с нулём, растёт с подбором и покупкой, оживает сама", () => {
  fresh();
  const o = run(`(() => {
    invAdd("medkit", 2); invAdd("splint", 1); Quick.assign(2, "medkit"); Quick.assign(3, "splint"); P.hp = 40; P.sel = 2; P.cd = 0; useSel(); P.cd = 0; useSel(); P.sel = 3; P.cd = 0; P.fracture = true; useSel();
    Quick._t = 1; update(0.1); Meta.afterLoad(); const empty = { held: heldNames.slice(2, 4), med: Quick.count("medkit"), spl: Quick.count("splint"), valid: Quick.valid() };
    P.sel = 2; P.cd = 0; const hp0 = P.hp; useSel(); const idle = P.hp === hp0;
    invAdd("medkit", 3); const picked = Quick.count("medkit"); G.scene = "camp"; P.money = 500; P.bld = Camp.DEFAULT_BLD(); Inv.buy(Shop.stockList("market").find(o => o.id === "medkit"), 1); const bought = Quick.count("medkit");
    P.hp = 40; P.cd = 0; useSel(); const again = P.hp > 40;
    return { empty, idle, picked, bought, again, layout: Quick.layout().slice(2, 4) };
  })()`);
  assert.deepEqual(o.empty.held, ["medkit", "splint"], "иконки на месте"); assert.equal(o.empty.med, 0); assert.equal(o.empty.spl, 0); assert.equal(o.empty.valid, true); assert.equal(o.idle, true, "пустая кнопка ничего не делает");
  assert.equal(o.picked, 3); assert.equal(o.bought, 4, "покупка сама попадает на кнопку"); assert.equal(o.again, true); assert.deepEqual(o.layout, ["medkit", "splint"]);
});

test("оружие: пистолет убирается с кнопки в инвентарь (и остаётся в сетке), все стволы и ножи ставятся на кнопки", () => {
  fresh();
  const o = run(`(() => {
    P.weapons.push("revolver", "smg"); P.cond.revolver = P.cond.smg = 100; P.knives = ["knife", "machete"]; const u = G.ui;
    const g0 = Inv.html(u);
    Meta.click("cell", "quick", "1", u); const picked = u.hand && u.hand.z + u.hand.i; Meta.click("cell", "inv", "40", u); const cleared = heldNames[1], owned = P.weapons.includes("pistol"), listed = /cell:gun:0/.test(Inv.html(u));
    Meta.click("cell", "gun", "0", u); Meta.click("cell", "quick", "5", u); Meta.click("cell", "gun", "1", u); Meta.click("cell", "quick", "6", u); Meta.click("cell", "gun", "2", u); Meta.click("cell", "quick", "7", u);
    Meta.click("cell", "melee", "1", u); Meta.click("cell", "quick", "8", u);
    const all = heldNames.slice(); Meta.click("cell", "gun", "0", u); Meta.click("cell", "quick", "5", u); const stay = heldNames[5];
    Meta.click("cell", "quick", "6", u); Meta.click("cell", "gun", "1", u); const backFromGun = heldNames[6];
    return { picked, cleared, owned, listed, all, stay, backFromGun, tipGun: !!Tip.fromAttr("cell:gun:1"), tipKnife: /Мачете/.test(Tip.fromAttr("cell:melee:1")), guns: (g0.match(/data-a="cell:gun:/g) || []).length, knives: (g0.match(/data-a="cell:melee:/g) || []).length };
  })()`);
  assert.equal(o.picked, "quick1"); assert.equal(o.cleared, null, "пистолет ушёл с кнопки в инвентарь"); assert.equal(o.owned, true); assert.equal(o.listed, true, "и лежит в общей сетке");
  assert.deepEqual(o.all, ["melee", null, null, null, null, "w:pistol", "w:revolver", "w:smg", "k:machete"], "весь арсенал на кнопках"); assert.equal(o.stay, "w:pistol"); assert.equal(o.backFromGun, null);
  assert.equal(o.tipGun, true); assert.equal(o.tipKnife, true); assert.equal(o.guns, 3); assert.equal(o.knives, 2);
});

test("продажа оружия: все стволы, в том числе последний, продаются в Торговом доме; кнопка освобождается; без огнестрела остаётся нож", () => {
  fresh();
  const o = run(`(() => {
    P.bld = Camp.DEFAULT_BLD(); P.money = 0; const before = { weapons: P.weapons.slice(), held: heldNames.slice(1, 2) };
    const price = Wpn.sellPrice("pistol"); const u = { v: "market", hand: { z: "gun", i: P.weapons.indexOf("pistol") } }; Inv.act(u, "sell");
    const after = { weapons: P.weapons.slice(), weapon: P.weapon, money: P.money, held: heldNames[1] };
    Quick._t = 1; update(0.1); const freed = heldNames[1]; const grid = /cell:gun:0/.test(Inv.bigGrid({}));
    invAdd("ammo", 5); P.sel = 1; P.cd = 0; const a0 = invCount("ammo"); shoot(); const noShot = invCount("ammo") === a0; const checks = Camp.confirmChecks().map(c => c[1]).join("|"); const cyc = (Meta.cycleWeapon(), P.weapons.length);
    const buy = CFG.weapons.pistol.price; P.money = buy; Inv.buy(Shop.weaponList().find(o => o.id === "pistol"), 1); const rebought = P.weapons.includes("pistol") && P.money === 0;
    return { before, price, after, freed, grid, noShot, noGun: /Нет огнестрела/.test(checks), cyc, buy, rebought };
  })()`);
  assert.deepEqual(o.before.weapons, ["pistol"]); assert.deepEqual(o.after.weapons, [], "последний ствол продан"); assert.equal(o.after.money, o.price); assert.ok(o.price > 0); assert.equal(o.after.weapon, "pistol", "запасной указатель, оружием не считается");
  assert.equal(o.freed, null, "кнопка освободилась"); assert.equal(o.grid, false); assert.equal(o.noShot, true, "стрелять нечем"); assert.equal(o.noGun, true); assert.equal(o.cyc, 0); assert.ok(o.buy > o.price, "купить дороже, чем продал"); assert.equal(o.rebought, true);
});

test("нижняя панель: пока инвентарь открыт, клик по кнопке внизу кладёт вещь из руки (или берёт с кнопки)", () => {
  fresh();
  const o = run(`(() => {
    invAdd("medkit", 3); G.ui = { k: "inv" }; const u = G.ui; const mi = P.inv.findIndex(s => s.id === "medkit"); Meta.click("cell", "inv", String(mi), u);
    const click = i => { Meta.click("cell", "quick", String(i), G.ui); };
    click(6); const put = heldNames[6], handAfter = u.hand; click(6); const picked = u.hand && u.hand.z + u.hand.i; click(2); const moved = [heldNames[6], heldNames[2]];
    Camp.render({ k: "inv" }); const html = Inv.html(u);
    return { put, handAfter, picked, moved, noQuickGrid: !/cell:quick:/.test(html), noTabs: !/itab:/.test(html), guns: /cell:gun:0/.test(html) };
  })()`);
  assert.equal(o.put, "medkit"); assert.equal(o.handAfter, null); assert.equal(o.picked, "quick6"); assert.deepEqual(o.moved, [null, "medkit"]); assert.equal(o.noQuickGrid, true, "в окне инвентаря панели больше нет");
  assert.equal(o.noTabs, true, "вкладок нет — один большой инвентарь"); assert.equal(o.guns, true, "оружие лежит в той же сетке");
});

test("один большой инвентарь: стволы, ножи, снаряжение, артефакты и предметы — в одной сетке 10×N; справа контейнеры и «Надето»; надетое не берётся", () => {
  fresh();
  const o = run(`(() => {
    invAdd("medkit", 2); invAdd("scrap", 3); invAdd("suit", 1); invAdd("helmet", 1); invAdd("art", 1, "soul", 1.1); P.knives = ["knife", "shiv"]; const u = G.ui; const html = Inv.html(u);
    const cnt = z => (html.match(new RegExp('data-a="cell:' + z + ':', 'g')) || []).length; const big = html.indexOf('ggrid big'), doll = html.indexOf('ggrid doll');
    const worn = P.inv.findIndex(s => s.id === "suit"); Meta.click("cell", "worn", "0", u); const noHand = u.hand;
    Meta.click("cell", "gun", "0", u); const handG = u.hand && u.hand.z; Meta.click("cell", "inv", "50", u); const released = u.hand;
    const gi = P.inv.findIndex(s => s.id === "helmet"); Meta.click("cell", "inv", String(gi), u); Meta.click("cell", "inv", "55", u); const moved = P.inv[P.inv.length - 1].id;
    return { cells: cnt("gun") + cnt("melee") + cnt("inv"), gun: cnt("gun"), melee: cnt("melee"), equip: cnt("equip"), worn: cnt("worn"), oneGrid: big >= 0 && doll > big && !/itab:/.test(html), skills: /Навыки/.test(html), noHand, handG, released, moved, tipWorn: !!Tip.fromAttr("cell:worn:0") };
  })()`);
  assert.equal(o.cells, 60, "общая сетка 60 ячеек"); assert.equal(o.gun, 1); assert.equal(o.melee, 2); assert.equal(o.equip, 2); assert.equal(o.worn, 5); assert.equal(o.oneGrid, true); assert.equal(o.skills, true);
  assert.ok(!o.noHand); assert.equal(o.handG, "gun"); assert.equal(o.released, null, "ствол не «кладётся» в сетку — просто отпускается"); assert.equal(o.moved, "helmet", "вещь на свободную ячейку — в конец"); assert.equal(o.tipWorn, true);
});

test("ящик хранения: клик переносит всю стопку, Shift — одну; отдельные вещи целиком; лимит ячеек соблюдается", () => {
  fresh();
  const o = run(`(() => {
    G.ui = { k: "storage" }; const u = G.ui; invAdd("medkit", 3); invAdd("art", 1, "soul", 1); const mi = () => P.inv.findIndex(s => s.id === "medkit");
    Meta.click("cell", "inv", String(mi()), u); Meta.click("cell", "stash", "0", u); const s1 = P.stash.map(s => s.id + ":" + s.n).join(","), inv1 = invCount("medkit");
    Meta.click("cell", "stash", "0", u); Meta.click("cell", "inv", "9", u); const back = invCount("medkit"), st0 = P.stash.length;
    Inv.shift = true; Meta.click("cell", "inv", String(mi()), u); Inv.shift = false; Meta.click("cell", "stash", "0", u); const one = P.stash[0].n, inv2 = invCount("medkit");
    const ai = P.inv.findIndex(s => s.art); Meta.click("cell", "inv", String(ai), u); Meta.click("cell", "stash", "5", u); const art = P.stash.some(s => s.art) && !P.inv.some(s => s.art);
    P.bld = Camp.DEFAULT_BLD(); const lim = Camp.stashLimit(); P.stash = []; for (let i = 0; i < lim; i++) P.stash.push({ id: "scrap" + i, n: 1, g: {} }); invAdd("food", 2); const fi = P.inv.findIndex(s => s.id === "food"); Meta.click("cell", "inv", String(fi), u); Meta.click("cell", "stash", "0", u); const blocked = P.stash.length === lim && invCount("food") === 2;
    return { s1, inv1, back, st0, one, inv2, art, blocked };
  })()`);
  assert.equal(o.s1, "medkit:3"); assert.equal(o.inv1, 0, "вся стопка ушла в ящик"); assert.equal(o.back, 3); assert.equal(o.st0, 0); assert.equal(o.one, 1, "Shift — одна"); assert.equal(o.inv2, 2); assert.equal(o.art, true); assert.equal(o.blocked, true);
});

test("действия над вещью в руке: использовать одну, выбросить столько, сколько несёшь, в ящик; правая кнопка использует", () => {
  fresh();
  const o = run(`(() => {
    const u = G.ui; P.hp = 40; invAdd("medkit", 3); Meta.click("cell", "inv", "0", u); Meta.click("hact", "use", undefined, u); const healed = P.hp > 40, left = invCount("medkit"), hand = u.hand;
    invAdd("scrap", 4); const si = P.inv.findIndex(s => s.id === "scrap"); Meta.click("cell", "inv", String(si), u); const n4 = u.hand.n; Meta.click("hact", "less", undefined, u); const l0 = W.loot.length; Meta.click("hact", "drop", undefined, u);
    const dropped = W.loot.length === l0 + 1 && W.loot[W.loot.length - 1].n === 3 && invCount("scrap") === 1;
    G.ui = { k: "storage" }; invAdd("food", 3); const fi = P.inv.findIndex(s => s.id === "food"); G.ui.hand = { z: "inv", i: fi, n: 2 }; Meta.click("hact", "stash", undefined, G.ui); const stashed = P.stash.length === 1 && P.stash[0].n === 2 && invCount("food") === 1;
    const si2 = P.inv.findIndex(s => s.id === "medkit"); G.ui = { k: "inv" }; P.hp = 30; Inv.act(Object.assign(G.ui, { hand: { z: "inv", i: si2, n: 1 } }), "use"); const rc = P.hp > 30;
    return { healed, left, hand, n4, dropped, stashed, rc };
  })()`);
  assert.equal(o.healed, true); assert.equal(o.left, 2); assert.equal(o.hand, null); assert.equal(o.n4, 4, "по клику — вся стопка"); assert.equal(o.dropped, true); assert.equal(o.stashed, true); assert.equal(o.rc, true);
});

test("разметка: сетка рюкзака, контейнеры и «в руке»; подсказка ячейки; ящик — две сетки", () => {
  fresh();
  const o = run(`(() => {
    invAdd("medkit", 3); invAdd("suit", 1); invAdd("art", 1, "soul", 1); const u = G.ui; const mi = P.inv.findIndex(s => s.id === "medkit"); u.hand = { z: "inv", i: mi, n: 1 }; const html = Inv.html(u);
    const tip = Tip.fromAttr("cell:inv:" + mi), tipQ = Tip.fromAttr("cell:quick:1"), none = Tip.fromAttr("cell:inv:40");
    G.ui = { k: "storage" }; const st = Inv.html(G.ui);
    return { cells: (html.match(/data-a="cell:inv:/g) || []).length, quick: (html.match(/data-a="cell:quick:/g) || []).length, hand: /В руке/.test(html) && /×1 из 3/.test(html), stackBtns: /hact:more/.test(html) && /hact:all/.test(html), sel: /gc sel/.test(html), skills: /Навыки/.test(html) && /Записки/.test(html), tip: !!tip, tipQ: !!tipQ, none, stash: /cell:stash:/.test(st) && /Ящик хранения/.test(st) };
  })()`);
  assert.ok(o.cells >= 55 && o.cells <= 60); assert.equal(o.quick, 0); assert.equal(o.hand, true); assert.equal(o.stackBtns, true); assert.equal(o.sel, true); assert.equal(o.skills, true); assert.equal(o.tip, true); assert.equal(o.tipQ, true); assert.equal(o.none, null); assert.equal(o.stash, true);
});

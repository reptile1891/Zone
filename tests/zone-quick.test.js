"use strict";
// v0.32: быстрая панель — нож на 1, остальное пусто и раскладывается игроком (в том числе огнестрел); артефакты в раскрытых аномалиях видны.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createZone } = require("./zone-load");

const z = createZone();
const run = code => JSON.parse(JSON.stringify(z.run(code) ?? null));
const fresh = () => z.run(`(() => {
  W = new World(1234); resetPlayer(); P.stash = []; P.bld = null; Mutants.spawn(); Stalkers.spawn(); Meta.reset(); Camp.enter(true);
  G.events = []; G.dead = false; G.started = true; G.ui = null; G.scene = "camp"; P.inv = []; Mutants.list = []; Stalkers.list = []; W.anoms = []; W.arts = [];
})()`);

test("раскладка по умолчанию: нож на 1, пистолет на 2, остальное пусто; нож не переставляется", () => {
  fresh();
  const o = run(`(() => ({ held: heldNames.slice(), q: P.quick.slice(), toKnife: Quick.assign(0, "medkit"), moved: heldNames[0], melee: Quick.assign(3, "melee"), sel: P.sel }))()`);
  assert.deepEqual(o.held, ["melee", "weapon", null, null, null, null, null, null, null]); assert.deepEqual(o.q, o.held); assert.equal(o.toKnife, false); assert.equal(o.moved, "melee"); assert.equal(o.melee, false); assert.equal(o.sel, 0);
});

test("любая полезная вещь и огнестрел ставятся на любую кнопку 2–9; занятая обменивается; очистка; лишнее не ставится", () => {
  fresh();
  const o = run(`(() => {
    const ok = Quick.assign(5, "weapon"); const a = heldNames.slice(); const sw = Quick.assign(5, "food"); const b = heldNames.slice(); const clear = Quick.assign(5, null); const c = heldNames.slice();
    return { ok, a, sw, b, clear, c, junk: Quick.can("scrap"), art: Quick.can("art"), hook: Quick.can("hook"), gun: Quick.can("weapon"), detector: Quick.can("detector") };
  })()`);
  assert.equal(o.ok, true); assert.equal(o.a[5], "weapon"); assert.equal(o.a[1], null, "оружие ушло с кнопки 2: одна вещь — одна кнопка");
  assert.equal(o.b[5], "food"); assert.equal(o.b[1], null); assert.equal(o.c[5], null); assert.equal(o.junk, false); assert.equal(o.art, false); assert.equal(o.hook, true); assert.equal(o.gun, true);
});

test("клавиша кнопки использует то, что под ней; пустая кнопка ничего не делает; колесо пропускает пустые", () => {
  fresh();
  const o = run(`(() => {
    Quick.assign(4, "food"); invAdd("food", 2); P.food = 20; P.sel = 4; P.cd = 0; const before = invCount("food"); useSel(); const eaten = P.food > 20 && invCount("food") === before - 1;
    P.sel = 6; P.cd = 0; const f0 = P.food; useSel(); const idle = P.food === f0;
    P.sel = 0; stepSel(1); const s1 = P.sel; stepSel(1); const s2 = P.sel; stepSel(-1); const s3 = P.sel;
    return { eaten, idle, s1, s2, s3, tip: !!Tip.quick(4), tipEmpty: Tip.quick(6), tipKnife: /Нож/.test(Tip.quick(0)) };
  })()`);
  assert.equal(o.eaten, true); assert.equal(o.idle, true); assert.equal(o.s1, 1); assert.equal(o.s2, 4, "пустые 3 пропущены"); assert.equal(o.s3, 1); assert.equal(o.tip, true); assert.equal(o.tipEmpty, null); assert.equal(o.tipKnife, true);
});

test("выбор кнопки в рюкзаке; раскладка живёт в сохранении, новая игра — по умолчанию; старые сохранения начинают с пустой панели", () => {
  fresh();
  const o = run(`(() => {
    invAdd("antibiotic", 1); G.ui = { k: "inv" }; const u = G.ui;
    Meta.click("cell", "inv", "0", u); Meta.click("cell", "quick", "8", u); const after = heldNames[8];
    G.scene = "camp"; save(true); const raw = JSON.parse(localStorage.getItem(saveKey())); const saved = raw.P.quick && raw.P.quick[8], ver = raw.P.quickV;
    resetPlayer(); const fresh2 = heldNames[8];
    P.quick = ["weapon", "bolt", "medkit", "food", "antirad", "lure", "splint", "shock", "hook"]; P.quickV = undefined; Meta.afterLoad(); const legacy = heldNames.slice();
    P.quick = ["melee", "weapon", null, null, null, null, null, null, "antibiotic"]; P.quickV = 2; Meta.afterLoad(); const loaded = heldNames[8];
    Quick.assign(2, "antirad"); Quick.reset(); const reset = heldNames.slice();
    return { after, saved, ver, fresh2, legacy, loaded, reset };
  })()`);
  assert.equal(o.after, "antibiotic"); assert.equal(o.saved, "antibiotic"); assert.equal(o.ver, 2); assert.equal(o.fresh2, null); assert.deepEqual(o.legacy, ["melee", "weapon", null, null, null, null, null, null, null]);
  assert.equal(o.loaded, "antibiotic"); assert.deepEqual(o.reset, ["melee", "weapon", null, null, null, null, null, null, null]);
});

test("мусор в раскладке не ломает панель: дубликаты, неподходящее, чужие типы", () => {
  fresh();
  const o = run(`(() => { P.quickV = 2; P.quick = ["x", 5, "scrap", null, "nope", "lure", "lure", "weapon", "hook"]; Meta.afterLoad(); return heldNames.slice(); })()`);
  assert.deepEqual(o, ["melee", null, null, null, null, "lure", null, "weapon", "hook"]);
});

test("артефакт в раскрытой аномалии виден издалека, в нераскрытой — только вплотную", () => {
  fresh();
  const o = run(`(() => {
    const a = { id: 9, type: "plesh", x: 3000, y: 3000, r: 32, known: false, revealed: 0 }; W.anoms = [a]; const art = { id: 3, type: "soul", x: 3005, y: 3002, anom: 9 }; W.arts = [art];
    const hidden = artSeen(art); a.known = true; const shown = artSeen(art); a.known = false; a.revealed = 5; const flash = artSeen(art); const loose = artSeen({ id: 4, type: "soul", x: 0, y: 0, anom: 0 });
    return { hidden, shown, flash, loose };
  })()`);
  assert.equal(o.hidden, false); assert.equal(o.shown, true); assert.equal(o.flash, true); assert.equal(o.loose, false);
});

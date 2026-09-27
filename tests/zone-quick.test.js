"use strict";
// v0.31: быстрая панель настраивается игроком; артефакты в раскрытых аномалиях видны.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createZone } = require("./zone-load");

const z = createZone();
const run = code => JSON.parse(JSON.stringify(z.run(code) ?? null));
const fresh = () => z.run(`(() => {
  W = new World(1234); resetPlayer(); P.stash = []; P.bld = null; Mutants.spawn(); Stalkers.spawn(); Meta.reset(); Camp.enter(true);
  G.events = []; G.dead = false; G.started = true; G.ui = null; G.scene = "camp"; P.inv = []; Mutants.list = []; Stalkers.list = []; W.anoms = []; W.arts = [];
})()`);

test("раскладка по умолчанию прежняя, слот 1 — оружие и не переставляется", () => {
  fresh();
  const o = run(`(() => ({ held: heldNames.slice(), q: P.quick.slice(), w: Quick.assign(0, "medkit"), moved: heldNames[0], toWeapon: Quick.assign(3, "weapon") }))()`);
  assert.deepEqual(o.held, ["weapon", "bolt", "medkit", "food", "antirad", "lure", "splint", "shock", "hook"]); assert.deepEqual(o.q, o.held); assert.equal(o.w, false); assert.equal(o.moved, "weapon"); assert.equal(o.toWeapon, false);
});

test("вещь ставится на выбранную кнопку, стоявшая там уходит на прежнее место (обмен); подходят только полезные вещи", () => {
  fresh();
  const o = run(`(() => {
    const ok = Quick.assign(1, "antibiotic"); const a = heldNames.slice(); const swap = Quick.assign(1, "food"); const b = heldNames.slice();
    return { ok, a, swap, b, junk: Quick.can("scrap"), art: Quick.can("art"), gun: Quick.can("weapon"), hook: Quick.can("hook"), detector: Quick.can("detector") };
  })()`);
  assert.equal(o.ok, true); assert.equal(o.a[1], "antibiotic"); assert.equal(o.a[3], "food", "прежний слот других вещей не тронут");
  assert.equal(o.b[1], "food"); assert.equal(o.b[3], "antibiotic", "обмен местами"); assert.equal(o.junk, false); assert.equal(o.art, false); assert.equal(o.gun, false); assert.equal(o.hook, true);
});

test("клавиша слота использует то, что под ней; количество и значок берутся с новой вещи", () => {
  fresh();
  const o = run(`(() => {
    Quick.assign(4, "food"); invAdd("food", 2); P.food = 20; P.sel = 4; P.cd = 0; const before = invCount("food"); useSel(); const eaten = P.food > 20 && invCount("food") === before - 1;
    return { eaten, tip: !!Tip.quick(4) };
  })()`);
  assert.equal(o.eaten, true); assert.equal(o.tip, true);
});

test("выбор слота через рюкзак: ⚡ → номер; отмена и сброс; раскладка живёт в сохранении и новой игре не переходит", () => {
  fresh();
  const o = run(`(() => {
    invAdd("antibiotic", 1); G.ui = { k: "inv" }; const btnShown = /qp:antibiotic/.test(""); const u = G.ui;
    Meta.click("qp", "antibiotic", undefined, u); const picked = u.qpick, chooser = /qset:8/.test(Quick.chooser(u));
    Meta.click("qset", "8", undefined, u); const after = heldNames[8], cleared = u.qpick;
    Meta.click("qp", "antibiotic", undefined, u); Meta.click("qcancel", undefined, undefined, u); const canc = u.qpick;
    G.scene = "camp"; save(true); const raw = JSON.parse(localStorage.getItem(saveKey())); const saved = raw.P.quick && raw.P.quick[8];
    resetPlayer(); const fresh2 = heldNames[8];
    P.quick = ["weapon", "bolt", "medkit", "food", "antirad", "lure", "splint", "shock", "antibiotic"]; Meta.afterLoad(); const loaded = heldNames[8];
    Quick.assign(2, "antirad"); Quick.reset(); const reset = heldNames.slice();
    return { picked, chooser, after, cleared, canc, saved, fresh2, loaded, reset };
  })()`);
  assert.equal(o.picked, "antibiotic"); assert.equal(o.chooser, true); assert.equal(o.after, "antibiotic"); assert.equal(o.cleared, null); assert.equal(o.canc, null); assert.equal(o.saved, "antibiotic");
  assert.equal(o.fresh2, "hook", "новая игра — раскладка по умолчанию"); assert.equal(o.loaded, "antibiotic", "загрузка возвращает раскладку"); assert.deepEqual(o.reset, ["weapon", "bolt", "medkit", "food", "antirad", "lure", "splint", "shock", "hook"]);
});

test("старые сохранения без раскладки и мусор в ней не ломают панель", () => {
  fresh();
  const o = run(`(() => { P.quick = undefined; Meta.afterLoad(); const a = heldNames.slice(); P.quick = ["x", 5, "scrap", null, "nope", "lure", "art", "weapon", "hook"]; Meta.afterLoad(); return { a, b: heldNames.slice() }; })()`);
  assert.equal(o.a[2], "medkit"); assert.deepEqual(o.b, ["weapon", "bolt", "medkit", "food", "antirad", "lure", "splint", "shock", "hook"]);
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

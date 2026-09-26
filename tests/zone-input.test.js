"use strict";
// Ввод: быстрый клик и приоритет жителей лагеря над костром — дефекты, найденные при ручной проверке.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createZone } = require("./zone-load");

const z = createZone();
const run = code => JSON.parse(JSON.stringify(z.run(code) ?? null));
const fresh = () => z.run(`(() => {
  W = new World(1234); resetPlayer(); P.stash = []; P.bld = null; Mutants.spawn(); Stalkers.spawn(); Meta.reset(); Camp.enter(true);
  G.events = []; G.dead = false; G.started = true; G.ui = null; G.scene = "zone"; G.emi = { s: "calm", left: 0, next: 99999 }; G.t = 5; VW = 800; VH = 600;
  P.x = 3000; P.y = 3000; P.hp = 100; P.cd = 0; P.weapon = "pistol"; P.cond.pistol = 100; P.sel = 0; P.inv = []; invAdd("ammo", 10); Mutants.list = []; Stalkers.list = [];
  keys.KeyA = keys.KeyD = keys.KeyW = keys.KeyS = false; mouse.l = false; mouse.tap = false; mouse.x = 0; mouse.y = 0; localStorage.removeItem("zone_save_v2");
})()`);

test("быстрый клик: нажал и отпустил между кадрами — всё равно один выстрел; зажатая кнопка стреляет по кулдауну", () => {
  fresh();
  const o = run(`(() => {
    mouse.tap = true; mouse.l = false; update(0.016); const tap = 10 - invCount("ammo");
    P.cd = 0; mouse.tap = false; mouse.l = false; update(0.016); const none = 10 - invCount("ammo") - tap;
    P.cd = 0; mouse.l = true; update(0.016); update(0.016); const hold1 = 10 - invCount("ammo") - tap; for (let i = 0; i < 20; i++) update(0.05); const hold2 = 10 - invCount("ammo") - tap; mouse.l = false;
    return { tap, none, hold1, holdMore: hold2 > hold1, tapCleared: !mouse.tap };
  })()`);
  assert.equal(o.tap, 1); assert.equal(o.none, 0, "без нажатия выстрела нет"); assert.equal(o.hold1, 1, "кулдаун не даёт двух выстрелов подряд"); assert.ok(o.holdMore, "зажатая кнопка продолжает стрелять"); assert.ok(o.tapCleared);
});

test("быстрый клик не копится: при открытой панели и в лагере он гасится без выстрела", () => {
  fresh();
  const o = run(`(() => {
    G.ui = { k: "inv" }; mouse.tap = true; update(0.016); const ui = { ammo: invCount("ammo"), tap: mouse.tap }; G.ui = null;
    G.scene = "camp"; P.x = Camp.spawn.x; P.y = Camp.spawn.y; mouse.tap = true; update(0.016); const camp = { ammo: invCount("ammo"), tap: mouse.tap }; G.scene = "zone"; P.x = 3000; P.y = 3000; update(0.016);
    return { ui, camp, later: invCount("ammo") };
  })()`);
  assert.deepEqual(o.ui, { ammo: 10, tap: false }); assert.deepEqual(o.camp, { ammo: 10, tap: false }); assert.equal(o.later, 10, "погашенный клик не «выстреливает» позже");
});

test("быстрый клик работает и под землёй", () => {
  fresh();
  const o = run(`(() => { Dungeon.enter(W.bunkers[0]); Dungeon.enemies = []; P.cd = 0; mouse.tap = true; update(0.016); return 10 - invCount("ammo"); })()`);
  assert.equal(o, 1);
});

test("жители лагеря важнее костра: рядом с человеком у огня предлагается разговор, а не «посидеть»", () => {
  fresh();
  const o = run(`(() => {
    Camp.build(); G.scene = "camp"; const g = Camp.npcs.find(n => n.id === "garik"), fire = Camp.fire;
    // точка на равном расстоянии от Гарика и костра — раньше выигрывал костёр
    const mid = { x: (g.x + fire.x) / 2, y: (g.y + fire.y) / 2 }; P.x = mid.x; P.y = mid.y + 0; const tie = Math.abs(Math.hypot(g.x - P.x, g.y - P.y) - Math.hypot(fire.x - P.x, fire.y - P.y));
    let label = null, bd = 9e9; Camp.near((o, d, lim, l) => { if (d < lim && d < bd) { bd = d; label = l; } });
    // далеко от людей, но у костра — по-прежнему костёр
    P.x = fire.x + 80; P.y = fire.y - 20; /* у огня, но дальше 62 пикс от любого жителя */ let far = null, bd2 = 9e9; Camp.near((o, d, lim, l) => { if (d < lim && d < bd2) { bd2 = d; far = l; } });
    // радиус разговора по-прежнему 62 пикс: дальше — не предлагается
    P.x = g.x + 70; P.y = g.y; const labels = []; Camp.near((o, d, lim, l) => { if (d < lim && /Поговорить: Гарик/.test(l)) labels.push(l); }); const out62 = labels.length;
    P.x = g.x + 60; P.y = g.y; labels.length = 0; Camp.near((o, d, lim, l) => { if (d < lim && /Поговорить: Гарик/.test(l)) labels.push(l); }); const in60 = labels.length;
    return { tie, label, far, out62, in60 };
  })()`);
  assert.ok(o.tie < 6); assert.equal(o.label, "Поговорить: Гарик"); assert.match(o.far, /костр/i); assert.equal(o.out62, 0); assert.equal(o.in60, 1);
});

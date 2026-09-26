"use strict";
// v0.18: управление на телефоне — логика стиков (сама разметка проверяется в браузере с ?touch=1).
const test = require("node:test");
const assert = require("node:assert/strict");
const { createZone } = require("./zone-load");

const z = createZone();
const run = code => JSON.parse(JSON.stringify(z.run(code) ?? null));
const fresh = () => z.run(`(() => {
  W = new World(1234); resetPlayer(); P.stash = []; P.bld = null; Mutants.spawn(); Stalkers.spawn(); Meta.reset(); Camp.enter(true);
  G.events = []; G.dead = false; G.started = true; G.ui = null; G.scene = "zone"; G.emi = { s: "calm", left: 0, next: 99999 }; G.t = 5; VW = 800; VH = 600;
  P.x = 3000; P.y = 3000; P.hp = 100; P.stam = 100; Mutants.list = []; Stalkers.list = []; keys.KeyA = keys.KeyD = keys.KeyW = keys.KeyS = false; keys.stick = null; mouse.l = false; mouse.tap = false; mouse.x = 0; mouse.y = 0;
})()`);

test("на компьютере модуль не включается (нет касаний), но логика доступна", () => {
  fresh();
  const o = run(`({ on: Touch.on, v: Touch.vec(0, 0), full: Touch.vec(112, 0), half: Touch.vec(28, 0), diag: Touch.vec(300, 400) })`);
  assert.equal(o.on, false); assert.deepEqual(o.v, { x: 0, y: 0, n: 0 }); assert.deepEqual(o.full, { x: 1, y: 0, n: 1 }); assert.ok(Math.abs(o.half.n - 0.5) < 1e-9 && Math.abs(o.half.x - 0.5) < 1e-9);
  assert.ok(Math.abs(Math.hypot(o.diag.x, o.diag.y) - 1) < 1e-9 && Math.abs(o.diag.x / o.diag.y - 0.75) < 1e-9);
});

test("стик движения: скорость пропорциональна длине, направление любое (не только 8), без стика работает клавиатура", () => {
  fresh();
  const o = run(`(() => {
    const step = (st, k) => { P.x = 3000; P.y = 3000; keys.stick = st; keys.KeyD = !!k; update(0.1); const r = { dx: P.x - 3000, dy: P.y - 3000 }; keys.stick = null; keys.KeyD = false; return r; };
    return { full: step({ x: 1, y: 0 }), half: step({ x: 0.5, y: 0 }), diag: step({ x: 0.6, y: 0.8 }), kb: step(null, true), none: step(null, false) };
  })()`);
  assert.ok(o.full.dx > 3 && Math.abs(o.full.dy) < 1e-9); assert.ok(Math.abs(o.half.dx / o.full.dx - 0.5) < 1e-6, "половина стика — половина скорости");
  assert.ok(Math.abs(Math.hypot(o.diag.dx, o.diag.dy) - o.full.dx) < 1e-6 && o.diag.dy / o.diag.dx > 1.3, "произвольный угол, скорость по длине");
  assert.ok(Math.abs(o.kb.dx - o.full.dx) < 1e-6); assert.deepEqual(o.none, { dx: 0, dy: 0 });
});

test("стик прицела: точка перед игроком в нужную сторону, дальность растёт с длиной; тап-выстрел; в лагере не стреляет", () => {
  fresh();
  const o = run(`(() => {
    cam.x = P.x - VW / 2; cam.y = P.y - VH / 2;
    Touch.aim({ x: 0, y: -1, n: 1 }); const up = { x: mouse.x, y: mouse.y }; Touch.aim({ x: 0.3, y: 0, n: 0.3 }); const short = { x: mouse.x, y: mouse.y };
    Touch.aim({ x: 3, y: 4, n: 0.5 }); update(0.016);
    invAdd("ammo", 10); P.weapon = "pistol"; P.sel = 0; P.cd = 0; const a0 = invCount("ammo"); mouse.tap = true; update(0.016); const shot = a0 - invCount("ammo");
    return { up, short, ang: +P.ang.toFixed(3), want: +Math.atan2(4, 3).toFixed(3), shot, last: Touch.lastAim };
  })()`);
  assert.equal(o.up.x, 400); assert.equal(o.up.y, 300 - 400); assert.ok(o.short.x > 400 && o.short.x < 400 + 200 && o.short.y === 300);
  assert.equal(o.ang, o.want); assert.equal(o.shot, 1); assert.ok(Math.abs(o.last.x - 0.6) < 1e-9 && Math.abs(o.last.y - 0.8) < 1e-9);
});

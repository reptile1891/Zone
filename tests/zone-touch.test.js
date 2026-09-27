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
    invAdd("ammo", 10); P.weapon = "pistol"; P.sel = 1; P.cd = 0; const a0 = invCount("ammo"); mouse.tap = true; update(0.016); const shot = a0 - invCount("ammo");
    return { up, short, ang: +P.ang.toFixed(3), want: +Math.atan2(4, 3).toFixed(3), shot, last: Touch.lastAim };
  })()`);
  assert.equal(o.up.x, 400); assert.equal(o.up.y, 300 - 400); assert.ok(o.short.x > 400 && o.short.x < 400 + 200 && o.short.y === 300);
  assert.equal(o.ang, o.want); assert.equal(o.shot, 1); assert.ok(Math.abs(o.last.x - 0.6) < 1e-9 && Math.abs(o.last.y - 0.8) < 1e-9);
});

test("автоприцел: цель в конусе и дальности, ближайшая к направлению; мимо конуса, далёкие, спящие в золе, чужие — нет; уровни и слот предмета", () => {
  fresh();
  const o = run(`(() => {
    P.x = 3000; P.y = 3000; P.weapon = "pistol"; P.sel = 1; Touch.set.aim = 1; cam.x = P.x - VW / 2; cam.y = P.y - VH / 2;
    const mk = (sp, dx, dy, st) => { const m = new Mutant(sp, P.x + dx, P.y + dy, null); m.state = st || "wander"; Mutants.list.push(m); return m; };
    const near = mk("listener", 200, 20), far = mk("tin", 900, 0), off = mk("glass", 200, 200), sleeper = mk("cinder", 150, 0, "sleep"), dead = mk("bristler", 120, 5); dead.dead = true;
    const r1 = Touch.assist(1, 0), r2 = Touch.assist(0, 1), r3 = Touch.assist(-1, 0);
    Touch.set.aim = 2; const wide = Touch.assist(Math.cos(0.4), Math.sin(0.4)); Touch.set.aim = 1; const narrow = Touch.assist(Math.cos(0.4), Math.sin(0.4)); Touch.set.aim = 0; const offOff = Touch.assist(1, 0); Touch.set.aim = 1;
    Quick.assign(2, "bolt"); P.sel = 2; const bolt = Touch.assist(1, 0); P.sel = 1;
    Stalkers.list = [{ x: P.x + 300, y: P.y - 15, dead: false, hostile: false }, { x: P.x + 250, y: P.y + 30, dead: false, hostile: true }]; Mutants.list = [];
    const st = Touch.assist(1, 0);
    Mutants.list = [near]; Stalkers.list = []; Touch.aim({ x: 1, y: 0, n: 0.5 }, true); const withAssist = { mx: mouse.x + cam.x - P.x, my: mouse.y + cam.y - P.y, target: !!Touch.target };
    Touch.aim({ x: 1, y: 0, n: 0.5 }, false); const plain = { my: mouse.y + cam.y - P.y, target: Touch.target };
    return { r1: r1 && Math.round(r1.x - P.x), r2, r3, wide: !!wide, narrow, offOff, bolt, st: st && Math.round(st.x - P.x), withAssist, plain };
  })()`);
  assert.equal(o.r1, 200); assert.equal(o.r2, null); assert.equal(o.r3, null); assert.equal(o.wide, true); assert.equal(o.narrow, null); assert.equal(o.offOff, null); assert.equal(o.bolt, null);
  assert.equal(o.st, 250, "у сталкеров только враждебные"); assert.deepEqual(o.withAssist, { mx: 200, my: 20, target: true }); assert.equal(o.plain.my, 0); assert.equal(o.plain.target, null);
});

test("настройки касания: размеры и переключатели по кругу, сохранение и загрузка, строки меню, вибрация с ограничением частоты", () => {
  fresh();
  z.sandbox.navigator.vibrate = n => { (z.sandbox.__vib = z.sandbox.__vib || []).push(n); };
  const o = run(`(() => {
    Touch.set = { aim: 1, ss: 1, bs: 1, left: 0, vib: 1 }; const seq = { aim: [], ss: [], bs: [], left: Touch.cycle("left"), vib: Touch.cycle("vib"), bad: Touch.cycle("нет") };
    for (let i = 0; i < 3; i++) seq.aim.push(Touch.cycle("aim")); for (let i = 0; i < 4; i++) { seq.ss.push(Touch.cycle("ss")); seq.bs.push(Touch.cycle("bs")); }
    const R = Touch.R; const saved = JSON.parse(localStorage.getItem("zone_ui")); Touch.set = { aim: 9, ss: 9, bs: 9, left: 9, vib: 9 }; localStorage.setItem("zone_ui", JSON.stringify({ aim: 2, ss: 1.25, left: 1, junk: "x" })); Touch.load();
    const loaded = { ...Touch.set }; const rows = Touch.menuRows();
    Touch.set.vib = 1; Touch.buzzT = 0; Touch.buzz(12); Touch.buzz(12); const first = (globalThis.__vib || []).length; Touch.buzzT = 0; Touch.buzz(30); Touch.set.vib = 0; Touch.buzzT = 0; Touch.buzz(40);
    return { seq, R, saved, loaded, rows, vib: (globalThis.__vib || []).slice(), first };
  })()`);
  assert.deepEqual(o.seq.aim, [2, 0, 1]); assert.deepEqual(o.seq.ss, [1.25, 1.5, 0.8, 1]); assert.deepEqual(o.seq.bs, [1.25, 1.5, 0.8, 1]); assert.equal(o.seq.left, 1); assert.equal(o.seq.vib, 0); assert.equal(o.seq.bad, null);
  assert.equal(o.R, 56); assert.deepEqual(o.saved, { aim: 1, ss: 1, bs: 1, left: 1, vib: 0 });
  assert.equal(o.loaded.aim, 2); assert.equal(o.loaded.ss, 1.25); assert.equal(o.loaded.left, 1); assert.equal(o.loaded.bs, 9, "чего нет в сохранённом — остаётся"); assert.ok(!("junk" in o.loaded));
  assert.match(o.rows, /Автоприцел: <b>Сильный<\/b>/); assert.match(o.rows, /data-a="tset:aim"/); assert.match(o.rows, /Левша: <b>да<\/b>/); assert.match(o.rows, /tset:vib/); assert.deepEqual(o.vib, [12, 30]); assert.equal(o.first, 1, "частые вибрации схлопываются");
});

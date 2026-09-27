"use strict";
// v0.19: справочник Зоны — записи открываются по ходу игры, сохраняются, тексты покрывают весь контент.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createZone } = require("./zone-load");

const z = createZone();
const run = code => JSON.parse(JSON.stringify(z.run(code) ?? null));
const fresh = () => z.run(`(() => {
  W = new World(1234); resetPlayer(); P.stash = []; P.bld = null; Mutants.spawn(); Stalkers.spawn(); Meta.reset(); Camp.enter(true);
  G.events = []; G.dead = false; G.started = true; G.ui = null; G.scene = "zone"; G.emi = { s: "calm", left: 0, next: 99999 }; G.t = 5; VW = 800; VH = 600;
  P.x = 3000; P.y = 3000; P.hp = 100; P.known = {}; Mutants.list = []; Stalkers.list = []; localStorage.removeItem("zone_save_v2"); Codex.t = 0;
})()`);

test("тексты покрывают весь контент: у каждого мутанта, обитателя бункера, аномалии и биома есть запись", () => {
  fresh();
  const o = run(`(() => {
    const miss = []; for (const k in CFG.mut) if (!(Codex.TEXT.m[k] && Codex.TEXT.m[k].length === 2)) miss.push("m:" + k);
    for (const k in CFG.dungeon.enemies) if (!(Codex.TEXT.d[k] && Codex.TEXT.d[k].length === 2)) miss.push("d:" + k);
    for (const k in CFG.anoms) if (!(Codex.TEXT.a[k] && Codex.TEXT.a[k].length === 2)) miss.push("a:" + k);
    for (const k in CFG.biomes) if (typeof Codex.TEXT.b[k] !== "string") miss.push("b:" + k);
    const extra = []; for (const c of ["m", "d", "a", "b"]) for (const k in Codex.TEXT[c]) if (!Codex.ids(c).includes(k)) extra.push(c + ":" + k);
    const html = []; for (const c of Codex.CATS) for (const id of Codex.ids(c.k)) { P.codex = { m: {}, d: {}, a: {}, b: {} }; P.known = {}; if (c.k === "r") P.known[id] = true; else P.codex[c.k][id] = { n: 3 }; try { Codex.detail(c.k, id); } catch (e) { html.push(c.k + ":" + id + " " + e.message); } }
    return { miss, extra, html, total: Codex.total() };
  })()`);
  assert.deepEqual(o.miss, []); assert.deepEqual(o.extra, []); assert.deepEqual(o.html, []); assert.ok(o.total.all >= 8 + 4 + 9 + 11);
});

test("запись: первое появление пишет в лог один раз, убийства открывают характеристики", () => {
  fresh();
  const o = run(`(() => {
    const logs = []; const _log = log; log = (t) => { logs.push(t); }; 
    Codex.see("m", "listener"); Codex.see("m", "listener"); const seen = { open: Codex.open("m", "listener"), studied: Codex.studied("m", "listener"), n: P.codex.m.listener.n };
    Codex.see("m", "listener", 1); Codex.see("m", "listener", 1); const killed = { studied: Codex.studied("m", "listener"), n: P.codex.m.listener.n };
    log = _log; return { logs, seen, killed, closed: Codex.open("m", "tin") };
  })()`);
  assert.equal(o.logs.filter(t => /новая запись/.test(t)).length, 1); assert.equal(o.logs.filter(t => /изучен/.test(t)).length, 1);
  assert.deepEqual(o.seen, { open: true, studied: false, n: 0 }); assert.deepEqual(o.killed, { studied: true, n: 2 }); assert.equal(o.closed, false);
});

test("наблюдение: видимый близкий мутант, найденная аномалия, биом; спящий Углеглот и далёкие — нет", () => {
  fresh();
  const o = run(`(() => {
    const mk = (sp, dx, st) => { const m = new Mutant(sp, P.x + dx, P.y, null); m.state = st || "wander"; Mutants.list.push(m); return m; };
    mk("listener", 120); mk("tin", 900); mk("cinder", 60, "sleep"); mk("glass", 100);
    const an = W.anoms[0]; an.known = false; an.revealed = 0; const an2 = W.anoms[1]; an2.known = true;
    Codex.t = 0; Codex.tick(0.5);
    return { m: Object.keys(P.codex.m).sort(), a: Object.keys(P.codex.a), an2: an2.type, b: Object.keys(P.codex.b), biome: W.biomeAt(P.x, P.y) };
  })()`);
  assert.deepEqual(o.m, ["glass", "listener"]); assert.deepEqual(o.a, [o.an2]); assert.deepEqual(o.b, [o.biome]);
});

test("смерть мутанта и подземника даёт запись «убит» ровно один раз", () => {
  fresh();
  const o = run(`(() => {
    const m = new Mutant("tin", 0, 0, null); m.die(P); m.die(P); const a = P.codex.m.tin.n;
    const b = W.bunkers[0]; Dungeon.enter(b); Dungeon.enemies = []; const e = new DEnemy(P.x + 50, P.y, CFG.dungeon.enemies.spitter, 1, "spitter"); Dungeon.enemies.push(e); e.die(P); e.die(P);
    const d = P.codex.d.spitter.n; Dungeon.leave(); return { a, d };
  })()`);
  assert.equal(o.a, 1); assert.equal(o.d, 1);
});

test("подземелье: замеченный подземник открывает запись без убийства", () => {
  fresh();
  const o = run(`(() => {
    const b = W.bunkers[0]; Dungeon.enter(b); Dungeon.enemies = []; const e = new DEnemy(P.x + 100, P.y, CFG.dungeon.enemies.crawler, 1, "crawler"); e.state = "hunt"; Dungeon.enemies.push(e);
    Codex.t = 0; Codex.tick(0.5); const seen = !!P.codex.d.crawler, alpha = e.alpha(); Dungeon.leave(); return { seen, alpha };
  })()`);
  assert.equal(o.seen, true, "alpha " + o.alpha);
});

test("панель: вкладки и счётчики, закрытые записи скрыты, характеристики после убийства, артефакты по опознанию, клики", () => {
  fresh();
  const o = run(`(() => {
    Codex.see("m", "tin"); Codex.see("m", "listener", 1); P.known.soul = true; Codex.see("a", "magnet"); Codex.see("b", "junkyard");
    Codex.openPanel(); const first = Codex.html(G.ui);
    Meta.click("cx", "m", "tin", G.ui); const tin = Codex.html(G.ui);
    Meta.click("cx", "m", "listener", G.ui); const lis = Codex.html(G.ui);
    Meta.click("cxt", "r", undefined, G.ui); const arts = Codex.html(G.ui); Meta.click("cx", "r", "soul", G.ui); const soul = Codex.html(G.ui);
    Meta.click("cxt", "a", undefined, G.ui); Meta.click("cx", "a", "magnet", G.ui); const mag = Codex.html(G.ui);
    Meta.click("cxt", "b", undefined, G.ui); Meta.click("cx", "b", "junkyard", G.ui); const jy = Codex.html(G.ui);
    return { ui: G.ui.k, first, tin, lis, arts, soul, mag, jy };
  })()`);
  assert.equal(o.ui, "codex"); assert.match(o.first, /Справочник Зоны/); assert.match(o.first, /Мутанты 2\/8/); assert.match(o.first, /Артефакты 1\/\d+/); assert.match(o.first, /Места 1\/11/); assert.match(o.first, /\?\?\?/);
  assert.match(o.tin, /Жестянка/); assert.match(o.tin, /Характеристики и советы откроются/); assert.doesNotMatch(o.tin, /Здоровье:/);
  assert.match(o.lis, /Здоровье:[^]*40/); assert.match(o.lis, /Как справиться/); assert.match(o.lis, /Красться/);
  assert.match(o.arts, /Душа/); assert.match(o.soul, /Регенерация \+1\.2/); assert.match(o.soul, /×0\.70–1\.35/); assert.match(o.soul, /Ищи в:/);
  assert.match(o.mag, /Магнитная яма/); assert.match(o.mag, /Как обойти/); assert.match(o.mag, /Артефакты в ней[^]*\?\?\?/);
  assert.match(o.jy, /Свалка техники/); assert.match(o.jy, /Жестянка/);
});

test("справочник сохраняется, при новой игре сбрасывается; старые сохранения без него загружаются", () => {
  fresh();
  const o = run(`(() => {
    Codex.see("m", "listener", 2); Codex.see("a", "plesh"); save(true);
    const raw = JSON.parse(localStorage.getItem("zone_save_v2")); const saved = raw.P.codex && raw.P.codex.m.listener.n;
    load(); const after = { n: P.codex.m.listener.n, a: !!P.codex.a.plesh };
    const s = JSON.parse(localStorage.getItem("zone_save_v2")); delete s.P.codex; localStorage.setItem("zone_save_v2", JSON.stringify(s)); load(); Codex.tick(0.5); const old = Object.keys(P.codex.m).length;
    newGame(); const reset = Object.keys(P.codex.m).length + Object.keys(P.codex.a).length;
    return { saved, after, old, reset };
  })()`);
  assert.equal(o.saved, 2); assert.deepEqual(o.after, { n: 2, a: true }); assert.equal(o.old, 0); assert.equal(o.reset, 0);
});

test("картинки: для каждой записи рисуется изображение (на подставном холсте), при сбое — просто без картинки", () => {
  fresh();
  const o = run(`(() => {
    const calls = { draw: 0, made: 0 };
    const ctx = () => new Proxy({}, { get: (t, k) => k === "createRadialGradient" ? () => ({ addColorStop() {} }) : () => { if (k === "drawImage") calls.draw++; }, set: () => true });
    const _ce = document.createElement; document.createElement = () => { calls.made++; return { width: 0, height: 0, getContext: ctx, toDataURL: () => "data:image/png;base64,AAAA" }; };
    for (const k in CFG.mut) Spr.cache[k] = { width: 32, height: 16 };
    for (const k in CFG.dungeon.enemies) Spr.cache[CFG.dungeon.enemies[k].spr] = { width: 20, height: 16 };
    Dungeon.sprReady = true; Codex._pics = {};
    const missing = []; for (const c of Codex.CATS) for (const id of Codex.ids(c.k)) if (!Codex.img(c.k, id, 48).startsWith("<img")) missing.push(c.k + ":" + id);
    const again = calls.made; Codex.img("m", "tin", 48); const cached = calls.made === again;
    document.createElement = () => { throw new Error("нет холста"); }; Codex._pics = {}; const broken = Codex.img("m", "tin", 48);
    document.createElement = _ce; return { missing, draw: calls.draw > 20, cached, broken };
  })()`);
  assert.deepEqual(o.missing, []); assert.ok(o.draw); assert.ok(o.cached, "картинка кэшируется"); assert.equal(o.broken, "");
});

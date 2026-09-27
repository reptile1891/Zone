"use strict";
// v0.27: Крюк-кошка — достать артефакт из аномалии без урона.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createZone } = require("./zone-load");

const z = createZone();
const run = code => JSON.parse(JSON.stringify(z.run(code) ?? null));
const fresh = () => z.run(`(() => {
  W = new World(1234); resetPlayer(); P.stash = []; P.bld = null; Mutants.spawn(); Stalkers.spawn(); Meta.reset(); Camp.enter(true);
  G.events = []; G.dead = false; G.started = true; G.ui = null; G.scene = "zone"; G.emi = { s: "calm", left: 0, next: 99999 }; G.t = 5; VW = 800; VH = 600;
  P.x = 3000; P.y = 3000; P.hp = 100; P.inv = []; P.sk.sense = 0; Mutants.list = []; Stalkers.list = []; W.anoms = []; W.arts = []; W.loot = []; P.cd = 0; Meta.hooks = []; Meta.reeling = []; cam.x = P.x - VW / 2; cam.y = P.y - VH / 2;
})()`);
const setup = (type, extra) => `(() => { const a = { id: 1, type: "${type}", x: 3250, y: 3000, r: CFG.anoms.${type}.r, ph: 1, rot: 0, t: 0, state: 0, known: false, flash: 0, revealed: 0, vx: 0, vy: 0, act: false, dir: 0 }; Object.assign(a, ${extra || "{}"}); W.anoms = [a]; W.arts = [{ id: 5, type: "soul", x: 3252, y: 3004, anom: 1 }]; invAdd("hook", 1); P.sel = 8; mouse.x = 400 + 250; mouse.y = 300; P.ang = 0; return a; })()`;
const fly = `for (let i = 0; i < 40; i++) update(0.05);`;

test("бросок: расходует крюк, слот 9, дальность ограничена, без крюка — второго броска нет", () => {
  fresh();
  const o = run(`(() => {
    const a = ${setup("plesh")}; const n0 = invCount("hook"); useSel(); const after = { hook: invCount("hook"), flying: Meta.hooks.length, cd: P.cd > 0, tx: Math.round(Meta.hooks[0].tx - P.x) };
    P.cd = 0; useSel(); const noHook = { flying: Meta.hooks.length };
    invAdd("hook", 1); P.cd = 0; Meta.hooks = []; mouse.x = 400 + 900; useSel(); const far = Math.round(Meta.hooks[0].tx - P.x);
    return { n0, after, noHook, far, held: heldNames[8] };
  })()`);
  assert.equal(o.n0, 1); assert.deepEqual(o.after, { hook: 0, flying: 1, cd: true, tx: 250 }); assert.equal(o.noHook.flying, 1, "без крюка второго броска нет"); assert.equal(o.far, 340); assert.equal(o.held, "hook");
});

test("зацеп: артефакт из Комариной плеши приходит к игроку без единой потери здоровья, крюк возвращается", () => {
  fresh();
  const o = run(`(() => {
    const a = ${setup("plesh")}; const R0 = Math.random; Math.random = () => 0.1; useSel(); ${fly} Math.random = R0;
    return { hp: P.hp, art: P.inv.some(s => s.art === "soul"), hook: invCount("hook"), left: W.arts.length, reel: Meta.reeling.length, known: a.known, inAnom: !!P.inAnom };
  })()`);
  assert.equal(o.hp, 100); assert.equal(o.art, true); assert.equal(o.hook, 1); assert.equal(o.left, 0); assert.equal(o.reel, 0); assert.equal(o.known, true, "крюк, как болт, раскрывает аномалию"); assert.equal(o.inAnom, false);
});

test("срыв: невезение — крюк потерян, артефакт остаётся; в момент срабатывания цикличной аномалии не цепляется вообще", () => {
  fresh();
  const o = run(`(() => {
    const R0 = Math.random; ${setup("plesh")}; Math.random = () => 0.99; useSel(); ${fly} const bad = { hook: invCount("hook"), art: P.inv.some(s => s.art), left: W.arts.length };
    ${"fresh2()"}; ${setup("grinder", "{ act: true, t: 3.7 }")}; Math.random = () => 0.0; useSel(); ${fly} const busy = { hook: invCount("hook"), art: P.inv.some(s => s.art), left: W.arts.length };
    ${"fresh2()"}; ${setup("electra", "{ state: 1 }")}; Math.random = () => 0.0; useSel(); ${fly} const charging = { art: P.inv.some(s => s.art) };
    Math.random = R0; return { bad, busy, charging };
  })()`.split("fresh2()").join('(() => { P.inv = []; W.arts = []; W.anoms = []; P.cd = 0; Meta.hooks = []; Meta.reeling = []; P.hp = 100; })()'));
  assert.deepEqual(o.bad, { hook: 0, art: false, left: 1 }); assert.deepEqual(o.busy, { hook: 0, art: false, left: 1 }); assert.equal(o.charging.art, false);
});

test("шансы: у Магнитной ямы низкий, у Пуха высокий, «Чутьё» добавляет, потолок 97%; во время заряда — 0", () => {
  fresh();
  const o = run(`(() => { const ch = t => Meta.snagChance({ type: t, act: false, state: 0 }); const base = { magnet: ch("magnet"), fluff: ch("fluff"), funnel: ch("funnel") }; P.sk.sense = 5; const sense = ch("magnet"), cap = ch("fluff"); P.sk.sense = 0;
    return { base, sense, cap, free: Meta.snagChance(null), busy: Meta.snagChance({ type: "spring", act: false, state: 1 }) }; })()`);
  assert.deepEqual(o.base, { magnet: 0.35, fluff: 0.9, funnel: 0.6 }); assert.ok(Math.abs(o.sense - 0.55) < 1e-9); assert.equal(o.cap, 0.97); assert.equal(o.free, 1); assert.equal(o.busy, 0);
});

test("промах: на голую землю крюк падает и его можно подобрать; в аномалию без артефакта — теряется и раскрывает её", () => {
  fresh();
  const o = run(`(() => {
    invAdd("hook", 1); P.sel = 8; W.anoms = []; mouse.x = 400 + 200; mouse.y = 300; P.ang = 0; useSel(); ${fly} const ground = W.loot.find(l => l.id === "hook");
    P.inv = []; W.loot = []; P.cd = 0; ${setup("fluff")}; W.arts = []; useSel(); ${fly} const lost = { loot: W.loot.length, hook: invCount("hook"), known: W.anoms[0].known };
    return { ground: !!ground && Math.round(ground.x - P.x), lost };
  })()`);
  assert.equal(o.ground, 200); assert.deepEqual(o.lost, { loot: 0, hook: 0, known: true });
});

test("крюк можно купить и сделать; подсказка про него; справочник называет шанс зацепа", () => {
  fresh();
  const o = run(`(() => {
    P.money = 500; P.bld = Camp.DEFAULT_BLD(); Meta.click("buy", "hook", undefined, { v: "gear" }); const bought = invCount("hook");
    invAdd("scrap", 3); invAdd("circuit", 1); G.ui = { k: "craft", st: "gun" }; Camp.click("craft", "hook"); const crafted = invCount("hook");
    const rule = Hint.rules.find(r => r.id === "hook"); P.inv = []; W.anoms = [{ type: "plesh", known: true, x: 0, y: 0, r: 30 }]; P.money = 100; const on = !!rule.when(); invAdd("hook", 1); const off = !!rule.when();
    P.codex = { m: {}, d: {}, a: { magnet: { n: 1 } }, b: {}, r: {}, w: {}, i: {} }; const det = Codex.detail("a", "magnet");
    return { bought, crafted, on, off, det, item: Tip.item("hook") };
  })()`);
  assert.equal(o.bought, 1); assert.equal(o.crafted, 2); assert.equal(o.on, true); assert.equal(o.off, false); assert.match(o.det, /Крюк-кошка:[^]*35%/); assert.match(o.item, /Слот 9/);
});

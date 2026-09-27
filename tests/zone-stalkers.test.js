"use strict";
// v0.30: сталкеров меньше, бандиты замечают игрока не сразу, сталкеры воюют с мутантами, а хищники нападают на сталкеров.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createZone } = require("./zone-load");

const z = createZone();
const run = code => JSON.parse(JSON.stringify(z.run(code) ?? null));
const fresh = () => z.run(`(() => {
  W = new World(1234); resetPlayer(); P.stash = []; P.bld = null; Mutants.spawn(); Stalkers.spawn(); Meta.reset(); Camp.enter(true);
  G.events = []; G.dead = false; G.started = true; G.ui = null; G.scene = "zone"; G.emi = { s: "calm", left: 0, next: 99999 }; G.t = 5; G.night = 0; G.fog = 0; G.rain = 0; G.wx = "clear";
  P.x = 3000; P.y = 3000; P.hp = 100; P.inv = []; Mutants.list = []; Stalkers.list = []; W.anoms = []; W.arts = []; W.loot = []; P.sneak = false; keys.mx = 0; keys.my = 0;
})()`);
const LST = `Object.keys(CFG.mut).find(k => CFG.mut[k].pack && !CFG.mut[k].timid && !CFG.mut[k].aquatic && !CFG.mut[k].stalker)`;

test("сталкеров стало заметно меньше", () => {
  const o = run(`(() => ({ bandit: CFG.stalkers.bandit.count, loner: CFG.stalkers.loner.count, wounded: CFG.stalkers.wounded.count }))()`);
  assert.ok(o.bandit <= 6); assert.ok(o.loner <= 6); assert.ok(o.wounded <= 4);
});

test("бандит замечает игрока не сразу: тревога копится, вне поля зрения спадает", () => {
  fresh();
  const o = run(`(() => {
    const b = new Stalker("bandit", 3000 + 130, 3000); Stalkers.list = [b]; b.state = "wander";
    b.perceive(130); const first = b.state, a1 = b.alert; let ticks = 1; while (b.state !== "combat" && ticks < 40) { b.perceive(130); ticks++; }
    const b2 = new Stalker("bandit", 3000 + 210, 3000); b2.state = "wander"; let t2 = 0; while (b2.state !== "combat" && t2 < 60) { b2.perceive(210); t2++; }
    const b3 = new Stalker("bandit", 3000 + 130, 3000); b3.state = "wander"; b3.perceive(130); b3.perceive(130); const mid = b3.alert; for (let i = 0; i < 12; i++) b3.perceive(900);
    P.sneak = true; const b4 = new Stalker("bandit", 3000 + 150, 3000); b4.state = "wander"; let t4 = 0; while (b4.state !== "combat" && t4 < 80) { b4.perceive(150); t4++; }
    return { first, a1, near: ticks, far: t2, mid, after: b3.alert, state3: b3.state, sneak: t4 };
  })()`);
  assert.equal(o.first, "wander", "с первого взгляда не нападает"); assert.ok(o.a1 > 0); assert.ok(o.near >= 3 && o.near <= 8, "вблизи за ~1-2 с: " + o.near); assert.ok(o.far > o.near, "у края замечает дольше");
  assert.ok(o.mid > 0 && o.after < o.mid && o.state3 === "wander", "тревога спадает"); assert.ok(o.sneak > o.near, "крадущегося замечают дольше");
});

test("сталкер воюет с мутантом рядом: находит цель, стреляет, мутант получает урон и отвечает", () => {
  fresh();
  const o = run(`(() => {
    const sp = ${LST}; const m = new Mutant(sp, 3100, 3000, null); m.state = "wander"; Mutants.list = [m]; const s = new Stalker("bandit", 3000 + 20, 3000 + 150); s.hostile = false; s.state = "wander"; Stalkers.list = [s];
    const R0 = Math.random; Math.random = () => 0.0; s.perceive(999); const foe = s.foe === m, st = s.state; const hp0 = m.hp;
    for (let i = 0; i < 40; i++) { s.update(0.1); m.update(0.1); } Math.random = R0;
    return { hp0, hp: m.hp, dead: m.dead, cd: s.cd, sst: s.state, foe, st, hurt: m.hp < hp0 || m.dead, mstate: m.state, target: m.target === s || m.dead || m.state === "flee", tr: tracers.length >= 0 };
  })()`);
  assert.equal(o.foe, true); assert.equal(o.st, "combat"); assert.equal(o.hurt, true, JSON.stringify(o)); assert.ok(o.target);
});

test("мирный одиночка отстреливается от мутанта, но игроку не враг", () => {
  fresh();
  const o = run(`(() => {
    const sp = ${LST}; const m = new Mutant(sp, 3080, 3000, null); m.state = "hunt"; Mutants.list = [m]; const s = new Stalker("loner", 3000, 3000 + 200); Stalkers.list = [s]; m.target = s;
    const hostile0 = s.hostile; s.perceive(200); const fights = s.state === "combat" && s.foe === m; m.dead = true; s.update(0.1); const after = s.state, foe = s.foe;
    const b = new Stalker("bandit", 3000, 3400); b.hurt(5, P); const notFoe = b.foe;
    return { hostile0, fights, after, foe, notFoe, dmg: CFG.stalkers.loner.dmg > 0 };
  })()`);
  assert.equal(o.hostile0, false); assert.equal(o.fights, true); assert.equal(o.after, "wander", "убил — успокоился"); assert.equal(o.foe, null); assert.equal(o.notFoe, null, "игрок не становится «мутантом-целью»"); assert.equal(o.dmg, true);
});

test("голодный хищник нападает на сталкера, а раненые и лагерь — вне игры", () => {
  fresh();
  const o = run(`(() => {
    const sp = ${LST}; P.x = 1000; P.y = 1000;
    const mk = () => { const m = new Mutant(sp, 3000, 3000, null); m.state = "wander"; m.hunger = 0.9; m.fear = 0; m.pack = null; return m; };
    const s = new Stalker("bandit", 3000 + 40, 3000); s.hostile = false; Stalkers.list = [s]; const m = mk(); Mutants.list = [m]; G.night = 1; m.perceive();
    const hunts = m.state === "hunt" && m.target === s, engaged = s.foe === m;
    const w = new Stalker("wounded", 3000 + 40, 3000); Stalkers.list = [w]; const m2 = mk(); Mutants.list = [m2]; m2.perceive(); const wounded = m2.state;
    const camp = new Stalker("bandit", W.C.x + 30, W.C.y); Stalkers.list = [camp]; const m3 = mk(); m3.x = W.C.x; m3.y = W.C.y; Mutants.list = [m3]; m3.perceive(); const inCampState = m3.state;
    const full = mk(); full.hunger = 0; const s4 = new Stalker("bandit", 3040, 3000); Stalkers.list = [s4]; Mutants.list = [full]; full.perceive(); const sated = full.state;
    return { hunts, engaged, wounded, inCampState, sated };
  })()`);
  assert.equal(o.hunts, true); assert.equal(o.engaged, true); assert.notEqual(o.wounded, "hunt"); assert.notEqual(o.inCampState, "hunt"); assert.notEqual(o.sated, "hunt", "сытый (и не стая) не нападает");
});

test("охота мутанта на сталкера: удар по цели-сталкеру работает, сталкер может погибнуть и оставить тело", () => {
  fresh();
  const o = run(`(() => {
    const sp = ${LST}; const m = new Mutant(sp, 3000, 3000, null); const s = new Stalker("bandit", 3000 + 12, 3000); s.hp = 1; s.hostile = false; Stalkers.list = [s]; Mutants.list = [m];
    m.startHunt(s); const c0 = W.corpses.length; for (let i = 0; i < 60 && !s.dead; i++) { m.update(0.1); s.update(0.1); } return { dead: s.dead, corpse: W.corpses.length > c0 };
  })()`);
  assert.equal(o.dead, true); assert.equal(o.corpse, true);
});

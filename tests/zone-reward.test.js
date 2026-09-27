"use strict";
// v0.26: награда растёт с глубиной пропорционально риску (CFG.reward.mul).
const test = require("node:test");
const assert = require("node:assert/strict");
const { createZone } = require("./zone-load");

const z = createZone();
const run = code => JSON.parse(JSON.stringify(z.run(code) ?? null));

test("множитель награды по секторам и его применение к контейнерам: деньги и количество добычи растут пропорционально", () => {
  const o = run(`(() => {
    W = new World(1234); const mul = [1, 2, 3, 4].map(d => W.rw(d)), rnd = U.rng(5), avg = d => { let money = 0, junk = 0, n = 4000; for (let i = 0; i < n; i++) for (const [id, k] of W.rollLoot(d, false, rnd)) { if (id === "money") money += k; else if (["scrap", "circuit", "battery"].includes(id)) junk += k; } return { money: money / n, junk: junk / n }; };
    return { mul, cfg: CFG.reward.mul, a: [1, 2, 3, 4].map(avg), clamp: [W.rw(0), W.rw(9), W.rw(2.4)] };
  })()`);
  assert.deepEqual(o.mul, o.cfg); assert.deepEqual(o.clamp, [1, 3.6, 1.7]);
  for (let i = 1; i < 4; i++) {
    const k = o.cfg[i] / o.cfg[0]; assert.ok(Math.abs(o.a[i].money / o.a[0].money - k) < 0.2 * k, "деньги, сектор " + (i + 1) + ": " + (o.a[i].money / o.a[0].money).toFixed(2) + " vs " + k);
    assert.ok(o.a[i].junk / o.a[0].junk > 0.85 * k, "хлам, сектор " + (i + 1) + ": " + (o.a[i].junk / o.a[0].junk).toFixed(2));
  }
});

test("трофеи с убитых сталкеров и бункеры тоже награждают за глубину", () => {
  const o = run(`(() => {
    W = new World(1234); resetPlayer(); Meta.reset(); const money = d => { let s = 0; const orig = W.danger; W.danger = () => d; for (let i = 0; i < 300; i++) { const st = new Stalker("bandit", 3000, 3000); st.die(null); const c = W.corpses[W.corpses.length - 1]; s += c.items.filter(x => x[0] === "money").reduce((a, x) => a + x[1], 0); } W.danger = orig; return s / 300; };
    const lockers = d => { let s = 0; W.danger = () => d; const b = W.bunkers[0]; Dungeon.enter(b); Dungeon.lvl.seed = 9; for (let i = 0; i < 60; i++) { b.gen = i; s += Dungeon.lockerLoot(b, 1).filter(x => x[0] === "money").reduce((a, x) => a + x[1], 0); } Dungeon.leave(); W.danger = World.prototype.danger; return s / 60; };
    return { st1: money(1), st4: money(4), lk1: lockers(1), lk4: lockers(4) };
  })()`);
  assert.ok(o.st4 / o.st1 > 3 && o.st4 / o.st1 < 4.2, "сталкеры " + (o.st4 / o.st1).toFixed(2)); assert.ok(o.lk4 / o.lk1 > 3.2 && o.lk4 / o.lk1 < 4, "шкафчики " + (o.lk4 / o.lk1).toFixed(2));
});

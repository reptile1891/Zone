"use strict";
// «Обочина» v0.10: Самострел (бесшумный, стреляет болтами) и Налобный фонарь под подземелья.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createZone } = require("./zone-load");

const z = createZone();
const CFG = z.get("CFG");
const run = code => JSON.parse(JSON.stringify(z.run(code) ?? null));
const fresh = () => z.run(`(() => {
  W = new World(1234); resetPlayer(); P.stash = []; P.bld = null; Mutants.spawn(); Stalkers.spawn(); Meta.reset(); Camp.enter(true);
  G.events = []; G.dead = false; G.emi = { s: "calm", left: 0, next: 99999 }; G.t = 5; P.hp = 100; P.money = 1000; P.inv = []; P.cd = 0; keys.mx = 0; keys.my = 0; P.sneak = false;
  Stalkers.list = []; Mutants.list = []; localStorage.removeItem("zone_save_v2");
})()`);
const CORRIDOR = ["##############", "#............#", "##############"];
const arena = () => z.run(`(() => {
  const rows = ${JSON.stringify(CORRIDOR)}, h = rows.length, w = rows[0].length, t = new Uint8Array(w * h); rows.forEach((r, y) => [...r].forEach((ch, x) => { t[y * w + x] = ch === "#" ? 1 : 0; }));
  Dungeon.cur = W.bunkers[0]; Dungeon.lvl = { w, h, t, start: { tx: 1, ty: 1 }, vault: { tx: w - 2, ty: 1 }, lockers: [], rad: new Set(), spawns: [], dist: new Uint16Array(w * h), seed: 1 };
  G.scene = "dungeon"; Dungeon.enemies = []; Dungeon.shots = []; P.x = 1.5 * 48; P.y = 1.5 * 48; P.ang = 0;
})()`);

test("Самострел: в конфиге, есть спрайт и иконка, бесшумнее всех, сильнее пистолета за выстрел, стреляет болтами", () => {
  const w = CFG.weapons.crossbow, others = Object.entries(CFG.weapons).filter(([k]) => k !== "crossbow");
  assert.equal(w.ammo, "bolt"); assert.ok(CFG.items.bolt); assert.ok(others.every(([, o]) => w.noise < o.noise / 5), "самый тихий"); assert.ok(w.dmg > CFG.weapons.pistol.dmg);
  assert.ok(w.lvl <= 3 && w.price > 0); assert.ok(z.get("Gun.def.crossbow")); assert.ok(z.get('Icons.cache["w_crossbow"]') !== undefined);
});

test("Самострел: тратит болт, а не патрон; без болтов не стреляет; болты остаются нужны для проверки аномалий", () => {
  fresh(); arena();
  const o = run(`(() => {
    P.weapons.push("crossbow"); P.weapon = "crossbow"; P.cond.crossbow = 100; invAdd("ammo", 5); invAdd("bolt", 2);
    const e = new DEnemy(P.x + 100, P.y, CFG.dungeon.enemies.crawler, 1); Dungeon.enemies = [e]; const orig = Math.random; Math.random = () => 0.5; try { shoot(); } finally { Math.random = orig; }
    const a = { ammo: invCount("ammo"), bolt: invCount("bolt"), dmg: e.max - e.hp }; P.cd = 0; invTake("bolt", 1); shoot(); const b = { bolt: invCount("bolt"), cd: P.cd };
    P.cd = 0; const hp = e.hp; shoot(); return { a, b, same: e.hp === hp, quick: document.getElementById("quick") ? 1 : 1 };
  })()`);
  assert.equal(o.a.ammo, 5, "патроны не тронуты"); assert.equal(o.a.bolt, 1); assert.equal(o.a.dmg, 34); assert.equal(o.b.bolt, 0); assert.equal(o.b.cd, 0.3, "без болтов — щелчок"); assert.ok(o.same);
});

test("Самострел не будит: выстрел слышен на ~96 px, пистолет — на ~1200; Тень и подземник дальше не проснутся", () => {
  fresh(); arena();
  const o = run(`(() => {
    P.weapons.push("crossbow"); P.cond.crossbow = 100; P.cond.pistol = 100; invAdd("ammo", 5); invAdd("bolt", 5); const res = {};
    for (const w of ["crossbow", "pistol"]) {
      P.weapon = w; P.cd = 0; P.ang = Math.PI; const e = new DEnemy(P.x + 300, P.y, CFG.dungeon.enemies.crawler, 1); e.state = "idle"; Dungeon.enemies = [e]; keys.mx = 0; shoot(); res[w] = e.state;   // стреляем в стену, а не во врага
    }
    const near = new DEnemy(P.x + 60, P.y, CFG.dungeon.enemies.shade, 1, "shade"); Dungeon.enemies = [near]; P.weapon = "crossbow"; P.cd = 0; P.ang = Math.PI; shoot(); res.near = near.state; return res;
  })()`);
  assert.equal(o.crossbow, "idle"); assert.equal(o.pistol, "hunt"); assert.equal(o.near, "hunt", "вплотную всё равно услышат");
});

test("Самострел: покупается у оружейника с уровня 2; износ и ремонт работают", () => {
  fresh();
  const o = run(`(() => {
    P.bld = Camp.DEFAULT_BLD(); const hidden = !Meta.tradeExtra("gun").includes("Самострел"); P.bld.gun = 2; P.money = 2000; const shown = Meta.tradeExtra("gun").includes("Самострел");
    Meta.click("wbuy", "crossbow", 0, { v: "gun" }); const bought = P.weapons.includes("crossbow") && P.weapon === "crossbow", m = P.money;
    P.cond.crossbow = 60; const cost = Meta.repairCost("crossbow"); Meta.click("wrepair", "crossbow", 0, { v: "gun" }); return { hidden, shown, bought, m, cost, cond: P.cond.crossbow };
  })()`);
  assert.ok(o.hidden && o.shown && o.bought); assert.equal(o.m, 2000 - CFG.weapons.crossbow.price); assert.ok(o.cost > 0); assert.equal(o.cond, 100);
});

test("Налобный фонарь: продаётся в снабжении с уровня 2 и расширяет круг, где видна Тень", () => {
  fresh(); arena();
  const o = run(`(() => {
    P.bld = Camp.DEFAULT_BLD(); const hide = !Camp.stock("gear").includes("headlamp"); P.bld.gear = 2; const show = Camp.stock("gear").includes("headlamp");
    const sh = new DEnemy(P.x + 160, P.y, CFG.dungeon.enemies.shade, 1, "shade"); Dungeon.enemies = [sh]; const without = sh.alpha(); invAdd("headlamp", 1); const withLamp = sh.alpha();
    sh.x = P.x + 100; const closeWith = sh.alpha(); return { hide, show, without, withLamp, closeWith, price: buyPrice("headlamp") };
  })()`);
  assert.ok(o.hide && o.show); assert.equal(o.without, 0); assert.ok(o.withLamp > 0.4 && o.withLamp < 1, "фонарь приоткрывает тень: " + o.withLamp); assert.equal(o.closeWith, 1);
  assert.ok(o.price > 0);
});

test("подсказки: самострел и фонарь описаны", () => {
  fresh();
  const o = run(`(() => ({ w: Tip.weapon("crossbow"), l: Tip.item("headlamp", "buy") }))()`);
  const t = s => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(t(o.w), /бесшумный/); assert.match(t(o.w), /Боеприпас: Болт/); assert.match(t(o.l), /Налобный фонарь/); assert.match(t(o.l), /Тени/);
});

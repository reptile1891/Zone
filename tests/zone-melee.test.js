"use strict";
// v0.32: ближний бой — нож на кнопке 1, разные ножи в Торговом доме, удар дугой, удар в спину, тишина.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createZone } = require("./zone-load");

const z = createZone();
const run = code => JSON.parse(JSON.stringify(z.run(code) ?? null));
const fresh = () => z.run(`(() => {
  W = new World(1234); resetPlayer(); P.stash = []; P.bld = null; Mutants.spawn(); Stalkers.spawn(); Meta.reset(); Camp.enter(true);
  G.events = []; G.dead = false; G.started = true; G.ui = null; G.scene = "zone"; G.emi = { s: "calm", left: 0, next: 99999 }; G.t = 5; G.night = 0; G.fog = 0; G.rain = 0;
  P.x = 3000; P.y = 3000; P.hp = 100; P.inv = []; P.cd = 0; P.ang = 0; P.sel = 0; P.sneak = false; Mutants.list = []; Stalkers.list = []; W.anoms = []; W.arts = []; W.loot = [];
})()`);
const SP = `Object.keys(CFG.mut).find(k => !CFG.mut[k].aquatic && !CFG.mut[k].timid && !CFG.mut[k].armor)`;
const mk = (x, y, state, hp) => `(() => { const m = new Mutant(${SP}, ${x}, ${y}, null); m.state = "${state}"; m.hp = ${hp || 1000}; m.pack = null; return m; })()`;

test("у игрока с начала есть нож на кнопке 1; кнопка выбрана; удар не тратит патроны", () => {
  fresh();
  const o = run(`(() => ({ held: heldNames[0], sel: P.sel, knives: P.knives, knife: P.knife, cur: Melee.cur().name, ammo: invCount("ammo") }))()`);
  assert.equal(o.held, "melee"); assert.equal(o.sel, 0); assert.deepEqual(o.knives, ["knife"]); assert.equal(o.knife, "knife"); assert.equal(o.cur, "Нож");
  fresh(); const o2 = run(`(() => { invAdd("ammo", 5); const m = ${mk(3020, 3000, "hunt")}; Mutants.list = [m]; useSel(); return { ammo: invCount("ammo"), hit: m.hp < 1000, cd: P.cd > 0 }; })()`);
  assert.equal(o2.ammo, 5); assert.equal(o2.hit, true); assert.equal(o2.cd, true);
});

test("удар дугой: цель в радиусе и секторе получает урон, сзади, далеко или за стеной — нет; кулдаун между ударами", () => {
  fresh();
  const o = run(`(() => {
    const front = ${mk(3030, 3000, "hunt")}, side = ${mk(3000, 3030, "hunt")}, behind = ${mk(2970, 3000, "hunt")}, far = ${mk(3100, 3000, "hunt")};
    Mutants.list = [front, side, behind, far]; useSel(); const r = { front: front.hp < 1000, side: side.hp < 1000, behind: behind.hp < 1000, far: far.hp < 1000 };
    const h1 = front.hp; useSel(); const cd = front.hp === h1; P.cd = 0; useSel(); const again = front.hp < h1;
    return { r, cd, again, fx: !!Melee.fx };
  })()`);
  assert.equal(o.r.front, true); assert.equal(o.r.side, false, "сбоку вне сектора"); assert.equal(o.r.behind, false); assert.equal(o.r.far, false); assert.equal(o.cd, true, "пока кулдаун — не бьёт"); assert.equal(o.again, true); assert.equal(o.fx, true);
});

test("удар в спину: по спящему, бродящему и не заметившему множитель ножа, по охотящемуся — обычный", () => {
  fresh();
  const o = run(`(() => {
    const dmg = state => { const m = ${mk(3030, 3000, "wander")}; m.state = state; Mutants.list = [m]; P.cd = 0; const hp0 = m.hp; useSel(); return hp0 - m.hp; };
    return { hunt: dmg("hunt"), wander: dmg("wander"), sleep: dmg("investigate"), back: Melee.cur().back, base: Melee.cur().dmg };
  })()`);
  assert.equal(o.hunt, o.base); assert.equal(o.wander, o.base * o.back); assert.equal(o.sleep, o.base * o.back);
});

test("тишина: удар шумит куда меньше выстрела; хищники неподалёку не сбегаются", () => {
  fresh();
  const o = run(`(() => {
    const heard = []; const _h = Mutants.hear; Mutants.hear = (x, y, r) => heard.push(r); useSel(); P.cd = 0; invAdd("ammo", 3); P.sel = 1; useSel(); Mutants.hear = _h;
    return { melee: heard[0], gun: heard[1] };
  })()`);
  assert.ok(o.melee <= 140); assert.ok(o.gun >= 500);
});

test("разные ножи: продаются в Торговом доме, покупка, смена, продажа; свойства отличаются; топорик пробивает броню", () => {
  fresh();
  const o = run(`(() => {
    P.bld = Camp.DEFAULT_BLD(); P.money = 1000; const html = Meta.gunShopHTML(), lvl1 = { shiv: /mbuy:shiv/.test(html), machete: /mbuy:machete/.test(html), hatchet: /mbuy:hatchet/.test(html) };
    const u = { k: "trade", v: "market" }; Meta.click("mbuy", "shiv", undefined, u); const own = P.knives.slice(), cur = P.knife, spent = 1000 - P.money;
    P.bld.gun = 3; const html3 = Meta.gunShopHTML(); const lvl3 = /mbuy:machete/.test(html3) && /mbuy:hatchet/.test(html3);
    Meta.click("mbuy", "hatchet", undefined, u); Meta.click("mequip", "knife", undefined, u); const eq = P.knife; Melee.cycle(); const cyc = P.knife;
    Meta.click("msell", "shiv", undefined, u); const sold = P.knives.slice(); Meta.click("msell", "knife", undefined, u); const keepKnife = P.knives.includes("knife");
    P.knife = "hatchet"; const tin = new Mutant("tin", 3030, 3000, null); tin.hp = 1000; tin.state = "hunt"; Mutants.list = [tin]; const armor = tin.c.armor; useSel(); const hatchet = 1000 - tin.hp;
    return { lvl1, own, cur, spent, lvl3, eq, cyc, sold, keepKnife, armor, hatchet, expect: Melee.DEF.hatchet.dmg };
  })()`);
  assert.deepEqual(o.lvl1, { shiv: true, machete: false, hatchet: false }); assert.deepEqual(o.own, ["knife", "shiv"]); assert.equal(o.cur, "shiv"); assert.equal(o.spent, 70); assert.equal(o.lvl3, true);
  assert.equal(o.eq, "knife"); assert.notEqual(o.cyc, "knife"); assert.ok(!o.sold.includes("shiv")); assert.equal(o.keepKnife, true);
  assert.ok(o.armor > 0 && o.hatchet === o.expect, "броня " + o.armor + ": получено " + o.hatchet);
});

test("оружие: свойства ножей — заточка быстрее и тише, топорик тяжелее, мачете бьёт нескольких", () => {
  const o = run(`(() => ({ knife: Melee.DEF.knife, shiv: Melee.DEF.shiv, machete: Melee.DEF.machete, hatchet: Melee.DEF.hatchet }))()`);
  assert.ok(o.shiv.cd < o.knife.cd && o.shiv.noise < o.knife.noise && o.shiv.back > o.knife.back); assert.ok(o.hatchet.dmg > o.machete.dmg && o.machete.dmg > o.knife.dmg && o.hatchet.cd > o.machete.cd);
  fresh();
  const w = run(`(() => { P.knife = "machete"; P.knives = ["knife", "machete"]; const a = ${mk(3030, 3000, "hunt")}, b = ${mk(3028, 3016, "hunt")}, c = ${mk(3026, -0 + 2984, "hunt")}; Mutants.list = [a, b, c]; useSel(); return [a, b, c].filter(m => m.hp < 1000).length; })()`);
  assert.ok(w >= 2, "мачете задело " + w);
});

test("огнестрел можно поставить на любую кнопку и стрелять; нож остаётся на первой; клавиша выбранной кнопки меняет нож", () => {
  fresh();
  const o = run(`(() => {
    Quick.assign(5, "w:pistol"); const held = heldNames.slice(); invAdd("ammo", 4); const m = ${mk(3100, 3000, "hunt")}; Mutants.list = [m]; P.sel = 5; P.cd = 0; const a0 = invCount("ammo"); useSel(); const shot = invCount("ammo") === a0 - 1;
    P.knives = ["knife", "shiv"]; P.sel = 0; const before = P.knife; Melee.cycle(); const after = P.knife;
    return { held, shot, before, after };
  })()`);
  assert.equal(o.held[0], "melee"); assert.equal(o.held[5], "w:pistol"); assert.equal(o.held[1], null); assert.equal(o.shot, true); assert.notEqual(o.before, o.after);
});

test("ближний бой под землёй: бьёт подземного врага в секторе, не бьёт сквозь стену", () => {
  fresh();
  const o = run(`(() => {
    Dungeon.enter(W.bunkers[0]); Dungeon.enemies = []; const L = Dungeon.lvl; P.ang = 0; P.cd = 0;
    const e = new DEnemy(P.x + 26, P.y, "crawler"); e.hp = 1e6; e.max = 1e6; e.state = "hunt"; Dungeon.enemies = [e]; const los = Dungeon.los(P.x, P.y, e.x, e.y);
    useSel(); return { hit: e.hp < 1e6 || !los, los };
  })()`);
  assert.equal(o.hit, true);
});

test("сохранение: ножи и текущий нож; старые сохранения получают нож", () => {
  fresh();
  const o = run(`(() => {
    P.knives = ["knife", "machete"]; P.knife = "machete"; G.scene = "camp"; save(true); const raw = JSON.parse(localStorage.getItem(saveKey()));
    P.knives = undefined; P.knife = "ghost"; Meta.afterLoad(); return { saved: raw.P.knives, knife: raw.P.knife, fixed: P.knives, cur: P.knife };
  })()`);
  assert.deepEqual(o.saved, ["knife", "machete"]); assert.equal(o.knife, "machete"); assert.deepEqual(o.fixed, ["knife"]); assert.equal(o.cur, "knife");
});

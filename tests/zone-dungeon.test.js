"use strict";
// «Обочина» v0.9: подземелья под бункерами — лабиринт, вход и выход, подземники, стены и стрельба, добыча, сохранение, смерть.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createZone } = require("./zone-load");

const z = createZone();
const CFG = z.get("CFG");
// результаты прогоняем через JSON: объекты из песочницы имеют другой Object.prototype
const run = code => JSON.parse(JSON.stringify(z.run(code) ?? null));
const fresh = (seed = 1234) => z.run(`(() => {
  W = new World(${seed}); resetPlayer(); P.stash = []; P.bld = null; Mutants.spawn(); Stalkers.spawn(); Meta.reset(); Camp.enter(true); Dungeon.levels = {};
  G.events = []; G.dead = false; G.scene = "zone"; G.night = 0; G.hour = 12; G.fog = 0; G.rain = 0; G.emi = { s: "calm", left: 0, next: 99999 };
  P.hp = 100; P.money = 1000; P.inv = []; P.rep = 0; P.quests = []; P.offers = []; P.cond.pistol = 100; localStorage.removeItem("zone_save_v2");
  const b = W.bunkers[0]; P.x = b.x; P.y = b.y; Stalkers.list = []; Mutants.list = [];
})()`);

test("генерация: лабиринт детерминирован по сиду и связен, вход и сейф — пол, сейф — самая дальняя клетка", () => {
  fresh();
  const o = run(`(() => {
    const a = Dungeon.build(42, 3), b = Dungeon.build(42, 3), c = Dungeon.build(43, 3);
    const same = Array.from(a.t).join("") === Array.from(b.t).join(""), diff = Array.from(a.t).join("") !== Array.from(c.t).join("");
    const floors = Array.from(a.t).filter(v => v === 0).length, reached = Array.from(a.dist).filter(v => v !== 65535).length;
    const at = (t) => t.ty * a.w + t.tx, maxCell = Math.max(...Array.from({ length: CFG.dungeon.cols * CFG.dungeon.rows }, (_, i) => a.dist[(2 * Math.floor(i / CFG.dungeon.cols) + 1) * a.w + 2 * (i % CFG.dungeon.cols) + 1]));
    return { same, diff, floors, reached, w: a.w, h: a.h, startFloor: a.t[at(a.start)], vaultFloor: a.t[at(a.vault)], vaultDist: a.dist[at(a.vault)], maxCell,
      lockers: a.lockers.length, lockersFloor: a.lockers.every(l => a.t[l.ty * a.w + l.tx] === 0), distinct: new Set([a.start, a.vault, ...a.lockers].map(t => t.tx + "," + t.ty)).size,
      spawns: a.spawns.length, spawnFar: a.spawns.every(s => a.dist[at(s)] >= 7), border: Array.from({ length: a.w }, (_, x) => a.t[x] + a.t[(a.h - 1) * a.w + x]).every(v => v === 2) };
  })()`);
  assert.ok(o.same && o.diff); assert.equal(o.floors, o.reached, "весь пол достижим от входа");
  assert.equal(o.w, 2 * CFG.dungeon.cols + 1); assert.equal(o.startFloor, 0); assert.equal(o.vaultFloor, 0); assert.equal(o.vaultDist, o.maxCell, "сейф в самой дальней клетке");
  assert.equal(o.lockers, CFG.dungeon.lockers); assert.ok(o.lockersFloor); assert.equal(o.distinct, 2 + CFG.dungeon.lockers);
  assert.equal(o.spawns, CFG.dungeon.base + 3); assert.ok(o.spawnFar, "подземники не рядом с входом"); assert.ok(o.border, "лабиринт обнесён стеной");
});

test("генерация: у каждого бункера свой лабиринт, шкафчики в тупиках, есть очаги радиации", () => {
  fresh();
  const o = run(`(() => {
    const seeds = W.bunkers.map(b => Array.from(Dungeon.level(b).t).join(""));
    const L = Dungeon.level(W.bunkers[0]), open = (tx, ty) => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !L.t[(ty + dy) * L.w + tx + dx]).length;
    return { unique: new Set(seeds).size, bunkers: seeds.length, deadEnds: L.lockers.filter(l => open(l.tx, l.ty) === 1).length, rad: L.rad.size };
  })()`);
  assert.equal(o.unique, o.bunkers); assert.ok(o.deadEnds >= 1, "хотя бы часть шкафчиков в тупиках"); assert.ok(o.rad >= 2);
});

test("вход и выход: E у бункера спускает в подземелье, выход возвращает к бункеру, Camp.enter сбрасывает подземелье", () => {
  fresh();
  const o = run(`(() => {
    const b = W.bunkers[0]; const labels = []; Dungeon.nearZone((o, d, lim, label) => { if (d < lim) labels.push(label); });
    Dungeon.enter(b); const inside = { scene: G.scene, tile: Dungeon.wall(Math.floor(P.x / 48), Math.floor(P.y / 48)), enemies: Dungeon.enemies.length, cur: Dungeon.cur.i };
    Dungeon.leave(); const back = { scene: G.scene, dist: Math.hypot(P.x - b.x, P.y - b.y), cur: Dungeon.cur };
    Dungeon.enter(b); Camp.enter(true); return { labels, inside, back, camp: G.scene, cur: Dungeon.cur, en: Dungeon.enemies.length };
  })()`);
  assert.deepEqual(o.labels, ["Спуститься в бункер"]); assert.equal(o.inside.scene, "dungeon"); assert.equal(o.inside.tile, false); assert.ok(o.inside.enemies >= 3);
  assert.equal(o.back.scene, "zone"); assert.ok(o.back.dist < 60); assert.equal(o.back.cur, null); assert.equal(o.camp, "camp"); assert.equal(o.cur, null); assert.equal(o.en, 0);
});

test("стены: игрок не проходит сквозь стены, скользит вдоль них; пуля и огонь останавливаются о стену", () => {
  fresh();
  const o = run(`(() => {
    const b = W.bunkers[0]; Dungeon.enter(b); const L = Dungeon.lvl, T = 48;
    // шагаем в стену слева от входа (тайл 0 — рамка лабиринта)
    P.x = 1.5 * T; P.y = L.start.ty * T + T / 2; for (let i = 0; i < 40; i++) { P.x -= 4; Dungeon.clampP(); }
    const inWall = Dungeon.wall(Math.floor((P.x - P.r + 0.5) / T), Math.floor(P.y / T)), minX = P.x;
    // лучом вдоль стены — недалеко; вдоль коридора — до предела
    P.x = 1.5 * T; const ray = Dungeon.rayLen(P.x, P.y, -1, 0, 500);
    const los = Dungeon.los(P.x, P.y, 0.5 * T, P.y);
    return { inWall, minX, r: P.r, ray, los };
  })()`);
  assert.equal(o.inWall, false); assert.ok(o.minX >= 48 + o.r - 0.5, "игрок упёрся в стену: x=" + o.minX); assert.ok(o.ray < 80); assert.equal(o.los, false);
});

test("стрельба: в подземелье бьёт только подземников в прямой видимости; зональные мутанты не задеваются", () => {
  fresh();
  const o = run(`(() => {
    const b = W.bunkers[0]; Dungeon.enter(b); const L = Dungeon.lvl; const T = 48;
    // ищем два тайла подряд в открытом коридоре по горизонтали от входа
    P.x = (L.start.tx + 0.5) * T; P.y = (L.start.ty + 0.5) * T; P.ang = 0; P.weapon = "pistol"; P.cd = 0; invAdd("ammo", 10); keys.mx = 0; keys.my = 0;
    let len = 0; while (!Dungeon.wall(L.start.tx + len + 1, L.start.ty)) len++;
    const zm = new Mutant("tin", P.x + 30, P.y, null); zm.state = "wander"; Mutants.list = [zm];
    Dungeon.enemies = []; const seen = new DEnemy(P.x + Math.min(len, 3) * T * 0.9, P.y, CFG.dungeon.enemy, 1);
    const hidden = new DEnemy(P.x + (len + 3) * T, P.y, CFG.dungeon.enemy, 1); Dungeon.enemies.push(seen, hidden);
    const origRnd = Math.random; Math.random = () => 0.5; try { shoot(); } finally { Math.random = origRnd; }
    return { len, seenHp: seen.hp, seenMax: seen.max, hiddenHp: hidden.hp, tin: zm.hp, tinMax: CFG.mut.tin.hp, state: seen.state };
  })()`);
  assert.ok(o.len >= 1);
  assert.ok(o.seenHp < o.seenMax, "видимый подземник получил пулю"); assert.equal(o.hiddenHp, 50, "за стеной — нет"); assert.equal(o.tin, o.tinMax, "зональная жестянка не задета"); assert.equal(o.state, "hunt");
});

test("подземник: замечает игрока в прямой видимости, идёт по коридорам кратчайшим путём и кусает", () => {
  fresh();
  const o = run(`(() => {
    const b = W.bunkers[0]; Dungeon.enter(b); const L = Dungeon.lvl, T = 48, c = CFG.dungeon.enemy;
    const far = Dungeon.center(L.vault.tx, L.vault.ty);                                   // враг в самой дальней клетке, игрок у входа — стены между ними
    Dungeon.enemies = []; const e = new DEnemy(far.x, far.y, c, 1); Dungeon.enemies.push(e); e.state = "hunt";
    const start = Math.hypot(e.x - P.x, e.y - P.y); P.hp = 100; P.sneak = false;
    for (let i = 0; i < 20 * 60; i++) { e.lost = 0; Dungeon.tick(0.05); if (P.hp < 100) break; }   // lost обнуляем: проверяем именно путь, а не потерю следа
    return { start, end: Math.hypot(e.x - P.x, e.y - P.y), hurt: 100 - P.hp, wallHit: Dungeon.wall(Math.floor(e.x / T), Math.floor(e.y / T)) };
  })()`);
  assert.ok(o.hurt > 0, "за 60 с подземник должен дойти по лабиринту и укусить"); assert.equal(o.wallHit, false); assert.ok(o.end < o.start);
});

test("подземник: теряет след через 7 с без прямой видимости; выстрел или шум зовут его", () => {
  fresh();
  const o = run(`(() => {
    const b = W.bunkers[0]; Dungeon.enter(b); const L = Dungeon.lvl; Dungeon.enemies = [];
    const far = Dungeon.center(L.vault.tx, L.vault.ty), e = new DEnemy(far.x, far.y, CFG.dungeon.enemy, 1); Dungeon.enemies.push(e);
    const idle0 = e.state; Dungeon.hear(P.x, P.y, 10); const deaf = e.state; Dungeon.hear(far.x + 20, far.y, 100); const woke = e.state;
    e.hp = 999; P.x = 10 * 48 + 24; for (let i = 0; i < 200; i++) e.update(0.05); return { idle0, deaf, woke, after: e.state };
  })()`);
  assert.equal(o.idle0, "idle"); assert.equal(o.deaf, "idle"); assert.equal(o.woke, "hunt");
});

test("шкафчики и сейф: вскрываются один раз, дают добычу; сейф — деньги, артефакт, знание и задание", () => {
  fresh();
  const o = run(`(() => {
    const b = W.bunkers[0]; Dungeon.enter(b); P.money = 0; P.inv = []; P.lore = 0;
    P.quests = [{ type: "vault", prog: 0, n: 1, reward: 260, rep: 6, text: "t", id: 1 }];
    const labels = []; const L = Dungeon.lvl; const k = L.lockers[0], kc = Dungeon.center(k.tx, k.ty); P.x = kc.x; P.y = kc.y;
    Dungeon.near((o, d, lim, label) => { if (d < lim) labels.push(label); });
    const pre = { money: P.money, items: P.inv.length }; Dungeon.openLocker(0); const afterOne = { money: P.money, items: P.inv.length }; Dungeon.openLocker(0);
    const same = P.money === afterOne.money && P.inv.length === afterOne.items;
    const vc = Dungeon.center(L.vault.tx, L.vault.ty); P.x = vc.x; P.y = vc.y; const vaultLabels = []; Dungeon.near((o, d, lim, label) => { if (d < lim) vaultLabels.push(label); });
    const m0 = P.money; Dungeon.openVault(); const vault = { money: P.money - m0, art: P.inv.some(s => s.art), lore: P.lore, done: Meta.done(P.quests[0]), opened: b.opened.slice() };
    Dungeon.openVault(); return { labels, pre, afterOne, same, vaultLabels, vault, again: P.money - m0 };
  })()`);
  assert.ok(o.labels.includes("Вскрыть шкафчик")); assert.ok(o.afterOne.money > 0 && o.afterOne.items >= 2); assert.ok(o.same, "повторно шкафчик не вскрыть");
  assert.ok(o.vaultLabels.includes("Вскрыть сейф")); assert.ok(o.vault.money >= 100 && o.vault.art); assert.equal(o.vault.lore, 1); assert.ok(o.vault.done);
  assert.deepEqual(o.vault.opened, [0, 99]); assert.equal(o.again, o.vault.money, "сейф второй раз не платит");
});

test("подземелье зачищается и пустеет до выброса; выброс перемешивает: часть шкафчиков заполняется, враги возвращаются", () => {
  fresh();
  const o = run(`(() => {
    const b = W.bunkers[0]; Dungeon.enter(b); for (const e of Dungeon.enemies) e.hp = 1; Dungeon.enemies.forEach(e => e.die(P)); Dungeon.tick(0.05);
    const cleared = b.cleared; const kills = P.kills; Dungeon.leave(); Dungeon.enter(b); const empty = Dungeon.enemies.length; Dungeon.leave();
    b.opened = [0, 1, 2, 3, 99]; const orig = Math.random; Math.random = () => 0.9; try { W.shake(); } finally { Math.random = orig; }
    const kept = b.opened.length, gen = b.gen; Math.random = () => 0.1; try { b.opened = [0, 1, 2, 3, 99]; W.shake(); } finally { Math.random = orig; }
    Dungeon.enter(b); return { cleared, kills, empty, kept, refilled: b.opened.length, again: Dungeon.enemies.length, gen };
  })()`);
  assert.ok(o.cleared); assert.ok(o.kills >= 3); assert.equal(o.empty, 0); assert.equal(o.kept, 5); assert.equal(o.refilled, 0); assert.ok(o.again >= 3);
});

test("подземелье: шум зовёт только подземников, зональные мутанты не слышат; болты и приманки не работают", () => {
  fresh();
  const o = run(`(() => {
    const b = W.bunkers[0]; const zm = new Mutant("listener", P.x, P.y, null); zm.state = "wander"; Mutants.list = [zm];
    Dungeon.enter(b); Dungeon.enemies = []; const e = new DEnemy(P.x + 60, P.y, CFG.dungeon.enemy, 1); Dungeon.enemies.push(e);
    zm.x = P.x + 10; zm.y = P.y; Mutants.hear(P.x, P.y, 500); const st = { zone: zm.state, dun: e.state };
    invAdd("bolt", 5); P.sel = 1; P.cd = 0; useSel(); const bolts = invCount("bolt"); invAdd("lure", 1); P.sel = 5; useSel(); const lures = invCount("lure");
    return { st, bolts, lures, blocked: G.scene };
  })()`);
  assert.equal(o.st.zone, "wander"); assert.equal(o.st.dun, "hunt"); assert.equal(o.bolts, 5, "болты не потрачены"); assert.equal(o.lures, 1);
});

test("радиация в очагах, голод и кровотечение продолжают действовать под землёй", () => {
  fresh();
  const o = run(`(() => {
    const b = W.bunkers[0]; Dungeon.enter(b); Dungeon.enemies = []; const L = Dungeon.lvl; const idx = [...L.rad][0], tx = idx % L.w, ty = (idx - tx) / L.w, c = Dungeon.center(tx, ty);
    P.x = c.x; P.y = c.y; P.rad = 0; P.food = 80; P.bleed = 5; P.hp = 90; const f0 = P.food;
    for (let i = 0; i < 20; i++) Dungeon.tick(0.1); return { rad: P.rad, foodLoss: f0 - P.food, bleed: P.bleed, hp: P.hp };
  })()`);
  assert.ok(o.rad > 1, "очаг радиации должен фонить"); assert.ok(o.foodLoss > 0); assert.ok(o.bleed < 5); assert.ok(o.hp < 90, "кровотечение отнимает HP");
});

test("выброс под землёй не бьёт: бункер — укрытие", () => {
  fresh();
  const o = run(`(() => {
    const b = W.bunkers[0]; Dungeon.enter(b); Dungeon.enemies = []; P.hp = 100; G.emi = { s: "blast", left: 5, next: 99999 }; const sheltered = isSheltered();
    for (let i = 0; i < 20; i++) Dungeon.tick(0.1); return { sheltered, hp: P.hp };
  })()`);
  assert.equal(o.sheltered, true); assert.ok(o.hp >= 99.9, "hp: " + o.hp);
});

test("смерть под землёй: хабар остаётся в тайнике у входа в бункер, а не в подземных координатах", () => {
  fresh();
  const o = run(`(() => {
    const b = W.bunkers[0]; invAdd("art", 1, "soul"); P.money = 1000; P.insured = false; W.caches = []; Dungeon.enter(b); die();
    const c = W.caches[0]; return { x: Math.round(c.x - b.x), y: Math.round(c.y - b.y), money: c.money, arts: c.items.length, scene: G.scene };
  })()`);
  assert.equal(o.x, 0); assert.equal(o.y, 42); assert.equal(o.money, 400); assert.equal(o.arts, 1);
});

test("сохранение: вскрытые шкафчики переживают загрузку; в подземелье автосохранение с пометкой field, обычное — нет", () => {
  fresh();
  const o = run(`(() => {
    const b = W.bunkers[2]; b.opened = [0, 99]; P.money = 500; Camp.enter(true); save(); const opened0 = JSON.parse(localStorage.getItem("zone_save_v2")).bo[2];
    W = null; load(); const restored = W.bunkers[2].opened.slice();
    Dungeon.enter(W.bunkers[2]); localStorage.removeItem("zone_save_v2"); save(); const noPlain = localStorage.getItem("zone_save_v2") === null; save(true);
    const raw = JSON.parse(localStorage.getItem("zone_save_v2")); W = null; load();
    return { opened0, restored, noPlain, field: raw.field, money: P.money, scene: G.scene };
  })()`);
  assert.deepEqual(o.opened0, [0, 99]); assert.deepEqual(o.restored, [0, 99]); assert.equal(o.noPlain, true); assert.equal(o.field, true);
  assert.equal(o.money, 450, "вытащили из подземелья: −10% денег"); assert.equal(o.scene, "camp");
});

test("задание «Бункер»: только пока есть бункеры, награда за сейф", () => {
  fresh();
  const o = run(`(() => {
    const q = Meta.makeOffer("vault"), before = Meta.done(q); Meta.onVault(); P.quests = [q]; Meta.onVault(); const done = Meta.done(q); const m0 = P.money; Meta.turnIn(0);
    W.bunkers = []; return { type: q.type, before, done, reward: P.money - m0, none: Meta.makeOffer("vault") };
  })()`);
  assert.equal(o.type, "vault"); assert.equal(o.before, false); assert.equal(o.done, true); assert.equal(o.reward, 260); assert.equal(o.none, null);
});

test("отрисовка подземелья не падает (заглушки canvas)", () => {
  fresh();
  const o = run(`(() => { const b = W.bunkers[0]; VW = 800; VH = 600; Dungeon.enter(b); for (let i = 0; i < 5; i++) { Dungeon.tick(0.05); draw(); } return G.scene; })()`);
  assert.equal(o, "dungeon");
});

test("главный цикл: update() в подземелье двигает игрока по стенам, стреляет по клику и не трогает зональный мир", () => {
  fresh();
  const o = run(`(() => {
    const b = W.bunkers[0]; VW = 800; VH = 600; Dungeon.enter(b); Dungeon.enemies = []; const L = Dungeon.lvl, T = 48;
    const zoneAnoms = JSON.stringify(W.anoms.slice(0, 5).map(a => [a.x, a.y, a.state])), mob = Mutants.list.length;
    keys.KeyA = true; for (let i = 0; i < 60; i++) update(0.05); keys.KeyA = false;
    const e = new DEnemy(P.x + 90, P.y, CFG.dungeon.enemy, 1); const open = Dungeon.los(P.x, P.y, e.x, e.y);
    return { scene: G.scene, inWall: Dungeon.wall(Math.floor(P.x / T), Math.floor(P.y / T)), x: P.x, open, zone: zoneAnoms === JSON.stringify(W.anoms.slice(0, 5).map(a => [a.x, a.y, a.state])), mob: Mutants.list.length === mob };
  })()`);
  assert.equal(o.scene, "dungeon"); assert.equal(o.inWall, false); assert.ok(o.zone && o.mob, "зона заморожена, пока игрок под землёй");
});

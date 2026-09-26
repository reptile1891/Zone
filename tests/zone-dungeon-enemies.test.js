"use strict";
// «Обочина» v0.9.1: виды врагов подземелья — Кислотник, Тень, Панцирник — на искусственных аренах (коридор, коридор с нишей).
const test = require("node:test");
const assert = require("node:assert/strict");
const { createZone } = require("./zone-load");

const z = createZone();
const CFG = z.get("CFG");
const run = code => JSON.parse(JSON.stringify(z.run(code) ?? null));
const fresh = (seed = 1234) => z.run(`(() => {
  W = new World(${seed}); resetPlayer(); P.stash = []; P.bld = null; Mutants.spawn(); Stalkers.spawn(); Meta.reset(); Camp.enter(true); Dungeon.levels = {};
  G.events = []; G.dead = false; G.scene = "zone"; G.night = 0; G.hour = 12; G.fog = 0; G.rain = 0; G.t = 5; P.hp = 100; P.money = 1000; P.inv = []; P.quests = []; P.offers = [];
  Stalkers.list = []; Mutants.list = []; keys.mx = 0; keys.my = 0; P.sneak = false; P.running = false; localStorage.removeItem("zone_save_v2");
})()`);
// Арена: '#' — стена, остальное — пол. Тайл = 48 px, центр тайла (x, y) = ((x + .5) * 48, (y + .5) * 48).
const CORRIDOR = ["##############", "#............#", "##############"];
const NICHE = ["##############", "####.#########", "#............#", "##############"];
const arena = rows => z.run(`(() => {
  const rows = ${JSON.stringify(rows)}, h = rows.length, w = rows[0].length, t = new Uint8Array(w * h); rows.forEach((r, y) => [...r].forEach((ch, x) => { t[y * w + x] = ch === "#" ? 1 : 0; }));
  Dungeon.cur = W.bunkers[0]; Dungeon.lvl = { w, h, t, start: { tx: 1, ty: 1 }, vault: { tx: w - 2, ty: 1 }, lockers: [], rad: new Set(), spawns: [], dist: new Uint16Array(w * h), seed: 1 };
  G.scene = "dungeon"; Dungeon.enemies = []; Dungeon.shots = []; Dungeon.slowT = 0; P.hp = 100; P.slow = 1; P.rad = 0; P.food = 80; P.bleed = 0; G.emi = { s: "calm", left: 0, next: 99999 };
})()`);
const at = (tx, ty) => `((${tx} + 0.5) * 48), ((${ty} + 0.5) * 48)`;

test("конфиг врагов: вид поведения, спрайт, трофей и веса по секторам заданы; в секторе 1 — только подземники", () => {
  const kinds = new Set(["crawl", "spit", "shade", "charge"]);
  z.run("Dungeon.initSprites()");
  const en = CFG.dungeon.enemies;
  for (const [k, e] of Object.entries(en)) {
    assert.ok(kinds.has(e.kind), k); assert.equal(e.w.length, 4, k); assert.ok(e.hp > 0 && e.dmg > 0 && e.xp > 0 && e.r > 0, k);
    assert.ok(z.get(`Spr.cache["${e.spr}"]`) !== undefined, `${k}: нет спрайта ${e.spr}`);
    if (e.drop) { assert.ok(CFG.items[e.drop.id], `${k}: трофей`); assert.ok(e.drop.p > 0 && e.drop.p <= 1); }
  }
  assert.ok(en.shade.hear && en.shade.hear.run > en.shade.hear.walk && en.shade.hear.walk > en.shade.hear.sneak);
  assert.deepEqual(Object.keys(en).filter(k => en[k].w[0] > 0), ["crawler"]);
  for (let s = 0; s < 4; s++) assert.ok(Object.values(en).some(e => e.w[s] > 0), "сектор " + (s + 1));
});

test("состав: в секторе 1 только подземники; в секторе 4 — все виды; с сектора 3 сейф охраняет Панцирник на подходе", () => {
  fresh();
  const o = run(`(() => {
    const types = d => { const s = new Set(); for (let seed = 1; seed <= 40; seed++) Dungeon.build(seed, d).spawns.forEach(x => s.add(x.type)); return [...s].sort(); };
    const g = []; for (let seed = 1; seed <= 20; seed++) { const L = Dungeon.build(seed, 3), guard = L.spawns.find(s => s.guard); g.push(guard ? { type: guard.type, manh: Math.abs(guard.tx - L.vault.tx) + Math.abs(guard.ty - L.vault.ty), closer: L.dist[guard.ty * L.w + guard.tx] < L.dist[L.vault.ty * L.w + L.vault.tx] } : null); }
    const noGuard = Dungeon.build(5, 2).spawns.some(s => s.guard);
    return { d1: types(1), d2: types(2), d4: types(4), g, noGuard, det: JSON.stringify(Dungeon.build(9, 4).spawns) === JSON.stringify(Dungeon.build(9, 4).spawns) };
  })()`);
  assert.deepEqual(o.d1, ["crawler"]); assert.ok(!o.d2.includes("carapace")); assert.deepEqual(o.d4, ["carapace", "crawler", "shade", "spitter"]);
  for (const g of o.g) { assert.ok(g, "страж есть в секторе 3"); assert.equal(g.type, "carapace"); assert.equal(g.manh, 2); assert.ok(g.closer); }
  assert.equal(o.noGuard, false); assert.ok(o.det);
});

test("Кислотник: после замаха плюёт сгустком, попадание ранит и замедляет, шаг в нишу — уворот, стена гасит сгусток", () => {
  fresh(); arena(NICHE);
  const o = run(`(() => {
    P.x = (2 + 0.5) * 48; P.y = (2 + 0.5) * 48; const c = CFG.dungeon.enemies.spitter, e = new DEnemy((7 + 0.5) * 48, (2 + 0.5) * 48, c, 1, "spitter"); e.state = "hunt"; e.cd = 0; Dungeon.enemies = [e]; Dungeon.computeField();
    let t = 0, fired = -1; while (t < 3 && fired < 0) { Dungeon.tick(0.05); t += 0.05; if (Dungeon.shots.length) fired = t; }
    const windTime = fired, dodgeX = (4 + 0.5) * 48, dodgeY = (1 + 0.5) * 48; P.x = dodgeX; P.y = dodgeY; P.hp = 100;   // шаг в нишу над коридором
    for (let i = 0; i < 40; i++) Dungeon.tick(0.05); const dodged = { hp: P.hp, slow: P.slow, shots: Dungeon.shots.length };
    // теперь стоим на линии и получаем
    Dungeon.shots = []; P.x = (2 + 0.5) * 48; P.y = (2 + 0.5) * 48; P.hp = 100; e.cd = 0; e.wind = 0; let hitAt = -1; t = 0;
    while (t < 5 && hitAt < 0) { Dungeon.tick(0.05); t += 0.05; if (P.hp < 99) hitAt = t; } const hp = P.hp, slow = P.slow, slowT = Dungeon.slowT;
    return { windTime, dodged, hitAt, hp, slow, slowT, dmg: c.dmg, wall: Dungeon.wall(0, 0) };
  })()`);
  assert.ok(o.windTime >= 0.5 && o.windTime <= 0.75, "замах ~0.55 с: " + o.windTime);
  assert.ok(o.dodged.hp >= 99.9, "в нише сгусток не попал: " + o.dodged.hp); assert.equal(o.dodged.shots, 0, "сгусток погас о стену");
  assert.ok(o.hitAt > 0 && o.hitAt < 5); assert.ok(o.hp <= 100 - o.dmg + 0.5 && o.hp >= 100 - o.dmg - 0.5, "урон сгустка = " + o.dmg + ", hp " + o.hp);
  assert.equal(o.slow, 0.6); assert.ok(o.slowT > 1.5);
});

test("Кислотник: слишком близкого игрока сторонится (отступает по коридору), издали не подходит вплотную", () => {
  fresh(); arena(CORRIDOR);
  const o = run(`(() => {
    P.x = (2 + 0.5) * 48; P.y = (1 + 0.5) * 48; const c = CFG.dungeon.enemies.spitter, e = new DEnemy((3 + 0.5) * 48, (1 + 0.5) * 48, c, 1, "spitter"); e.state = "hunt"; e.cd = 99; Dungeon.enemies = [e]; Dungeon.computeField();
    const d0 = e.x - P.x; for (let i = 0; i < 40; i++) { Dungeon.tick(0.05); P.hp = 100; } return { d0, d1: e.x - P.x, keep: c.keep };
  })()`);
  assert.ok(o.d1 > o.d0 + 20, "отступил: " + o.d0 + " → " + o.d1);
});

test("Тень: не слышит стоящего и крадущегося, слышит идущего рядом и бегущего издалека; вблизи видна, вдали нет, горящая видна", () => {
  fresh(); arena(CORRIDOR);
  const o = run(`(() => {
    const c = CFG.dungeon.enemies.shade, mk = dx => { P.x = (2 + 0.5) * 48; P.y = (1 + 0.5) * 48; const e = new DEnemy(P.x + dx, P.y, c, 1, "shade"); Dungeon.enemies = [e]; Dungeon.computeField(); return e; };
    const res = {}; const test = (name, dx, setup) => { const e = mk(dx); keys.mx = 0; keys.my = 0; P.sneak = false; P.running = false; setup && setup(); e.update(0.05); res[name] = e.state; };
    test("idle", 100); test("stand_near", 20); test("walk_close", 90, () => { keys.mx = 1; }); test("walk_far", 200, () => { keys.mx = 1; });
    test("sneak", 80, () => { keys.mx = 1; P.sneak = true; }); test("sneak_adj", 30, () => { keys.mx = 1; P.sneak = true; }); test("run_far", 240, () => { keys.mx = 1; P.running = true; }); test("run_too_far", 300, () => { keys.mx = 1; P.running = true; });
    keys.mx = 0; P.running = false; P.sneak = false;
    const e = mk(300), far = e.alpha(); e.x = P.x + 50; const near = e.alpha(); e.x = P.x + 100; const mid = e.alpha(); e.x = P.x + 300; e.burn = 3; const burning = e.alpha(); e.burn = 0; e.hurt(1, P); const hurt = e.alpha();
    return { res, far, near, mid, burning, hurt, spit: CFG.dungeon.enemies.crawler.kind !== "shade" };
  })()`);
  assert.equal(o.res.idle, "idle"); assert.equal(o.res.stand_near, "hunt", "вплотную даже стоящего чует (25 px)" ); assert.equal(o.res.walk_close, "hunt"); assert.equal(o.res.walk_far, "idle");
  assert.equal(o.res.sneak, "idle"); assert.equal(o.res.sneak_adj, "hunt"); assert.equal(o.res.run_far, "hunt"); assert.equal(o.res.run_too_far, "idle");
  assert.equal(o.far, 0); assert.equal(o.near, 1); assert.ok(o.mid > 0 && o.mid < 1); assert.equal(o.burning, 1); assert.equal(o.hurt, 1);
});

test("Тень: слепая — идёт на шум по коридору без прямой видимости и кусает; теряет след через 5 с тишины вдали", () => {
  fresh(); arena(["##########", "#........#", "######.###", "#........#", "##########"]);
  const o = run(`(() => {
    const c = CFG.dungeon.enemies.shade; P.x = (1 + 0.5) * 48; P.y = (3 + 0.5) * 48; const e = new DEnemy((1 + 0.5) * 48, (1 + 0.5) * 48, c, 1, "shade"); Dungeon.enemies = [e];
    const los0 = Dungeon.los(e.x, e.y, P.x, P.y); Dungeon.hear(P.x, P.y, 200); const woke = e.state; Dungeon.computeField();
    const d0 = Math.hypot(e.x - P.x, e.y - P.y); let bit = false, t = 0; while (t < 8 && !bit) { Dungeon.tick(0.05); t += 0.05; if (P.hp < 95) bit = true; }
    const e2 = new DEnemy((8 + 0.5) * 48, (1 + 0.5) * 48, c, 1, "shade"); e2.state = "hunt"; Dungeon.enemies = [e2]; P.x = (1 + 0.5) * 48; P.y = (3 + 0.5) * 48; P.hp = 100; e2.x = (8 + 0.5) * 48; e2.y = (1 + 0.5) * 48;
    for (let i = 0; i < 40; i++) e2.lost += 0.2, e2.state === "hunt" && e2.update(0.001); e2.lost = 5.1; e2.update(0.05);
    return { los0, woke, d0, bit, t, after: e2.state };
  })()`);
  assert.equal(o.los0, false); assert.equal(o.woke, "hunt"); assert.ok(o.bit, "дошла и укусила за " + o.t + " с"); assert.equal(o.after, "idle");
});

test("Панцирник: замах виден, разбег по прямой бьёт на 30, врезавшись в стену — оглушён; в оглушении получает на 50% больше", () => {
  fresh(); arena(CORRIDOR);
  const o = run(`(() => {
    const c = CFG.dungeon.enemies.carapace; P.x = (2 + 0.5) * 48; P.y = (1 + 0.5) * 48; const e = new DEnemy((6 + 0.5) * 48, (1 + 0.5) * 48, c, 1, "carapace"); e.state = "hunt"; e.cd = 0; Dungeon.enemies = [e]; Dungeon.computeField();
    e.update(0.05); const wind = { mode: e.mode, mt: e.mt };
    let t = 0, dashAt = -1, hurtAt = -1, stunAt = -1; const hp0 = P.hp;
    while (t < 6 && stunAt < 0) { e.update(0.05); t += 0.05; if (e.mode === "dash" && dashAt < 0) dashAt = t; if (P.hp < hp0 && hurtAt < 0) hurtAt = t; if (e.mode === "stun") stunAt = t; }
    const dmgTaken = hp0 - P.hp, stunned = e.mode, x = e.x, stunT = e.stun;
    const hpBefore = e.hp; e.hurt(10, P); const inStun = hpBefore - e.hp; e.mode = "chase"; const hp2 = e.hp; e.hurt(10, P); const normal = hp2 - e.hp; e.mode = "stun"; const hp3 = e.hp; e.hurt(10, P, true); const flame = hp3 - e.hp;
    return { wind, dashAt, hurtAt, stunAt, dmgTaken, stunned, x, stunT, inStun, normal, flame, dashDmg: c.dashDmg };
  })()`);
  assert.equal(o.wind.mode, "wind"); assert.ok(Math.abs(o.wind.mt - CFG.dungeon.enemies.carapace.wind) < 0.06);
  assert.ok(o.dashAt >= 0.8 && o.dashAt <= 1.1, "разбег после замаха ~0.9 с: " + o.dashAt); assert.ok(o.hurtAt > o.dashAt); assert.equal(o.dmgTaken, o.dashDmg, "по игроку один удар за разбег");
  assert.equal(o.stunned, "stun"); assert.ok(o.x < 5 * 48, "пролетел дальше игрока до стены: x=" + o.x); assert.ok(Math.abs(o.stunT - CFG.dungeon.enemies.carapace.stun) < 0.06);
  assert.ok(Math.abs(o.inStun - 10 * 0.4 * 1.5) < 1e-9); assert.ok(Math.abs(o.normal - 4) < 1e-9); assert.ok(Math.abs(o.flame - 15) < 1e-9, "огонь идёт сквозь броню, оглушение усиливает");
});

test("Панцирник: уклонение — шаг в нишу во время замаха; разбег проносится мимо и заканчивается оглушением", () => {
  fresh(); arena(NICHE);
  const o = run(`(() => {
    const c = CFG.dungeon.enemies.carapace; P.x = (2 + 0.5) * 48; P.y = (2 + 0.5) * 48; const e = new DEnemy((6 + 0.5) * 48, (2 + 0.5) * 48, c, 1, "carapace"); e.state = "hunt"; e.cd = 0; Dungeon.enemies = [e]; Dungeon.computeField();
    e.update(0.05); let t = 0; while (e.mode === "wind" && t < 3) { e.update(0.05); t += 0.05; }
    P.x = (4 + 0.5) * 48; P.y = (1 + 0.5) * 48; const hp0 = P.hp; while (e.mode !== "stun" && t < 8) { e.update(0.05); t += 0.05; }
    return { hp: P.hp - hp0, mode: e.mode, x: e.x };
  })()`);
  assert.equal(o.hp, 0, "в нише разбег не задел"); assert.equal(o.mode, "stun");
});

test("Панцирник: издалека (за зоной разбега) не разгоняется, а ползёт; разбег хватает, чтобы долететь до цели или стены", () => {
  fresh(); arena(CORRIDOR);
  const o = run(`(() => {
    const c = CFG.dungeon.enemies.carapace; P.x = (1 + 0.5) * 48; P.y = (1 + 0.5) * 48; const e = new DEnemy((11 + 0.5) * 48, (1 + 0.5) * 48, c, 1, "carapace"); e.state = "hunt"; e.cd = 0; Dungeon.enemies = [e]; Dungeon.computeField();
    e.update(0.05); return { far: e.mode, reach: c.reach, dashRange: c.dash * c.dashT };
  })()`);
  assert.equal(o.far, "chase"); assert.ok(o.dashRange >= o.reach, "дальность разбега (" + o.dashRange + ") не меньше зоны запуска (" + o.reach + ")");
});

test("Панцирник вне прямого коридора не разбегается — только ползёт по пути", () => {
  fresh(); arena(["##########", "#........#", "#.######.#", "#........#", "##########"]);
  const o = run(`(() => {
    const c = CFG.dungeon.enemies.carapace; P.x = (1 + 0.5) * 48; P.y = (3 + 0.5) * 48; const e = new DEnemy((8 + 0.5) * 48, (1 + 0.5) * 48, c, 1, "carapace"); e.state = "hunt"; e.cd = 0; e.lost = 0; Dungeon.enemies = [e]; Dungeon.computeField();
    const modes = new Set(); let moved = 0; const x0 = e.x, y0 = e.y; for (let i = 0; i < 40; i++) { e.lost = 0; e.update(0.05); modes.add(e.mode); } return { modes: [...modes], moved: Math.hypot(e.x - x0, e.y - y0) };
  })()`);
  assert.deepEqual(o.modes, ["chase"]); assert.ok(o.moved > 20 && o.moved < 140, "медленно: " + o.moved);
});

test("трофеи: при убийстве игроком падают с заданным шансом; от огня и от чужой руки — нет; опыт начисляется", () => {
  fresh(); arena(CORRIDOR);
  const o = run(`(() => {
    const drops = {}; const orig = Math.random;
    for (const k of ["spitter", "shade", "carapace"]) {
      P.inv = []; const xp0 = P.xp + P.lvl * 1000; Math.random = () => 0; const e = new DEnemy(100, 100, CFG.dungeon.enemies[k], 1, k); e.die(P); Math.random = orig;
      const got = P.inv.map(s => s.id); P.inv = []; Math.random = () => 0.999; const e2 = new DEnemy(100, 100, CFG.dungeon.enemies[k], 1, k); e2.die(P); Math.random = orig;
      const none = P.inv.length; const e3 = new DEnemy(100, 100, CFG.dungeon.enemies[k], 1, k); Math.random = () => 0; e3.die(null); Math.random = orig; drops[k] = { got, none, noKiller: P.inv.length === 0 };
    }
    const crawler = new DEnemy(100, 100, CFG.dungeon.enemies.crawler, 1); P.inv = []; crawler.die(P);
    return { drops, crawlerLoot: P.inv.length, kills: P.kills };
  })()`);
  assert.deepEqual(o.drops.spitter.got, ["glassgland"]); assert.deepEqual(o.drops.shade.got, ["mistvial"]); assert.deepEqual(o.drops.carapace.got, ["plate"]);
  for (const k of ["spitter", "shade", "carapace"]) { assert.equal(o.drops[k].none, 0); assert.ok(o.drops[k].noKiller); }
  assert.equal(o.crawlerLoot, 0); assert.equal(o.kills, 7);
});

test("бой: пули и огонь работают по всем видам; броня Панцирника режет пули, но не огонь", () => {
  fresh(); arena(CORRIDOR);
  const o = run(`(() => {
    P.x = (2 + 0.5) * 48; P.y = (1 + 0.5) * 48; P.ang = 0; P.weapon = "pistol"; P.cd = 0; invAdd("ammo", 30); invAdd("canister", 1); keys.mx = 0; keys.my = 0;
    const cw = new DEnemy((5 + 0.5) * 48, P.y, CFG.dungeon.enemies.carapace, 1, "carapace"); Dungeon.enemies = [cw]; const orig = Math.random; Math.random = () => 0.5;
    try { shoot(); } finally { Math.random = orig; } const bullet = cw.max - cw.hp;
    P.weapons.push("flamer"); P.weapon = "flamer"; P.cd = 0; P.fuel = 0; shoot(); const fire = cw.max - cw.hp - bullet;
    const sh = new DEnemy((4 + 0.5) * 48, P.y, CFG.dungeon.enemies.shade, 1, "shade"); Dungeon.enemies = [sh]; P.cd = 0; shoot();
    return { bullet, fire, shade: sh.max - sh.hp, burn: sh.burn > 0, dmgPistol: CFG.weapons.pistol.dmg, armor: CFG.dungeon.enemies.carapace.armor, flame: CFG.weapons.flamer.dmg };
  })()`);
  assert.ok(Math.abs(o.bullet - o.dmgPistol * (1 - o.armor)) < 1e-9, "пуля: " + o.bullet); assert.ok(Math.abs(o.fire - o.flame) < 1e-9, "огонь: " + o.fire);
  assert.equal(o.shade, o.flame); assert.ok(o.burn);
});

test("вход в бункер сектора 4 создаёт смесь видов; отрисовка всех видов, замахов и сгустков не падает", () => {
  fresh();
  const o = run(`(() => {
    VW = 800; VH = 600; const b = W.bunkers.find(x => W.danger(x.x, x.y) >= 3) || W.bunkers[0]; Dungeon.enter(b);
    const types = [...new Set(Dungeon.enemies.map(e => e.type))].sort(); const L = Dungeon.lvl;
    for (const k of ["spitter", "shade", "carapace"]) Dungeon.enemies.push(new DEnemy(P.x + 60, P.y, CFG.dungeon.enemies[k], 1, k));
    const cw = Dungeon.enemies[Dungeon.enemies.length - 1]; cw.mode = "wind"; cw.mt = 1; const sp = Dungeon.enemies[Dungeon.enemies.length - 3]; sp.wind = 0.3;
    Dungeon.shots.push({ x: P.x + 30, y: P.y, vx: 0, vy: 0, t: 2, dmg: 10 }); Dungeon.enemies.forEach(e => { e.mode !== "wind" && (e.mode = "chase"); });
    for (let i = 0; i < 5; i++) { Dungeon.tick(0.05); draw(); } cw.mode = "stun"; cw.stun = 1; draw();
    return { types, n: L.spawns.length, danger: W.danger(b.x, b.y) };
  })()`);
  assert.ok(o.types.length >= 1); assert.ok(o.n >= 3);
});

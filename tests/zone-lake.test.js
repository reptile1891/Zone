"use strict";
// «Обочина» v0.11: Озёрный край и Топляк — засада в воде, которая хватает и держит.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createZone } = require("./zone-load");

const z = createZone();
const CFG = z.get("CFG");
const run = code => JSON.parse(JSON.stringify(z.run(code) ?? null));
const plain = h => String(h).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
// Мир по сиду + один искусственный пруд (центр 3000,3000; полуоси 100×60), игрок вдали от лагеря
const fresh = () => z.run(`(() => {
  W = new World(1234); resetPlayer(); P.stash = []; P.bld = null; Mutants.spawn(); Stalkers.spawn(); Meta.reset(); Camp.enter(true);
  G.events = []; G.dead = false; G.scene = "zone"; G.night = 0; G.hour = 12; G.fog = 0; G.rain = 0; G.emi = { s: "calm", left: 0, next: 99999 }; G.t = 5;
  P.hp = 100; P.money = 1000; P.inv = []; P.quests = []; P.offers = []; P.grab = 0; P.slow = 1; keys.mx = 0; keys.my = 0; Stalkers.list = []; Mutants.list = []; Mutants.corpses = [];
  W.water = [{ x: 3000, y: 3000, rx: 100, ry: 60 }]; W.og = new Grid(200); W.anoms = []; localStorage.removeItem("zone_save_v2");
})()`);
const mkDrowner = (x = 3000, y = 3000) => z.run(`(() => { const m = new Mutant("drowner", ${x}, ${y}, null); m.pond = W.water[0]; m.hx = 3000; m.hy = 3000; Mutants.list = [m]; return 1; })()`);

test("конфиг: озёрный край, Топляк, Жабра и рецепт согласованы; у биома есть веса всех аномалий", () => {
  assert.ok(CFG.biomes.lake && CFG.biomes.lake.water > 0.8 && CFG.biomes.lake.waterSize > 1);
  const d = CFG.mut.drowner; assert.ok(d.aquatic && d.wakeR > 0 && d.grab > 0 && CFG.items[d.part].part); assert.ok(d.biomes.includes("lake"));
  for (const a of Object.keys(CFG.anoms)) assert.ok(CFG.biomes.lake.am[a] != null, a);
  const r = CFG.recipes.find(x => x.id === "antirad2"); assert.ok(r && r.mat.gill === 2 && r.out[0] === "antirad" && r.st === "sci");
  assert.ok(z.get('Spr.cache["drowner"]') !== undefined); assert.ok(z.get('Icons.cache["gill"]') !== undefined); assert.ok(CFG.rumors.some(t => /озёрах/.test(t)));
});

test("мир: озёра большие, в озёрном краю много воды; Топляки живут в прудах своего биома и лежат на дне", () => {
  z.run(`W = new World(1234); resetPlayer(); Mutants.spawn();`);
  const o = run(`(() => {
    const lake = BIOME_KEYS.indexOf("lake"), cells = Array.from(W.bg).filter(v => v === lake).length;
    const ponds = W.water.filter(w => W.biomeAt(w.x, w.y) === "lake"), other = W.water.filter(w => W.biomeAt(w.x, w.y) !== "lake");
    const avg = a => a.reduce((s, w) => s + w.rx, 0) / (a.length || 1), dr = Mutants.list.filter(m => m.sp === "drowner");
    return { cells, lakePonds: ponds.length, lakeRx: avg(ponds), otherRx: avg(other), n: dr.length, inPond: dr.every(m => m.pond && ((m.x - m.pond.x) / m.pond.rx) ** 2 + ((m.y - m.pond.y) / m.pond.ry) ** 2 <= 1.01),
      asleep: dr.every(m => m.state === "sleep"), hidden: dr.every(m => Mutants.hidden(m)), inLakeOrSwamp: dr.filter(m => ["lake", "swamp"].includes(W.biomeAt(m.pond.x, m.pond.y))).length };
  })()`);
  assert.ok(o.cells > 0 && o.lakePonds > 10); assert.ok(o.lakeRx > o.otherRx * 1.3, `озёра крупнее: ${o.lakeRx.toFixed(0)} против ${o.otherRx.toFixed(0)}`);
  assert.ok(o.n >= 8 && o.inPond && o.asleep && o.hidden); assert.ok(o.inLakeOrSwamp >= o.n * 0.6, "большинство — в озёрах и болотах");
});

test("мир по сиду по-прежнему детерминирован с озёрным краем", () => {
  const f = seed => run(`(() => { const w = new World(${seed}); return { bg: Array.from(w.bg).join(""), water: w.water.map(x => Math.round(x.x) + ":" + Math.round(x.rx)).join("|"), anoms: w.anoms.length }; })()`);
  assert.deepEqual(f(77), f(77)); assert.notEqual(f(77).bg, f(78).bg);
});

test("Топляк: под водой дрейфует по пруду и не покидает его; вдали от берега не просыпается", () => {
  fresh(); mkDrowner();
  const o = run(`(() => {
    P.x = 3400; P.y = 3400; const m = Mutants.list[0]; let out = false, moved = 0, x0 = m.x, y0 = m.y, states = new Set();
    for (let i = 0; i < 600; i++) { m.update(0.05); states.add(m.state); moved = Math.max(moved, Math.hypot(m.x - x0, m.y - y0)); const p = m.pond; if (((m.x - p.x) / (p.rx * 1.2 + 0.5)) ** 2 + ((m.y - p.y) / (p.ry * 1.2 + 0.5)) ** 2 > 1) out = true; }
    return { out, moved, states: [...states] };   // наибольшее удаление от старта: по конечной точке дрейф мог случайно вернуться назад
  })()`);
  assert.equal(o.out, false); assert.ok(o.moved > 5, "дрейфует: " + o.moved.toFixed(1)); assert.deepEqual(o.states, ["sleep"]);
});

test("Топляк: просыпается, когда игрок в воде или у самой кромки и близко; на суше рядом — нет", () => {
  fresh();
  const o = run(`(() => {
    const res = {}; const t = (name, px, py, mx, my) => { Mutants.list = []; const m = new Mutant("drowner", mx, my, null); m.pond = W.water[0]; m.hx = 3000; m.hy = 3000; m.st = 99; Mutants.list = [m]; P.x = px; P.y = py; m.update(0.05); res[name] = m.state; };
    t("wading", 3020, 3000, 3040, 3000);           // игрок в воде, в 20 пикс
    t("shore", 3148, 3000, 3110, 3000);            // у кромки (полуось 100 ×1.2 = 120, +34) — внутри полосы, в 38 пикс
    t("landClose", 3200, 3000, 3110, 3000);        // на суше в 90 пикс от Топляка: вне полосы кромки
    t("farInWater", 2930, 3000, 3080, 3000);       // в воде, но в 150 пикс
    return res;
  })()`);
  assert.equal(o.wading, "hunt"); assert.equal(o.shore, "hunt"); assert.equal(o.landClose, "sleep"); assert.equal(o.farInWater, "sleep");
});

test("хватка: удар, урон, P.grab держит на месте; рывок освобождает быстрее; раненый Топляк ослабляет хватку; смерть отпускает", () => {
  fresh(); mkDrowner(3000, 3000);
  const o = run(`(() => {
    const m = Mutants.list[0]; m.state = "hunt"; m.cd = 0; P.x = 3012; P.y = 3000; P.hp = 100; P.grab = 0;
    m.update(0.05); const hit = { grab: P.grab, hp: P.hp };
    // стоим: P.grab убывает со скоростью 1, игрок не двигается
    keys.mx = 0; const x0 = P.x; update(0.05); const still = { grab: P.grab, moved: P.x - x0 };
    // рвёмся: стремимся вправо — скорость убывания ×2.5, но с места не сходим
    keys.KeyD = true; const g0 = P.grab; update(0.05); keys.KeyD = false; const rush = { drop: g0 - P.grab, moved: P.x - x0 };
    P.grab = 1.5; m.hp = 65; m.hurt(10, P); const shot = P.grab;
    P.grab = 1.5; m.hp = 1; m.hurt(50, P); const dead = { grab: P.grab, dead: m.dead };
    return { hit, still, rush, shot, dead, need: CFG.mut.drowner.grab, status: Meta.status() };
  })()`);
  assert.equal(o.hit.grab, o.need); assert.ok(o.hit.hp <= 91 + 0.5, "урон хватки: " + o.hit.hp); assert.ok(o.still.grab < o.need && o.still.moved === 0);
  assert.ok(o.rush.drop > 0.11 && o.rush.drop < 0.14, "рывок сокращает хватку ×2.5: " + o.rush.drop); assert.equal(o.rush.moved, 0, "в хватке с места не сдвинуться");
  assert.ok(Math.abs(o.shot - 0.9) < 1e-9, "выстрел ослабляет хватку: " + o.shot); assert.equal(o.dead.grab, 0); assert.ok(o.dead.dead);
});

test("хватка: за пару секунд игрок освобождается, рывок — вдвое быстрее; Топляк за пределы пруда не гонится и через 3 с успокаивается", () => {
  fresh(); mkDrowner(3000, 3000);
  const o = run(`(() => {
    const m = Mutants.list[0]; m.state = "hunt"; m.cd = 0; P.x = 3012; P.y = 3000; P.hp = 500; P.grab = 0; m.update(0.05);
    const held = Mutants.list.slice(); Mutants.list = [];   // сама хватка, без повторных захватов
    const free = (dir) => { P.grab = 1.8; keys.KeyD = dir; let t = 0; while (P.grab > 0 && t < 5) { update(0.05); t += 0.05; } keys.KeyD = false; return t; };
    const still = free(false), rush = free(true);
    // стоять рядом с Топляком смертельно: он перехватывает каждые cd секунд; рвущийся успевает освободиться до перехвата
    Mutants.list = held; const mm = held[0]; mm.state = "hunt"; mm.cd = 0; P.x = 3012; P.y = 3000; P.hp = 500; P.grab = 0; mm.update(0.05);
    const hp0 = P.hp; for (let i = 0; i < 100; i++) update(0.05); const standing = hp0 - P.hp, r = CFG.mut.drowner;
    Mutants.list = held; mm.cd = 0; P.grab = 0; P.hp = 500; mm.update(0.05); keys.KeyD = true; const hp1 = P.hp; let freed = false; for (let i = 0; i < 100 && !freed; i++) { update(0.05); if (P.grab <= 0) freed = true; } keys.KeyD = false;
    Mutants.list = [];
    // игрок убегает на сушу: Топляк остаётся в пруду и «засыпает»
    Mutants.list = []; const m2 = new Mutant("drowner", 3000, 3000, null); m2.pond = W.water[0]; Mutants.list = [m2]; m2.state = "hunt"; P.x = 3600; P.y = 3600; P.grab = 0; G.emi.next = 99999;
    let t = 0; while (m2.state === "hunt" && t < 6) { m2.update(0.05); t += 0.05; }
    const p = m2.pond; return { standing, freed, r: r.cd, still, rush, calm: t, state: m2.state, inside: ((m2.x - p.x) / (p.rx * 1.2 + 0.5)) ** 2 + ((m2.y - p.y) / (p.ry * 1.2 + 0.5)) ** 2 <= 1 };
  })()`);
  assert.ok(o.still > 1.6 && o.still < 2.0, "без рывка ~1.8 с: " + o.still); assert.ok(o.rush < o.still * 0.6, "рывок быстрее: " + o.rush); assert.ok(o.calm >= 2.9 && o.calm < 3.3, "успокаивается через 3 с: " + o.calm);
  assert.equal(o.state, "sleep"); assert.ok(o.inside);
  assert.ok(o.standing >= 3 * 9 - 1, "стоя рядом получаешь удар каждые ~1.2 с: " + o.standing); assert.ok(o.freed, "рвущийся успевает освободиться до перехвата");
});

test("под водой Топляк — не цель: пуля и огонь его не трогают; проснувшийся — обычная цель", () => {
  fresh(); mkDrowner(3040, 3000);
  const o = run(`(() => {
    P.x = 2960; P.y = 3000; P.ang = 0; P.weapon = "pistol"; P.cd = 0; invAdd("ammo", 10); invAdd("canister", 1); const m = Mutants.list[0], orig = Math.random; keys.mx = 0; keys.my = 0;
    Math.random = () => 0.5; try { shoot(); } finally { Math.random = orig; } const hiddenHit = m.hp;
    P.weapons.push("flamer"); P.weapon = "flamer"; P.cond.flamer = 100; P.cd = 0; P.fuel = 0; shoot(); const hiddenFire = m.hp;
    m.state = "hunt"; P.weapon = "pistol"; P.cd = 0; Math.random = () => 0.5; try { shoot(); } finally { Math.random = orig; }
    return { hiddenHit, hiddenFire, awake: m.hp, max: CFG.mut.drowner.hp };
  })()`);
  assert.equal(o.hiddenHit, o.max); assert.equal(o.hiddenFire, o.max); assert.ok(o.awake < o.max);
});

test("трофей и рецепт: Жабра идёт на антирад в лаборатории (2 жабры → 2 антирада), скупщик и учёный берут", () => {
  fresh();
  const o = run(`(() => {
    P.bld = Camp.DEFAULT_BLD(); invAdd("gill", 2); const r = CFG.recipes.find(x => x.id === "antirad2"); const can = Camp.canCraft(r); Camp.click("craft", "antirad2");
    invAdd("gill", 1); return { can, antirad: invCount("antirad"), gill: invCount("gill"), buyer: sellPrice({ id: "gill", n: 1 }, "buyer"), sci: sellPrice({ id: "gill", n: 1 }, "sci"), tip: Tip.item("gill") };
  })()`);
  assert.ok(o.can); assert.equal(o.antirad, 2); assert.equal(o.gill, 1); assert.ok(o.buyer > 0 && o.sci > o.buyer * 0.5); assert.match(plain(o.tip), /Жабра Топляка/);
});

test("отрисовка: спящий Топляк рисует рябь вблизи, проснувшийся — спрайт; всё это без ошибок", () => {
  fresh(); mkDrowner(3010, 3000);
  const o = run(`(() => { VW = 800; VH = 600; P.x = 3000; P.y = 3000; const m = Mutants.list[0]; drawMutant(m); m.state = "hunt"; drawMutant(m); P.grab = 1; return Meta.status().includes("СХВАЧЕН"); })()`);
  assert.equal(o, true);
});

test("сохранение и смерть не оставляют хватку: респаун и вход в лагерь сбрасывают P.grab", () => {
  fresh();
  const o = run(`(() => { P.grab = 2; Camp.enter(true); const a = P.grab; P.grab = 2; respawn(); return { a, b: P.grab }; })()`);
  assert.equal(o.a, 0); assert.equal(o.b, 0);
});

"use strict";
// «Обочина»: загрузка, целостность конфига и генерация мира.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createZone } = require("./zone-load");

const z = createZone();
const CFG = z.get("CFG");

test("скрипты «Обочины» загружаются без ошибок", () => {
  assert.equal(z.get("typeof World"), "function");
  assert.ok(Object.keys(CFG.anoms).length >= 6);
});

test("аномалии ссылаются на существующие артефакты, веса заданы для 4 секторов", () => {
  for (const [k, a] of Object.entries(CFG.anoms)) {
    assert.equal(a.w.length, 4, `${k}: w должен иметь 4 значения`);
    assert.ok(a.name && a.hint && a.react && a.col, `${k}: не хватает текстов/цвета`);
    assert.ok(a.r > 0, `${k}: радиус`);
    for (const id of a.arts) assert.ok(CFG.arts[id], `${k}: нет артефакта ${id}`);
  }
});

test("артефакты: цена и вес положительны, эффекты из известного набора", () => {
  const known = new Set(["radRes", "stamRegen", "carry", "hpRegen", "lure", "psy", "repel", "fireRes", "sight"]);
  for (const [k, a] of Object.entries(CFG.arts)) {
    assert.ok(a.val > 0 && a.w > 0, k);
    assert.ok(a.name && a.desc, k);
    for (const e in a.fx) assert.ok(known.has(e), `${k}: неизвестный эффект ${e}`);
  }
});

test("мутанты: часть-трофей существует в предметах, биомы — в конфиге", () => {
  for (const [k, m] of Object.entries(CFG.mut)) {
    assert.ok(CFG.items[m.part] && CFG.items[m.part].part, `${k}: трофей ${m.part}`);
    for (const b of m.biomes) assert.ok(CFG.biomes[b], `${k}: нет биома ${b}`);
    for (const h of m.hostile || []) assert.ok(CFG.mut[h], `${k}: hostile ${h}`);
    for (const h of m.prey || []) assert.ok(CFG.mut[h], `${k}: prey ${h}`);
    assert.ok(m.hp > 0 && m.walk > 0 && m.run >= m.walk && m.dmg > 0 && m.cd > 0, `${k}: базовые числа`);
    assert.ok(["day", "night", "weather"].includes(m.active), `${k}: active`);
    assert.ok(m.dmin >= 1 && m.dmax <= 4 && m.dmin <= m.dmax, `${k}: сектора`);
  }
});

test("биомы: реквизит существует, вес аномалий ссылается на известные типы", () => {
  const PROPS = z.get("PROPS");
  for (const [k, b] of Object.entries(CFG.biomes)) {
    assert.equal(b.w.length, 4, `${k}: w`);
    for (const p of Object.keys(b.props)) assert.ok(PROPS[p], `${k}: нет реквизита ${p}`);
    for (const p of Object.keys(b.roadProps || {})) assert.ok(PROPS[p], `${k}: нет реквизита дороги ${p}`);
    for (const a of Object.keys(b.am)) assert.ok(CFG.anoms[a], `${k}: am → нет аномалии ${a}`);
    for (const a of Object.keys(CFG.anoms)) assert.ok(b.am[a] != null, `${k}: нет веса аномалии ${a}`);
  }
});

test("оружие: есть спрайт в руках, иконка и запись состояния", () => {
  const def = z.get("Gun.def");
  for (const [k, w] of Object.entries(CFG.weapons)) {
    assert.ok(def[k], `${k}: нет Gun.def`);
    assert.ok(w.dmg > 0 && w.cd > 0 && w.range > 0 && w.price >= 0 && w.wear > 0 && w.repair > 0, k);
    assert.ok(z.get(`Icons.cache["w_${k}"]`) !== undefined, `${k}: нет иконки w_${k}`);
  }
});

test("у всех предметов есть иконка, а у мутантов — спрайт", () => {
  for (const k of Object.keys(CFG.mut)) assert.ok(z.get(`Spr.cache["${k}"]`) !== undefined, `нет спрайта ${k}`);
});

// отпечаток мира: всё, что должно однозначно определяться сидом (иначе загрузка сохранения даст другой мир)
const fingerprint = seed => z.run(`(() => {
  const w = new World(${seed}), r = x => Math.round(x);
  return {
    anoms: w.anoms.map(a => a.type + ":" + r(a.x) + ":" + r(a.y)).join("|"),
    biomes: Array.from(w.bg).join(""),
    conts: w.conts.map(c => c.kind + ":" + r(c.x) + ":" + r(c.y) + ":" + JSON.stringify(c.loot)).join("|"),
    corpses: w.corpses.map(c => r(c.x) + ":" + r(c.y) + ":" + JSON.stringify(c.items) + ":" + (c.art || "")).join("|"),
    arts: w.arts.map(a => a.type + ":" + r(a.x)).join("|"),
    labs: w.labs.map(l => r(l.x) + ":" + r(l.y)).join("|"),
    n: w.anoms.length, types: [...new Set(w.anoms.map(a => a.type))],
  };
})()`);
const fpA = fingerprint(1234);

test("мир полностью определяется сидом: биомы, аномалии, контейнеры, трупы, артефакты, лаборатории", () => {
  const b = fingerprint(1234);
  for (const k of ["anoms", "biomes", "conts", "corpses", "arts", "labs"]) assert.equal(fpA[k], b[k], `${k} различается при том же сиде`);
  assert.notEqual(fpA.anoms, fingerprint(999).anoms);
});

test("в мире есть аномалии каждого типа", () => {
  assert.ok(fpA.n > 100);
  for (const t of Object.keys(CFG.anoms)) assert.ok(fpA.types.includes(t), `в мире нет аномалий типа ${t}`);
});

test("лаборатории: созданы, в опасных секторах, внутри шкафы с добычей, снаружи пружины и магнитные ямы", () => {
  const info = z.run(`(() => { const w = new World(1234); return w.labs.map(l => ({
    danger: w.danger(l.x, l.y),
    lockers: w.conts.filter(c => c.kind === "lab" && Math.hypot(c.x - l.x, c.y - l.y) < 100).length,
    guards: w.anoms.filter(a => (a.type === "spring" || a.type === "magnet") && Math.hypot(a.x - l.x, a.y - l.y) < 320).length,
    rad: w.radAt(l.x, l.y) })); })()`);
  assert.ok(info.length >= 1, "ни одной лаборатории");
  for (const l of info) {
    assert.ok(l.danger >= 3);
    assert.equal(l.lockers, 3);
    assert.ok(l.guards >= 2, "мало охраны из аномалий");
    assert.ok(l.rad > 0.3, "нет фона в центре");
  }
});

test("Пружина: заряжается, подбрасывает и ранит всех в круге, но не за кругом", () => {
  const out = z.run(`(() => {
    const w = new World(77), a = { id: 9001, type: "spring", x: 3000, y: 3000, r: 46, t: 0, state: 0, known: false, flash: 0, revealed: 0, vx: 0, vy: 0, ph: 0, act: false };
    w.anoms = [a]; let hits = 0, hitsFar = 0;
    const mk = (x, far) => ({ x, y: 3000, dead: false, slow: 1, hurt(d, s) { if (far) hitsFar++; else { hits++; this.last = d; } } });
    const inside = mk(3020, false), outside = mk(3200, true);
    for (let i = 0; i < 80; i++) w.update(0.1, [inside, outside]);
    return { hits, hitsFar, moved: Math.round(inside.x - 3020), last: inside.last };
  })()`);
  assert.ok(out.hits >= 1, "пружина ни разу не сработала за 8 с");
  assert.equal(out.hitsFar, 0);
  assert.ok(out.moved > 40, `цель должна быть отброшена, сдвиг ${out.moved}`);
  assert.equal(out.last, CFG.anoms.spring.dmg);
});

test("Стрелка: заряжается и отбрасывает рывком вдоль путей (a.dir), а не от центра, как Пружина", () => {
  const out = z.run(`(() => {
    const R0 = Math.random; Math.random = () => 0;   // фиксирует a.dir = 0 (толчок строго по +x), как задаёт разрядка
    const w = new World(79), a = { id: 9003, type: "switcher", x: 3000, y: 3000, r: 50, ph: 0, rot: 0, t: 0, state: 0, known: false, flash: 0, revealed: 0, vx: 0, vy: 0, act: false, dir: 0 };
    w.anoms = [a]; let hits = 0, hitsFar = 0;
    const mk = (x, y, far) => ({ x, y, dead: false, slow: 1, hurt(d) { if (far) hitsFar++; else { hits++; this.last = d; } } });
    const inside = mk(3010, 3000, false), outside = mk(3300, 3000, true);
    const x0 = inside.x, y0 = inside.y;
    for (let i = 0; i < 90; i++) w.update(0.1, [inside, outside]);
    Math.random = R0;
    return { hits, hitsFar, dx: Math.round(inside.x - x0), dy: Math.round(inside.y - y0), last: inside.last };
  })()`);
  assert.ok(out.hits >= 1, "стрелка ни разу не сработала за 9 с");
  assert.equal(out.hitsFar, 0);
  assert.ok(out.dx > 100, `должно отбросить вдоль путей (dir=0 → по x), сдвиг ${out.dx}`);
  assert.ok(Math.abs(out.dy) < 5, "поперёк путей толкать не должно");
  assert.equal(out.last, CFG.anoms.switcher.dmg);
});

test("Магнитная яма: металлические твари получают гораздо больше урона и тянутся сильнее", () => {
  const out = z.run(`(() => {
    const w = new World(78), a = { id: 9002, type: "magnet", x: 3000, y: 3000, r: 58, t: 0, state: 0, known: false, flash: 0, revealed: 0, vx: 0, vy: 0, ph: 0, act: false };
    w.anoms = [a];
    const mk = metal => ({ x: 3040, y: 3000, dead: false, slow: 1, c: { metal }, dmg: 0, hurt(d) { this.dmg += d; } });
    const tin = mk(true), soft = mk(false);
    for (let i = 0; i < 10; i++) { w.applyAnoms(tin, 0.1); w.applyAnoms(soft, 0.1); }
    return { tin: tin.dmg, soft: soft.dmg, tinX: tin.x, softX: soft.x };
  })()`);
  assert.ok(out.tin > out.soft * 3, `металл ${out.tin.toFixed(1)} против ${out.soft.toFixed(1)}`);
  assert.ok(out.tinX < out.softX, "металл должен подтянуться ближе к центру");
});

test("новые мутанты создаются и подчиняются общей логике (Щетинник, Гнилозуб)", () => {
  const out = z.run(`(() => {
    const m = new Mutant("bristler", 100, 100, null), r = new Mutant("rotter", 100, 100, null);
    m.hurt(30, "anom"); r.hurt(30, "anom");
    return { mhp: m.hp, rhp: r.hp, mstate: m.state, rinfect: r.c.infect };
  })()`);
  assert.equal(out.mhp, CFG.mut.bristler.hp - 30 * 0.8, "броня Щетинника режет урон на 20%");
  assert.equal(out.rhp, 30);
  assert.equal(out.rinfect, 0.45);
});

test("оружие: у каждого своя ниша по урону на патрон и скорострельности", () => {
  const W = CFG.weapons, perAmmo = k => W[k].dmg * W[k].pellets, dps = k => perAmmo(k) / W[k].cd;
  assert.ok(perAmmo("revolver") > perAmmo("pistol"), "револьвер бьёт сильнее пистолета за патрон");
  assert.ok(perAmmo("rifle") > perAmmo("revolver"), "винтовка — самая эффективная по патрону");
  assert.ok(dps("smg") > dps("pistol"), "ПП должен давать больше урона в секунду, чем пистолет");
  assert.ok(perAmmo("smg") < perAmmo("pistol"), "но платить за это патронами");
  assert.ok(W.smg.price > W.rifle.price && W.rifle.price > W.revolver.price, "цена растёт вместе с уровнем мастерской");
  assert.ok(W.smg.lvl >= W.rifle.lvl && W.revolver.lvl >= 2);
});

test("иконки 16×16: все строки ровно по 16 символов", () => {
  const fs = require("node:fs"), path = require("node:path");
  const src = fs.readFileSync(path.join(__dirname, "..", "icons.js"), "utf8");
  const bad = [];
  for (const m of src.matchAll(/M\('(\w+)',\s*\[([^\]]+)\]/g)) {
    for (const row of m[2].matchAll(/'([^']*)'/g)) if (row[1].length !== 16) bad.push(`${m[1]}: "${row[1]}" (${row[1].length})`);
  }
  assert.deepEqual(bad, []);
});

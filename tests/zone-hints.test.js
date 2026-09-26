"use strict";
// «Обочина» v0.13: контекстные советы по ходу игры и пояснения на полосках состояния.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createZone } = require("./zone-load");

const z = createZone();
const CFG = z.get("CFG");
const run = code => JSON.parse(JSON.stringify(z.run(code) ?? null));
const plain = h => String(h).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
// Нейтральное состояние: зона, день, ничего не болит, ничего не мешает; log перехватывается в массив Hint.out
const fresh = () => z.run(`(() => {
  W = new World(1234); resetPlayer(); P.stash = []; P.bld = null; Mutants.spawn(); Stalkers.spawn(); Meta.reset(); Camp.enter(true); Dungeon.levels = {};
  G.events = []; G.dead = false; G.started = true; G.ui = null; G.scene = "zone"; G.night = 0; G.hour = 12; G.fog = 0; G.rain = 0; G.emi = { s: "calm", left: 0, next: 99999 }; G.t = 1000;
  P.x = W.C.x + 50; P.y = W.C.y; P.hp = 100; P.rad = 0; P.food = 80; P.stress = 0; P.bleed = 0; P.fracture = false; P.infect = 0; P.burn = 0; P.grab = 0; P.sp = 0; P.money = 500; P.inv = []; invAdd("ammo", 12); invAdd("bolt", 15);
  P.quests = []; P.offers = []; P.gunOffers = []; P.hints = {}; P.hintsOff = false; P.pass = false; P.rep = 0; P.weapon = "pistol"; P.cond.pistol = 100; P.known = {}; P.equip = [null, null];
  Hint.t = 0; Hint.quiet = 0; Hint.last = {}; Hint.out = []; if (!Hint._log) { Hint._log = log; log = (t, c) => { Hint.out.push(String(t)); }; }
  localStorage.removeItem("zone_save_v2");
})()`);
// n срабатываний движка (каждое = 0.6 с игрового времени); результат — показанные советы
const tick = (n = 1) => run(`(() => { for (let i = 0; i < ${n}; i++) { G.t += 0.6; Hint.tick(0.6); } return Hint.out.filter(t => t.startsWith("💡")); })()`);
const away = "P.x = W.C.x + 600; P.y = W.C.y;";   // вне лагеря

test("конфиг советов: у каждого правила уникальный id и функция; ни одно не падает ни в одной сцене", () => {
  fresh();
  const o = run(`(() => {
    const ids = Hint.rules.map(r => r.id), res = { dup: ids.length - new Set(ids).size, n: ids.length, err: [] };
    for (const sc of ["zone", "camp", "interior", "dungeon"]) { G.scene = sc; if (sc === "dungeon") { Dungeon.enter(W.bunkers[0]); } for (const r of Hint.rules) { try { r.when(); } catch (e) { res.err.push(sc + ":" + r.id + ":" + e.message); } } if (sc === "dungeon") Dungeon.leave(); }
    return res;
  })()`);
  assert.equal(o.dup, 0); assert.ok(o.n >= 20); assert.deepEqual(o.err, []);
});

test("в спокойной обстановке советов нет", () => {
  fresh();
  assert.deepEqual(tick(30), []);
});

test("перегруз: совет один раз, с подсказкой про ящик; дальше молчит, пока не сбросишь", () => {
  fresh();
  run(`invAdd("scrap", 200)`);
  const a = tick(1); assert.equal(a.length, 1); assert.match(a[0], /💡 Перегруз/); assert.match(a[0], /ящик/);
  assert.equal(tick(40).length, 1, "второй раз не повторяется"); assert.equal(run(`P.hints.overweight`), true);
});

test("не чаще одного совета за ~6 секунд: при двух условиях сразу второй ждёт, потом показывается", () => {
  fresh();
  run(`P.bleed = 5; P.food = 10;`);
  const a = tick(1); assert.equal(a.length, 1);
  const b = tick(8); assert.equal(b.length, 1, "в пределах ~5 с второго нет");
  const c = tick(6); assert.equal(c.length, 2, "спустя паузу — второй"); assert.ok(a[0] !== c[1]);
});

test("тексты зависят от состояния: здоровье при наличии и отсутствии аптечки; болты/патроны/канистры", () => {
  fresh(); run(`P.hp = 20; invAdd("medkit", 1);`); const withKit = tick(1)[0];
  fresh(); run(`P.hp = 20;`); const noKit = tick(1)[0];
  assert.match(withKit, /слот 3/); assert.match(noKit, /аптечек нет/);
  fresh(); run(`P.inv = []; ` + away); assert.match(tick(1)[0], /Патронов нет/);
  fresh(); run(`P.inv = []; P.weapons.push("crossbow"); P.weapon = "crossbow"; P.cond.crossbow = 100; ` + away); assert.match(tick(1)[0], /Болты кончились/);
  fresh(); run(`P.inv = []; P.weapons.push("flamer"); P.weapon = "flamer"; P.cond.flamer = 100; P.fuel = 0; ` + away); assert.match(tick(1)[0], /Топливо кончилось/);
  fresh(); run(`P.inv = []; P.weapons.push("flamer"); P.weapon = "flamer"; P.cond.flamer = 100; P.fuel = 5; P.hints.leave = true; ` + away); assert.deepEqual(tick(2), [], "остаток топлива в баке — не совет");
});

test("состояния и параметры: кровотечение, перелом, заражение, ожог, радиация, голод, напряжение, износ", () => {
  const cases = [["P.bleed = 4", /Кровотечение/], ["P.fracture = true", /Перелом/], ["P.infect = 3", /Заражение/], ["P.burn = 3", /Горишь/], ["P.rad = 50", /Радиация растёт/], ["P.food = 15", /Голод/], ["P.stress = 80", /Напряжение/], ["P.cond.pistol = 20", /изношено/], ["P.sp = 1", /очко навыка/]];
  for (const [set, re] of cases) { fresh(); run(set + ";"); const o = tick(1); assert.equal(o.length, 1, set); assert.match(o[0], re, set); }
});

test("неопознанный артефакт: совет про учёного; опознанный — не тот же; в лагере с пустым слотом — совет про контейнер", () => {
  fresh(); run(`invAdd("art", 1, "soul");`); assert.match(tick(1)[0], /Неопознанный артефакт/);
  fresh(); run(`invAdd("art", 1, "soul"); P.known.soul = true; G.scene = "camp";`); const o = tick(1); assert.match(o[0], /В контейнер/);
  fresh(); run(`invAdd("art", 1, "soul"); P.known.soul = true; P.equip = ["medusa", "thorn"]; G.scene = "camp";`); assert.deepEqual(tick(2), []);
});

test("обстановка: первый выход из лагеря, ночь, озёра, гарь, сектор 4, сирена вне укрытия", () => {
  fresh(); run(away); const leave = tick(1); assert.match(leave[0], /Зона слушает/);
  fresh(); run(`G.night = 1; P.x = W.C.x + 100; P.y = W.C.y; P.hints.leave = true;`); assert.deepEqual(tick(2), [], "ночь у блокпоста — не совет");
  fresh(); run(away + " P.hints.leave = true; G.night = 1;"); assert.match(tick(1)[0], /Ночь/);
  fresh(); run(away + ` P.hints.leave = true; const il = Array.from(W.bg).findIndex(v => BIOME_KEYS[v] === "lake"); P.x = (il % W.N + 0.5) * W.CELL; P.y = (Math.floor(il / W.N) + 0.5) * W.CELL;`); assert.match(tick(1)[0], /Озёрный край/);
  fresh(); run(away + ` P.hints.leave = true; const ib = Array.from(W.bg).findIndex(v => BIOME_KEYS[v] === "burnt"); P.x = (ib % W.N + 0.5) * W.CELL; P.y = (Math.floor(ib / W.N) + 0.5) * W.CELL;`); assert.match(tick(1)[0], /Гарь/);
  fresh(); run(`P.hints.leave = true; P.hints.lake = true; P.hints.burnt = true; P.hints.night = true; let p = null; for (let i = 0; i < 400 && !p; i++) { const q = W.spot(500, Math.random); if (W.danger(q.x, q.y) === 4) p = q; } P.x = p.x; P.y = p.y; P.rep = 0;`); assert.match(tick(1)[0], /Сектор 4 закрыт/);
  fresh(); run(away + ` P.hints.leave = true; G.emi = { s: "warn", left: 20, next: 0 };`); assert.match(tick(1)[0], /Сирена/);
});

test("сирена повторяется не чаще раза в 240 секунд, а в укрытии молчит", () => {
  fresh(); run(away + ` P.hints.leave = true; G.emi = { s: "warn", left: 20, next: 0 };`);
  assert.equal(tick(1).length, 1); const soon = run(`(() => { G.t += 100; for (let i = 0; i < 20; i++) { G.t += 0.6; Hint.tick(0.6); } return Hint.out.filter(t => t.startsWith("💡")).length; })()`); assert.equal(soon, 1, "рано");
  const later = run(`(() => { G.t += 300; for (let i = 0; i < 20; i++) { G.t += 0.6; Hint.tick(0.6); } return Hint.out.filter(t => t.startsWith("💡")).length; })()`); assert.equal(later, 2, "через 240+ с — снова");
  fresh(); run(`P.x = W.C.x; P.y = W.C.y; G.emi = { s: "warn", left: 20, next: 0 };`); assert.deepEqual(tick(3), [], "в лагере сирена не повод для совета");
});

test("подземелье: совет при спуске и совет про сейф рядом; выход — тишина", () => {
  fresh();
  const a = run(`(() => { Dungeon.enter(W.bunkers[0]); Dungeon.enemies = []; for (let i = 0; i < 4; i++) { G.t += 0.6; Hint.tick(0.6); } return Hint.out.filter(t => t.startsWith("💡")); })()`);
  assert.equal(a.length, 1); assert.match(a[0], /Под землёй темно/);
  const b = run(`(() => { const L = Dungeon.lvl, v = Dungeon.center(L.vault.tx, L.vault.ty); P.x = v.x + 30; P.y = v.y; Hint.quiet = 0; for (let i = 0; i < 4; i++) { G.t += 0.6; Hint.tick(0.6); } return Hint.out.filter(t => t.startsWith("💡")); })()`);
  assert.equal(b.length, 2); assert.match(b[1], /Сейф рядом/);
});

test("лагерь: выполненное задание — совет сдать (повторяется); хлам и трофеи при нехватке денег — совет продать", () => {
  fresh();
  const a = run(`(() => { G.scene = "camp"; P.quests = [{ type: "bring", mat: "scrap", n: 1, reward: 10, rep: 1, text: "t", id: 1 }]; invAdd("scrap", 2); P.money = 1000; for (let i = 0; i < 3; i++) { G.t += 0.6; Hint.tick(0.6); } return Hint.out.filter(t => t.startsWith("💡")); })()`);
  assert.equal(a.length, 1); assert.match(a[0], /сдай Сидору/);
  fresh(); run(`G.scene = "camp"; invAdd("scrap", 3); P.money = 20;`); assert.match(tick(1)[0], /Скупка|скупка/);
});

test("выключатель: при hintsOff, открытой панели, смерти и до старта игры советов нет", () => {
  for (const set of ["P.hintsOff = true", "G.ui = { k: \"inv\" }", "G.dead = true", "G.started = false"]) { fresh(); run(`invAdd("scrap", 200); ` + set + ";"); assert.deepEqual(tick(5), [], set); }
});

test("меню: кнопка включает и выключает подсказки, «Показать заново» сбрасывает; состояние видно в меню", () => {
  fresh();
  const o = run(`(() => {
    const menu = () => menuHTML({ k: "menu" }).replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ");
    P.hints = { overweight: true, bleed: true }; const on = menu(); Meta.click("hintsToggle", 0, 0, {}); const off = menu(), flag = P.hintsOff; Meta.click("hintsToggle", 0, 0, {}); const back = P.hintsOff;
    Meta.click("hintsReset", 0, 0, {}); return { on, off, flag, back, hints: Object.keys(P.hints).length };
  })()`);
  assert.match(o.on, /Подсказки по ходу игры: включены/); assert.match(o.off, /выключены/); assert.equal(o.flag, true); assert.equal(o.back, false); assert.equal(o.hints, 0);
});

test("после «Показать заново» совет снова срабатывает; сохранение хранит показанные и выключатель", () => {
  fresh();
  const o = run(`(() => {
    invAdd("scrap", 200); Hint.out = []; G.t += 1; Hint.tick(0.6); const first = Hint.out.filter(t => t.startsWith("💡")).length; Meta.click("hintsReset", 0, 0, {}); Hint.quiet = 0; Hint.out = []; G.t += 1; Hint.tick(0.6); const again = Hint.out.filter(t => t.startsWith("💡")).length;
    P.hints = { overweight: true, bleed: true }; P.hintsOff = true; Camp.enter(true); save(); P.hints = {}; P.hintsOff = false; W = null; load();
    return { first, again, hints: Object.keys(P.hints).sort(), off: P.hintsOff };
  })()`);
  assert.equal(o.first, 1); assert.equal(o.again, 1); assert.deepEqual(o.hints, ["bleed", "overweight"]); assert.equal(o.off, true);
});

test("новая игра начинает без показанных советов", () => {
  fresh();
  const o = run(`(() => { P.hints = { bleed: true }; resetPlayer(); return Object.keys(P.hints).length; })()`);
  assert.equal(o, 0);
});

test("полоски состояния: наведение объясняет здоровье, силы, радиацию, сытость и напряжение с текущими значениями", () => {
  fresh();
  const o = run(`(() => {
    P.hp = 42; P.bleed = 3; P.rad = 12; P.food = 77; P.stress = 9; const mk = id => ({ closest: s => (s === ".bar" ? { querySelector: () => ({ id }) } : null) }), r = {};
    for (const id of ["b_hp", "b_st", "b_rad", "b_food", "b_psy"]) r[id] = Tip.resolve(mk(id)); r.other = Tip.resolve({ closest: () => null }); r.unknown = Tip.resolve({ closest: s => (s === ".bar" ? { querySelector: () => ({ id: "b_x" }) } : null) }); return r;
  })()`);
  assert.match(plain(o.b_hp), /Здоровье 42 \/ 100/); assert.match(plain(o.b_hp), /кровотечение/); assert.match(plain(o.b_st), /Силы/); assert.match(plain(o.b_rad), /Радиация 12 \/ 100/); assert.match(plain(o.b_rad), /Антирад снимает 35/);
  assert.match(plain(o.b_food), /Сытость 77/); assert.match(plain(o.b_psy), /Напряжение 9/); assert.equal(o.other, null); assert.equal(o.unknown, null);
});

test("совет про прилавок: только в лагере, если есть редкое оружие и хватает денег", () => {
  fresh();
  const mk = (rar, price, money, scene) => run(`(() => { P.gunOffers = [{ def: Wpn.roll("revolver", U.rng(3), { rar: ${rar} }), price: ${price} }]; P.money = ${money}; G.scene = "${scene}"; P.hints = {}; Hint.quiet = 0; Hint.out = []; for (let i = 0; i < 3; i++) { G.t += 0.6; Hint.tick(0.6); } return Hint.out.filter(t => t.startsWith("\u{1F4A1}")); })()`);
  assert.match(mk(2, 500, 800, "camp")[0], /редкое оружие/); assert.deepEqual(mk(1, 500, 800, "camp"), [], "Хорошее — не повод"); assert.deepEqual(mk(2, 500, 100, "camp"), [], "денег не хватает"); assert.deepEqual(mk(2, 500, 800, "zone"), [], "не в лагере");
});

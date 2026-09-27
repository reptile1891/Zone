"use strict";
// v0.28: живые существа и аномалии; погода и время суток; события Зоны; статистика и достижения; звук (без звука).
const test = require("node:test");
const assert = require("node:assert/strict");
const { createZone } = require("./zone-load");

const z = createZone();
const run = code => JSON.parse(JSON.stringify(z.run(code) ?? null));
const fresh = () => z.run(`(() => {
  W = new World(1234); resetPlayer(); P.stash = []; P.bld = null; Mutants.spawn(); Stalkers.spawn(); Meta.reset(); Camp.enter(true);
  G.events = []; G.dead = false; G.started = true; G.ui = null; G.scene = "zone"; G.emi = { s: "calm", left: 0, next: 99999 }; G.t = 5; G.night = 0; G.fog = 0; G.rain = 0; VW = 800; VH = 600;
  P.x = 3000; P.y = 3000; P.hp = 100; P.inv = []; P.sk.sense = 0; Mutants.list = []; Stalkers.list = []; W.anoms = []; W.arts = []; W.loot = []; P.cd = 0; Meta.hooks = []; Meta.reeling = []; Mutants.adapt = {}; Events.act = [];
})()`);
const anom = (type, extra) => `(() => { const a = { id: 1, type: "${type}", x: 3500, y: 3000, r: CFG.anoms.${type}.r, ph: 1, rot: 0, t: 0, state: 0, known: false, flash: 0, revealed: 0, vx: 0, vy: 0, act: false, dir: 0 }; Object.assign(a, ${extra || "{}"}); W.anoms = [a]; return a; })()`;
const SP = `Object.keys(CFG.mut).find(k => !CFG.mut[k].aquatic && !CFG.mut[k].timid)`;

test("существо, попавшее в аномалию, получает урон и запоминает её", () => {
  fresh();
  const o = run(`(() => {
    ${anom("plesh")}; const m = new Mutant(${SP}, 3500, 3000, null); Mutants.list = [m]; const hp0 = m.hp;
    W.update(0.5, [m]); return { hurt: m.hp < hp0, know: m.ak && m.ak[1] === true };
  })()`);
  assert.equal(o.hurt, true); assert.equal(o.know, true, "после ожога знает эту аномалию");
});

test("знающий обходит аномалию, не знающий идёт напролом; в погоне мутант рвётся через край", () => {
  fresh();
  const o = run(`(() => {
    const a = ${anom("funnel")}; const sp = ${SP};
    const mk = known => { const m = new Mutant(sp, a.x - 42, a.y + 16, null); m.reckless = 0; m.ak = { 1: known }; m.slow = 1; return m; };
    const step = (m, state) => { m.state = state; const x0 = m.x, y0 = m.y; m.move(0.2, a.x + 300, a.y, 100); return { dx: m.x - x0, dy: m.y - y0 }; };
    const know = step(mk(true), "wander"), blind = step(mk(false), "wander"), hunt = step(mk(true), "hunt");
    return { know, blind, hunt };
  })()`);
  assert.ok(o.know.dy > o.blind.dy + 0.5, "знающий сворачивает: " + JSON.stringify(o));
  assert.ok(o.hunt.dy < o.know.dy, "в погоне отталкивание слабее");
});

test("шанс знать аномалию растёт с опытом вида; сталкер знает с шансом ~55%", () => {
  fresh();
  const o = run(`(() => {
    const sp = ${SP}, cnt = (mk, n) => { let k = 0; for (let i = 0; i < n; i++) { const e = mk(); if (W.knows(e, { id: 7 })) k++; } return k / n; };
    const low = cnt(() => ({ sp }), 1500); Mutants.ad(sp).anom = 3; const high = cnt(() => ({ sp }), 1500); Mutants.ad(sp).anom = 0;
    const st = cnt(() => ({}), 1500); const e = {}; const first = W.knows(e, { id: 7 }); const same = W.knows(e, { id: 7 }) === first;
    return { low, high, st, same };
  })()`);
  assert.ok(o.low > 0.33 && o.low < 0.47, "неопытный ~40%: " + o.low); assert.ok(o.high > 0.79 && o.high < 0.91, "опытный ~85%: " + o.high); assert.ok(o.st > 0.5 && o.st < 0.6); assert.equal(o.same, true, "решение запоминается");
});

test("гибель существа в аномалии считается", () => {
  fresh();
  const o = run(`(() => {
    ${anom("plesh")}; const m = new Mutant(${SP}, 3500, 3000, null); m.hp = 1; Mutants.list = [m]; P.x = 3400; P.y = 3000;
    const before = P.st.anomKills; W.update(0.6, [m]); return { dead: m.dead, n: P.st.anomKills - before };
  })()`);
  assert.equal(o.dead, true); assert.equal(o.n, 1);
});

test("погода и время суток: ночью и в тумане примет заметно меньше, налобный фонарь снимает ночную поправку, приборы не зависят", () => {
  fresh();
  const o = run(`(() => {
    P.sk.sense = 0; const day = signR(); G.night = 1; const night = signR(); const nightArt = artR(); G.night = 0; const dayArt = artR();
    G.fog = 0.8; const fog = signR(); G.fog = 0; G.night = 1; invAdd("headlamp", 1); const lamp = signR(); P.inv = []; invAdd("detector", 1); const det = signR(); G.night = 0; const detDay = signR();
    return { day, night, fog, lamp, det, detDay, nightArt, dayArt };
  })()`);
  assert.equal(o.day, 60); assert.ok(o.night < o.day * 0.75); assert.ok(o.fog < o.day * 0.85); assert.equal(o.lamp, 60); assert.equal(o.det - o.night, 90, "прибор даёт свои +90 в любую погоду"); assert.equal(o.detDay - o.day, 90);
  assert.ok(o.nightArt > o.dayArt, "артефакты ночью светятся");
});

test("выброс ускоряет заряд Электры, Пружины и Колодца", () => {
  fresh();
  const o = run(`(() => {
    const a = ${anom("spring")}; W.update(1, []); const calm = a.t; a.t = 0; G.emi = { s: "blast", left: 5, next: 1 }; W.update(1, []); const blast = a.t; G.emi = { s: "calm", left: 0, next: 99999 };
    return { calm, blast };
  })()`);
  assert.ok(o.blast > o.calm * 1.5, JSON.stringify(o));
});

test("события: груз — охрана, вскрытие даёт добычу и считается", () => {
  fresh();
  const o = run(`(() => {
    const before = P.st.events; Events.spawn("cargo"); const e = Events.act[0]; if (!e) return { none: true };
    const guards = Stalkers.list.filter(s => s.ev).length, money0 = P.money; Events.openCargo(e); Events.update(0.1);
    return { guards, gained: P.money > money0, open: e.opened, left: Events.act.length, n: P.st.events - before, ammo: invCount("ammo") > 0 };
  })()`);
  assert.equal(o.none, undefined); assert.ok(o.guards >= 2); assert.equal(o.gained, true); assert.equal(o.left, 0); assert.equal(o.n, 1); assert.equal(o.ammo, true);
});

test("события: всплеск создаёт временные аномалии с артефактами и убирает их по окончании", () => {
  fresh();
  const o = run(`(() => {
    Events.spawn("surge"); const e = Events.act[0]; if (!e) return { none: true };
    const tmp = W.anoms.filter(a => a.tmp).length, arts = W.arts.filter(a => a.surge).length, q = W.arts.filter(a => a.surge).every(a => a.q >= 0.7);
    e.ttl = 0.01; Events.update(0.1); return { tmp, arts, q, gone: W.anoms.length, artsLeft: W.arts.length, act: Events.act.length };
  })()`);
  assert.equal(o.none, undefined); assert.ok(o.tmp >= 1); assert.equal(o.arts, o.tmp); assert.equal(o.q, true); assert.equal(o.gone, 0); assert.equal(o.artsLeft, 0); assert.equal(o.act, 0);
});

test("события: засада — бандиты впереди, победа считается; коробейник продаёт, деньги списываются", () => {
  fresh();
  const o = run(`(() => {
    Events.spawn("ambush"); const e = Events.act[0]; if (!e) return { none: true };
    const n = e.guards.length; for (const s of e.guards) s.dead = true; const before = P.st.events; Events.update(0.1); const won = P.st.events - before;
    Events.act = []; Events.spawn("peddler"); const p = Events.act[0]; P.money = 1000; Events.openPeddler(p.s); const html = Events.peddlerHtml(G.ui); const hp = P.money; Events.buy(1);
    return { n, won, offers: p.s.offers.length, html: /Коробейник/.test(html), paid: hp - P.money, sold: p.s.offers[1].sold, ev: P.st.events - before };
  })()`);
  assert.equal(o.none, undefined); assert.ok(o.n >= 3); assert.equal(o.won, 1); assert.ok(o.offers >= 4); assert.equal(o.html, true); assert.ok(o.paid > 0); assert.equal(o.sold, true); assert.equal(o.ev, 2);
});

test("события: возвращение в лагерь очищает их; в лагере они не появляются", () => {
  fresh();
  const o = run(`(() => {
    Events.spawn("peddler"); const had = Events.act.length; Camp.enter(false); const after = Events.act.length, left = Stalkers.list.filter(s => s.ev).length;
    G.scene = "camp"; Events.next = 0; Events.update(1); return { had, after, left, camp: Events.act.length };
  })()`);
  assert.equal(o.had, 1); assert.equal(o.after, 0); assert.equal(o.left, 0); assert.equal(o.camp, 0);
});

test("статистика вылазки: убийства, артефакты, урон, глубина; сводка при возвращении", () => {
  fresh();
  const o = run(`(() => {
    Camp.depart(); Meta.onKill("bandit"); Meta.onKill("bounty"); takeArt({ type: "soul", x: 0, y: 0, q: 1 }); W.arts = []; P.hurt(12, "gun"); P.run.sector = 3; const r = P.run; const kills = r.kills, arts = r.arts, dmg = Math.round(r.dmg);
    G.dead = false; Camp.enter(false); const ui = G.ui && G.ui.k, last = P.lastRun, html = Stats.html(); return { kills, arts, dmg, ui, last: last && { kills: last.kills, arts: last.arts, sector: last.sector, kind: last.kind }, run: P.run, html: /Прошлая вылазка/.test(html), runs: P.st.runs };
  })()`);
  assert.equal(o.kills, 1, "убийство «главаря» дважды не считается"); assert.equal(o.arts, 1); assert.equal(o.dmg, 12); assert.equal(o.ui, "stats");
  assert.deepEqual(o.last, { kills: 1, arts: 1, sector: 3, kind: "back" }); assert.equal(o.run, null); assert.equal(o.html, true); assert.equal(o.runs, 1);
});

test("смерть: вылазка закрывается как гибель и не считается возвращением", () => {
  fresh();
  const o = run(`(() => { Camp.depart(); Meta.onKill("bandit"); P.hp = 0; die(); return { dead: P.lastRun && P.lastRun.kind, deaths: P.st.deaths, runs: P.st.runs, run: P.run }; })()`);
  assert.equal(o.dead, "dead"); assert.equal(o.deaths, 1); assert.equal(o.runs, 0); assert.equal(o.run, null);
});

test("достижения: ступени выдают награду один раз, живут в сохранении; новая игра начинает с нуля", () => {
  fresh();
  const o = run(`(() => {
    const m0 = P.money; P.st.kills = 10; Stats.check(); const a = P.money - m0; Stats.check(); const b = P.money - m0; P.st.kills = 50; Stats.check();
    save(true); const raw = JSON.parse(localStorage.getItem(saveKey())); const saved = raw.P.ach && raw.P.ach.kills, st = raw.P.st && raw.P.st.kills;
    resetPlayer(); return { a, b, lvl: saved, st, fresh: P.st.kills, freshAch: Object.keys(P.ach).length };
  })()`);
  assert.equal(o.a, 60); assert.equal(o.b, 60, "второй раз не выдаётся"); assert.equal(o.lvl, 2); assert.equal(o.st, 50); assert.equal(o.fresh, 0); assert.equal(o.freshAch, 0);
});

test("достижения: крюк и глубина считаются, панель показывает прогресс", () => {
  fresh();
  const o = run(`(() => { P.st.hook = 3; P.st.sector = 3; Stats.check(); const html = Stats.html(); return { hook: P.ach.hook, depth: P.ach.depth, html: /Без царапины/.test(html) && /Всё глубже/.test(html) }; })()`);
  assert.equal(o.hook, 1); assert.equal(o.depth, 2); assert.equal(o.html, true);
});

test("музыка: режим и напряжение по обстановке; без звукового контекста ничего не падает; настройки в меню", () => {
  fresh();
  const o = run(`(() => {
    G.scene = "camp"; const camp = Snd.mood(); G.scene = "zone"; P.x = 3000; P.y = 3000; const day = Snd.mood(); G.night = 1; const night = Snd.mood(); G.night = 0;
    const m = new Mutant(${SP}, 3100, 3000, null); m.state = "hunt"; Mutants.list = [m]; const hunt = Snd.mood(); Mutants.list = [];
    G.emi = { s: "blast", left: 5, next: 1 }; const emi = Snd.mood(); G.emi = { s: "calm", left: 0, next: 99999 }; G.scene = "dungeon"; const deep = Snd.mood(); G.scene = "zone";
    Snd.tickMusic(1); Snd.achieve(); Snd.evCargo(); Snd.whoosh(); Snd.sector(3); Snd.at("zapdie", 3000, 3000);
    const rows = Snd.menuRows(); return { camp, day, night, hunt, emi, deep, rows: /Музыка/.test(rows) };
  })()`);
  assert.equal(o.camp.mode, "camp"); assert.equal(o.camp.ten, 0); assert.equal(o.day.mode, "day"); assert.equal(o.night.mode, "night"); assert.ok(o.hunt.ten > o.day.ten); assert.ok(o.emi.ten >= 0.85); assert.equal(o.deep.mode, "deep"); assert.equal(o.rows, true);
});

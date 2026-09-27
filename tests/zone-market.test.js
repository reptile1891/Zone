"use strict";
// v0.29: Торговый дом (вся торговля в одном здании), три здания лагеря; дальность и разброс оружия; звук без постоянного гула.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createZone } = require("./zone-load");

const z = createZone();
const run = code => JSON.parse(JSON.stringify(z.run(code) ?? null));
const fresh = () => z.run(`(() => {
  W = new World(1234); resetPlayer(); P.stash = []; P.bld = null; Mutants.spawn(); Stalkers.spawn(); Meta.reset(); Camp.enter(true);
  G.events = []; G.dead = false; G.started = true; G.ui = null; G.scene = "zone"; G.emi = { s: "calm", left: 0, next: 99999 }; G.t = 5; G.night = 0; G.fog = 0; G.rain = 0; VW = 800; VH = 600;
  P.x = 3000; P.y = 3000; P.hp = 100; P.inv = []; P.sk.sense = 0; Mutants.list = []; Stalkers.list = []; W.anoms = []; W.arts = []; W.loot = []; P.cd = 0; P.bloom = 0; P.gunOffers = [];
})()`);

test("лагерь: три входа — Бар, Торговый дом, Мастерская (плюс казарма); прежних лавок на карте нет", () => {
  fresh();
  const o = run(`(() => {
    Camp.build(); G.scene = "camp"; const labels = []; Camp.near((k, d, lim, label) => labels.push(String(k) + ": " + label));
    return { labels, vend: Object.keys(Camp.vend), items: Camp.items.filter(i => i.k).map(i => i.k) };
  })()`);
  assert.deepEqual(o.vend.sort(), ["bar", "gun", "market"]); assert.deepEqual(o.items.sort(), ["bar", "gun", "market"]);
  const enter = o.labels.filter(l => /Войти/.test(l)); assert.equal(enter.length, 4, "бар, торговый дом, мастерская, казарма: " + enter.join(" | "));
  assert.ok(enter.some(l => /Торговый дом/.test(l)));
});

test("Торговый дом: одно окно point & click — витрина Снабжения, Оружейной, ножей и слотов плюс продажа всего рюкзака; опознания и вкладок нет", () => {
  fresh();
  const o = run(`(() => {
    P.bld = Camp.DEFAULT_BLD(); P.money = 500; invAdd("scrap", 3); invAdd("art", 1, "soul"); invAdd("art", 1, "medusa"); P.known.medusa = true; P.gunOffers = [];
    const stock = Camp.stock("market"), v = CFG.vendors.market; const u = { k: "trade", v: "market" }; const html = Shop.tradeHTML(u);
    return { stock, hasGun: CFG.vendors.gun.sells.every(id => stock.includes(id)), hasGear: Camp.stock("gear").every(id => stock.includes(id)), ident: v.ident === undefined, name: /Торговый дом/.test(v.name),
      shopKinds: [...new Set(Shop.stockList("market").concat(Shop.weaponList(), Shop.knifeList()).map(o2 => o2.kind))], noTabs: !/mtab:/.test(html), grid: /cell:shop:/.test(html) && /ggrid big/.test(html) };
  })()`);
  assert.equal(o.hasGun, true); assert.equal(o.hasGear, true); assert.equal(o.ident, true); assert.equal(o.name, true); assert.equal(o.noTabs, true, "вкладок больше нет — один экран");
  assert.deepEqual(o.shopKinds.sort(), ["item", "knife", "weapon"], "витрина смешивает снабжение, оружие и ножи"); assert.equal(o.grid, true);
});

test("Торговый дом: цена продажи — лучшая из Скупки, Лаборатории и Оружейной; покупка и опознание работают отсюда", () => {
  fresh();
  const o = run(`(() => {
    P.bld = Camp.DEFAULT_BLD(); const s = { id: "art", n: 1, art: "medusa", q: 1 }; P.known.medusa = true;
    const prices = ["buyer", "sci", "gun"].map(k => sellPrice(s, k)), m = sellPrice(s, "market");
    const junk = { id: "scrap", n: 1 }, jm = sellPrice(junk, "market"), jbest = Math.max(sellPrice(junk, "buyer"), sellPrice(junk, "gun"));
    P.money = 500; invAdd("art", 1, "soul"); const un = P.inv.length - 1; const u = { k: "trade", v: "market" }; G.ui = u;
    Inv.buy(Shop.stockList("market").find(o => o.id === "medkit"), 1); const bought = invCount("medkit"); Inv.buy(Shop.stockList("market").find(o => o.id === "ammo"), 1); const ammo = invCount("ammo");
    const before = P.money; Meta.click("ident", String(un), undefined, u); const knownAtMarket = !!P.known.soul; const sciU = { k: "trade", v: "sci" }; Meta.click("ident", String(un), undefined, sciU); const known = !!P.known.soul, spent = before - P.money;
    invAdd("scrap", 4); const si = P.inv.findIndex(x => x.id === "scrap"); const m0 = P.money; u.hand = { z: "inv", i: si, n: 1 }; Inv.act(u, "sell");
    return { prices, m, jm, jbest, bought, ammo, spent, known, knownAtMarket, sold: P.money - m0 };
  })()`);
  assert.equal(o.m, Math.max(...o.prices)); assert.equal(o.jm, o.jbest); assert.ok(o.jm > 0);
  assert.equal(o.bought, 1); assert.ok(o.ammo > 0); assert.equal(o.knownAtMarket, false, "в Торговом доме не опознают"); assert.equal(o.known, true); assert.equal(o.spent, 30, "учёный берёт деньги"); assert.equal(o.sold, o.jm);
});

test("уровни зданий прежние: скидка Снабжения и цена Скупки работают через Торговый дом, старые сохранения читаются", () => {
  fresh();
  const o = run(`(() => {
    P.bld = { buyer: 1, gun: 1, gear: 1, sci: 1, bar: 1, barracks: 1, storage: 1 }; const lvl1 = Camp.lvl("market"), p1 = buyPrice("medkit"); P.bld.gear = 3; P.bld.buyer = 2;
    return { lvl1, lvl3: Camp.lvl("market"), cheaper: buyPrice("medkit") < p1, stock: Camp.stock("market").includes("detector2"), name: Camp.bName("market") };
  })()`);
  assert.equal(o.lvl1, 1); assert.equal(o.lvl3, 3); assert.equal(o.cheaper, true); assert.equal(o.stock, true); assert.equal(o.name, "Торговый дом");
});

test("комнаты: у Торгового дома два торговца, прилавок и чертежи Снабжения и Скупки; в Мастерской верстак, лаборатория и её чертежи", () => {
  fresh();
  const o = run(`(() => {
    P.bld = Camp.DEFAULT_BLD(); Camp.build(); Camp.buildRoom("market"); Camp.buildRoom("gun"); const M = Camp.rooms.market, Gn = Camp.rooms.gun, lab = s => s.map(x => x.label());
    return { vendors: M.vendors.map(v => v.k), mspots: lab(M.spots), gspots: lab(Gn.spots), name: M.name };
  })()`);
  assert.deepEqual(o.vendors, ["gear", "buyer"]); assert.ok(o.mspots.some(l => /Торговый прилавок/.test(l))); assert.ok(o.mspots.some(l => /Снабжение/.test(l)) && o.mspots.some(l => /Скупка/.test(l)));
  assert.ok(o.gspots.some(l => /Верстак/.test(l)) && o.gspots.some(l => /Лабораторный стол/.test(l)) && o.gspots.some(l => /Лаборатория/.test(l)));
  assert.ok(o.gspots.some(l => /Говорить: Оружейник/.test(l) && /разобрать/.test(l)), "Ржавый улучшает и разбирает"); assert.match(o.name, /Торговый дом/);
});

test("оружие: дальность пистолета сильно короче прежней, разброс больше, у всех видов разброс растёт с расстоянием", () => {
  fresh();
  const o = run(`(() => ({ pistol: CFG.weapons.pistol.range, spread: CFG.weapons.pistol.spread, rev: CFG.weapons.revolver.range, rifle: CFG.weapons.rifle.range, smg: CFG.weapons.smg.range,
    all: Object.keys(CFG.weapons).filter(k => !CFG.weapons[k].cone).every(k => CFG.weapons[k].spread >= 0.05) }))()`);
  assert.ok(o.pistol <= 320 && o.pistol >= 250); assert.ok(o.spread >= 0.12); assert.ok(o.rev < 500); assert.ok(o.rifle > o.rev && o.rifle > o.pistol); assert.ok(o.smg < 400); assert.equal(o.all, true);
});

test("разброс: на дальней дистанции пистолет попадает заметно реже, чем вблизи; серия выстрелов раскачивает оружие", () => {
  fresh();
  const o = run(`(() => {
    const hits = (dist, n) => { let h = 0; for (let i = 0; i < n; i++) { const m = new Mutant(Object.keys(CFG.mut).find(k => !CFG.mut[k].aquatic && !CFG.mut[k].timid), P.x + dist, P.y, null); m.hp = 1e6; m.c = Object.assign({}, m.c, { r: 9 }); m.r = 9; Mutants.list = [m]; Stalkers.list = [];
      P.ang = 0; P.cd = 0; P.bloom = 0; P.weapon = "pistol"; P.cond.pistol = 100; invAdd("ammo", 1); const hp = m.hp; shoot(); if (m.hp < hp) h++; } return h / n; };
    const near = hits(60, 300), far = hits(300, 300); P.bloom = 0; P.cd = 0; invAdd("ammo", 5); const b0 = P.bloom; shoot(); const b1 = P.bloom; P.cd = 0; shoot(); const b2 = P.bloom;
    Meta.update(0.5); const b3 = P.bloom; const s0 = Meta.spreadOf(Wpn.of("pistol"), false, 100); P.sneak = true; const sn = Meta.spreadOf(Wpn.of("pistol"), false, 100); P.sneak = false; const mv = Meta.spreadOf(Wpn.of("pistol"), true, 100);
    return { near, far, b0, b1, b2, b3, s0, sn, mv };
  })()`);
  assert.ok(o.near > 0.9, "вблизи почти всегда попадает: " + o.near); assert.ok(o.far < 0.6 && o.far > 0.1, "вдали ~половина: " + o.far);
  assert.equal(o.b0, 0); assert.ok(o.b1 > 0 && o.b2 > o.b1 && o.b3 < o.b2, "раскачка растёт и спадает"); assert.ok(o.sn < o.s0 && o.mv > o.s0);
});

test("пуля не летит дальше дальности оружия: цель за пределами не поражается", () => {
  fresh();
  const o = run(`(() => {
    const sp = Object.keys(CFG.mut).find(k => !CFG.mut[k].aquatic && !CFG.mut[k].timid); const m = new Mutant(sp, P.x + 500, P.y, null); m.hp = 1e6; Mutants.list = [m]; P.ang = 0; P.cd = 0; P.weapon = "pistol"; invAdd("ammo", 1);
    let hit = false; for (let i = 0; i < 40; i++) { P.cd = 0; invAdd("ammo", 1); const hp = m.hp; shoot(); if (m.hp < hp) hit = true; } return { hit };
  })()`);
  assert.equal(o.hit, false);
});

test("звук: постоянных гудений нет — гул генератора только рядом с ним, в комнатах тишина; музыка — редкие ноты", () => {
  fresh();
  const o = run(`(() => {
    const calls = []; const _h = Snd.setHum; Snd.setHum = (f, v) => calls.push(Math.round(v * 1000) / 1000);
    Camp.build(); G.scene = "camp"; P.x = 200; P.y = 900; Camp.tick(0.1); const far = calls.pop(); P.x = Camp.spots.gen.x; P.y = Camp.spots.gen.y + 30; Camp.tick(0.1); const near = calls.pop();
    Camp.buildRoom("market"); G.scene = "interior"; Camp.room = Camp.rooms.market; P.x = 400; P.y = 400; Camp.tickRoom(0.1); const room = calls.pop(); Snd.setHum = _h; G.scene = "zone";
    const src = Snd.tickMusic.toString(); return { far, near, room, sustained: /createOscillator\\(\\)/.test(Snd.initMusic.toString()) && /pad/.test(Snd.initMusic.toString()) };
  })()`);
  assert.equal(o.far, 0); assert.ok(o.near > 0 && o.near <= 0.03); assert.equal(o.room, 0); assert.equal(o.sustained, false, "непрерывного пада нет");
});

test("опознание: только у Учёного «Лиса» в Мастерской и всегда за деньги (никогда бесплатно); неопознанный артефакт в Торговом доме продаётся по низу", () => {
  fresh();
  const o = run(`(() => {
    P.bld = Camp.DEFAULT_BLD(); const costs = [1, 2, 3].map(l => { P.bld.sci = l; return Camp.identCost(); }); P.bld.sci = 3; P.money = 5; invAdd("art", 1, "soul", 1); const i0 = P.inv.findIndex(s => s.art);
    Meta.click("ident", String(i0), undefined, { k: "trade", v: "sci" }); const poor = !!P.known.soul, moneyKept = P.money;
    P.money = 100; Meta.click("ident", String(i0), undefined, { k: "trade", v: "sci" }); const paid = 100 - P.money, known = !!P.known.soul;
    P.known = {}; invAdd("art", 1, "medusa", 1); const ui = P.inv.findIndex(s => s.art === "medusa"), s = P.inv[ui];
    const unkPrice = sellPrice(s, "market"); P.known.medusa = true; const knownPrice = sellPrice(s, "market"); P.known.medusa = false;
    const m0 = P.money; const mu = { v: "market", hand: { z: "inv", i: ui, n: 1 } }; Inv.act(mu, "sell"); const sold = P.money - m0, gone = !P.inv.some(x => x.art === "medusa");
    Camp.buildRoom("gun"); const R = Camp.rooms.gun; const lis = R.vendors.some(v => v.k === "sci"), spot = R.spots.some(x => /Лис/.test(x.label()));
    return { costs, poor, moneyKept, paid, known, unkPrice, knownPrice, sold, gone, lis, spot, mktIdent: CFG.vendors.market.ident };
  })()`);
  assert.deepEqual(o.costs, [30, 20, 12]); assert.ok(o.costs.every(c => c > 0)); assert.equal(o.poor, false, "без денег не опознают"); assert.equal(o.moneyKept, 5); assert.equal(o.paid, 12); assert.equal(o.known, true);
  assert.ok(o.unkPrice > 0 && o.unkPrice < o.knownPrice * 0.5, "по низу: " + o.unkPrice + " против " + o.knownPrice); assert.equal(o.sold, o.unkPrice); assert.equal(o.gone, true);
  assert.equal(o.lis, true); assert.equal(o.spot, true); assert.equal(o.mktIdent, undefined);
});

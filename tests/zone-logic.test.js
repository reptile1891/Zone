"use strict";
// «Обочина»: игровая логика поверх ядра — задания, экономика, лагерь и улучшения, крафт, износ, сталкеры, смерть, сохранение.
// Все тесты выполняются в общей песочнице, поэтому каждый начинает с fresh() и сам выставляет нужное состояние.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createZone } = require("./zone-load");

const z = createZone();
const CFG = z.get("CFG");
const fresh = (seed = 1234) => z.run(`(() => {
  W = new World(${seed}); resetPlayer(); P.stash = []; P.bld = null; Mutants.spawn(); Stalkers.spawn(); Meta.reset(); Camp.enter(true);
  G.events = []; G.dead = false; G.scene = "zone"; G.night = 0; G.hour = 12; G.fog = 0; G.rain = 0; G.emi = { s: "calm", left: 0, next: 99999 };
  P.x = 3000; P.y = 3000; P.hp = 100; P.money = 1000; P.inv = []; P.rep = 0; P.quests = []; P.offers = []; localStorage.removeItem("zone_save_v2");
})()`);
// результаты прогоняем через JSON: объекты из песочницы имеют другой Object.prototype, deepEqual их не сравнит
const run = code => JSON.parse(JSON.stringify(z.run(code) ?? null));
// Детерминированный Math.random на время блока
const withRandom = (v, fn) => { const o = Math.random; Math.random = typeof v === "function" ? v : () => v; try { return fn(); } finally { Math.random = o; } };

// ---------- инвентарь и прогрессия ----------
test("инвентарь: стеки складываются, вес считается, перегруз режет грузоподъёмность", () => {
  fresh();
  const o = run(`(() => {
    invAdd("scrap", 3); invAdd("scrap", 2); invAdd("art", 1, "soul"); invAdd("art", 1, "soul");
    const stacks = P.inv.filter(s => s.id === "scrap"), arts = P.inv.filter(s => s.art).length, n = stacks[0].n;
    const w = weight(), cap = carryCap(); invTake("scrap", 4);
    return { n, stackCount: stacks.length, arts, w, cap, left: invCount("scrap"), take: (invTake("scrap", 99), invCount("scrap")) };
  })()`);
  assert.equal(o.n, 5); assert.equal(o.stackCount, 1); assert.equal(o.arts, 2, "артефакты не складываются в стек");
  assert.equal(o.left, 1); assert.equal(o.take, 0);
  assert.ok(Math.abs(o.w - (5 * CFG.items.scrap.w + 2 * CFG.arts.soul.w)) < 1e-9);
  assert.ok(o.cap >= CFG.player.carry);
});

test("опыт: уровень растёт по кривой и даёт очко навыка", () => {
  fresh();
  const o = run(`(() => { addXp(60); const a = { lvl: P.lvl, sp: P.sp }; addXp(60 * Math.pow(2, 1.4) + 1); return { a, b: { lvl: P.lvl, sp: P.sp } }; })()`);
  assert.deepEqual(o.a, { lvl: 2, sp: 1 }); assert.equal(o.b.lvl, 3); assert.equal(o.b.sp, 2);
});

// ---------- задания ----------
test("задания: генерация даёт 4 предложения (+1 за каждый уровень бара), не выше лимита", () => {
  fresh();
  const o = run(`(() => { const a = (Meta.genOffers(), P.offers.length); P.bld = Camp.DEFAULT_BLD(); P.bld.bar = 3; Meta.genOffers(); return { a, b: P.offers.length, types: P.offers.map(x => x.type) }; })()`);
  assert.ok(o.a >= 4 && o.a <= 6); assert.ok(o.b >= 6 && o.b <= 8, "бар 3 уровня: минимум 6 заданий, а не " + o.b);
});

test("задания: не больше трёх активных", () => {
  fresh();
  const o = run(`(() => { P.offers = [1, 2, 3, 4].map(i => ({ type: "bring", mat: "scrap", n: 1, reward: 10, rep: 1, text: "t" + i })); for (let i = 0; i < 4; i++) Meta.accept(0); return P.quests.length; })()`);
  assert.equal(o, 3);
});

test("задание «принести»: сдаётся только с материалом, забирает его, платит и даёт репутацию", () => {
  fresh();
  const o = run(`(() => {
    const q = { type: "bring", mat: "scrap", n: 3, reward: 50, rep: 2, text: "t", id: 1 }; P.quests = [q];
    const a = Meta.done(q); invAdd("scrap", 4); const b = Meta.done(q), m0 = P.money, r0 = P.rep; Meta.turnIn(0);
    return { a, b, paid: P.money - m0, rep: P.rep - r0, left: invCount("scrap"), quests: P.quests.length };
  })()`);
  assert.equal(o.a, false); assert.equal(o.b, true); assert.equal(o.paid, 50); assert.equal(o.rep, 2); assert.equal(o.left, 1); assert.equal(o.quests, 0);
});

test("задание «доставить артефакт»: подойдёт неопознанный, артефакт забирается", () => {
  fresh();
  const o = run(`(() => {
    const q = { type: "fetch", art: "soul", reward: 100, rep: 3, text: "t", id: 2 }; P.quests = [q];
    invAdd("art", 1, "medusa"); const wrong = Meta.done(q); invAdd("art", 1, "soul"); const ok = Meta.done(q); Meta.turnIn(0);
    return { wrong, ok, left: P.inv.filter(s => s.art).map(s => s.art) };
  })()`);
  assert.equal(o.wrong, false); assert.equal(o.ok, true); assert.deepEqual(o.left, ["medusa"]);
});

test("задание «истребить»: учитывает только нужный вид, прогресс не превышает n", () => {
  fresh();
  const o = run(`(() => {
    const q = { type: "hunt", sp: "tin", n: 2, prog: 0, reward: 10, rep: 1, text: "t", id: 3 }; P.quests = [q];
    Meta.onKill("listener"); Meta.onKill("tin"); const half = Meta.done(q); Meta.onKill("tin"); Meta.onKill("tin");
    return { half, prog: q.prog, done: Meta.done(q) };
  })()`);
  assert.equal(o.half, false); assert.equal(o.prog, 2); assert.equal(o.done, true);
});

test("задания: разведка, датчик, спасение, лаборатория и картограф выполняются по своим событиям", () => {
  fresh();
  const o = run(`(() => {
    const rec = { type: "recon", x: 3050, y: 3000, reached: false, reward: 1, rep: 1, text: "t", id: 4 };
    const sen = { type: "sensor", x: 3000, y: 3050, placed: false, reward: 1, rep: 1, text: "t", id: 5 };
    const hel = { type: "help", n: 1, prog: 0, reward: 1, rep: 1, text: "t", id: 6 };
    const lab = { type: "lab", n: 1, prog: 0, reward: 1, rep: 1, text: "t", id: 7 };
    const dis = { type: "discover", n: 2, prog: 0, reward: 1, rep: 1, text: "t", id: 8 };
    P.quests = [rec, sen, hel, lab, dis]; const before = P.quests.map(q => Meta.done(q));
    Meta.questUpdate(); Meta.onSensor(); Meta.onHelp(); Meta.onLab(); Meta.onDiscover(); Meta.onDiscover();
    return { before, after: P.quests.map(q => Meta.done(q)) };
  })()`);
  assert.deepEqual(o.before, [false, false, false, false, false]);
  assert.deepEqual(o.after, [true, true, true, true, true]);
});

test("цепочка «Сумерки»: три этапа, дневник появляется у второй точки, награда — артефакт", () => {
  fresh();
  const o = run(`(() => {
    const q = { type: "chain", stage: 0, x: 3010, y: 3000, bx: 3500, by: 3500, reward: 420, rep: 12, item: ["art", "mirage"], text: "t", id: 9 }; P.quests = [q];
    Meta.questUpdate(); const s1 = q.stage, diaryCorpse = W.corpses.some(c => c.items.some(i => i[0] === "diary"));
    invAdd("diary", 1); Meta.questUpdate(); const s2 = q.stage, ok = Meta.done(q); const m0 = P.money; Meta.turnIn(0);
    return { s1, diaryCorpse, s2, ok, paid: P.money - m0, art: P.inv.some(s => s.art === "mirage"), chainDone: P.chainDone, diaryLeft: invCount("diary") };
  })()`);
  assert.equal(o.s1, 1); assert.ok(o.diaryCorpse); assert.equal(o.s2, 2); assert.ok(o.ok);
  assert.equal(o.paid, 420); assert.ok(o.art); assert.equal(o.chainDone, true); assert.equal(o.diaryLeft, 0);
});

// ---------- экономика ----------
test("цена продажи: неопознанный артефакт дешевле в 3 раза, спрос и события двигают цену, торговля и репутация помогают", () => {
  fresh();
  const o = run(`(() => {
    invAdd("art", 1, "soul", 1); const s = P.inv[0], vk = "sci";   // качество фиксируем: иначе оно случайно
    const unk = sellPrice(s, vk); P.known.soul = true; const known = sellPrice(s, vk);
    G.demand.soul = 1.5; const hot = sellPrice(s, vk); G.demand.soul = 1;
    P.sk.trade = 5; const trader = sellPrice(s, vk); P.sk.trade = 0; P.rep = 50; const liked = sellPrice(s, vk); P.rep = 0;
    G.events = [{ k: "art", mul: 0.8, text: "" }]; const slump = sellPrice(s, vk); G.events = [];
    return { unk, known, hot, trader, liked, slump, none: sellPrice({ id: "scrap", n: 1 }, "sci") };
  })()`);
  assert.ok(o.known > o.unk * 2.5, "опознанный дороже"); assert.ok(o.hot > o.known); assert.ok(o.trader > o.known);
  assert.ok(o.liked > o.known); assert.ok(o.slump < o.known); assert.equal(o.none, 0, "учёный не берёт хлам");
});

test("цена покупки: скидка за навык торговли, за репутацию и за уровень снабжения; события повышают", () => {
  fresh();
  const o = run(`(() => {
    const base = buyPrice("medkit"); P.sk.trade = 5; const t = buyPrice("medkit"); P.sk.trade = 0;
    P.rep = 50; const r = buyPrice("medkit"); P.rep = 0; P.bld = Camp.DEFAULT_BLD(); P.bld.gear = 3; const g = buyPrice("medkit");
    P.bld.gear = 1; G.events = [{ k: "medkit", mul: 1.5, text: "" }]; const e = buyPrice("medkit"); G.events = [];
    return { base, t, r, g, e };
  })()`);
  assert.equal(o.base, CFG.items.medkit.buy); assert.ok(o.t < o.base); assert.ok(o.r < o.base); assert.ok(o.g < o.base); assert.ok(o.e > o.base);
});

test("торговля: продажа снижает спрос, «продать всё» забирает стек, покупка тратит деньги", () => {
  fresh();
  const o = run(`(() => {
    invAdd("scrap", 4); const u = { v: "buyer" }; const price = sellPrice(P.inv[0], "buyer"), m0 = P.money;
    Meta.click("sell", 0, 0, u); const one = { m: P.money - m0, left: invCount("scrap"), demand: G.demand.scrap };
    Meta.click("sellall", 0, 0, u); const all = { left: invCount("scrap") };
    const m1 = P.money; Meta.click("buy", "medkit", 0, { v: "gear" }); return { price, one, all, spent: m1 - P.money, kits: invCount("medkit"), buy: buyPrice("medkit") };
  })()`);
  assert.equal(o.one.m, o.price); assert.equal(o.one.left, 3); assert.ok(o.one.demand < 1); assert.equal(o.all.left, 0);
  assert.equal(o.spent, o.buy); assert.equal(o.kits, 1);
});

// ---------- лагерь: улучшения и крафт ----------
test("улучшения зданий: нужны деньги и материалы, повышают уровень, влияют на цены", () => {
  fresh();
  const o = run(`(() => {
    const u = CFG.buildings.gun.ups[0]; P.money = u.money - 1; for (const id in u.mat) invAdd(id, u.mat[id]);
    const no = Camp.canUp("gun"); P.money = u.money; const yes = Camp.canUp("gun"); const repair0 = Camp.repairMul("gun"); Camp.upgrade("gun");
    return { no, yes, lvl: Camp.lvl("gun"), repair0, repair1: Camp.repairMul("gun"), money: P.money, mats: Object.keys(u.mat).map(id => invCount(id)) };
  })()`);
  assert.equal(o.no, false); assert.equal(o.yes, true); assert.equal(o.lvl, 2); assert.ok(o.repair1 < o.repair0); assert.equal(o.money, 0); assert.ok(o.mats.every(n => n === 0));
});

test("улучшения зданий: максимум — 3 уровень; эффекты: койка, склад, скупка", () => {
  fresh();
  const o = run(`(() => {
    P.bld = Camp.DEFAULT_BLD(); const a = [Camp.sleepCost(), Camp.stashLimit(), Camp.sellMul("buyer")];
    P.bld.barracks = 3; P.bld.storage = 3; P.bld.buyer = 3; P.money = 1e6; P.bld.gun = 3; const canMore = Camp.canUp("gun");
    return { a, b: [Camp.sleepCost(), Camp.stashLimit(), Camp.sellMul("buyer")], canMore };
  })()`);
  assert.deepEqual(o.a, [15, 24, 1]); assert.deepEqual(o.b, [0, 9999, 1.16]); assert.equal(o.canMore, false);
});

test("снабжение: ассортимент открывается с уровнем", () => {
  fresh();
  const o = run(`(() => { P.bld = Camp.DEFAULT_BLD(); const a = Camp.stock("gear").slice(); P.bld.gear = 3; return { a, b: Camp.stock("gear") }; })()`);
  assert.ok(!o.a.includes("suit2") && !o.a.includes("firecoat") && o.a.includes("medkit"));
  assert.ok(o.b.includes("suit2") && o.b.includes("firecoat") && o.b.includes("detector2"));
});

test("верстак: рецепт требует уровень, материалы и навык; крафт расходует материалы и выдаёт результат", () => {
  fresh();
  const o = run(`(() => {
    P.bld = Camp.DEFAULT_BLD(); const r = CFG.recipes.find(x => x.id === "ammo"); for (const id in r.mat) invAdd(id, r.mat[id]);
    const lowLevel = Camp.canCraft(r); P.bld.gun = 2; const ok = Camp.canCraft(r); const a0 = invCount("ammo"); Camp.click("craft", "ammo"); const got = invCount("ammo") - a0, left = Object.keys(r.mat).map(id => invCount(id));
    const suit2 = CFG.recipes.find(x => x.id === "suit2"); P.bld.gun = 3; for (const id in suit2.mat) invAdd(id, suit2.mat[id]); const noSkill = Camp.canCraft(suit2); P.sk.carry = 2; const withSkill = Camp.canCraft(suit2);
    return { lowLevel, ok, got, left, noSkill, withSkill };
  })()`);
  assert.equal(o.lowLevel, false); assert.equal(o.ok, true); assert.equal(o.got, 12); assert.ok(o.left.every(n => n === 0));
  assert.equal(o.noSkill, false); assert.equal(o.withSkill, true);
});

test("верстак: переплавка трёх пустышек даёт артефакт из списка", () => {
  fresh();
  const o = run(`(() => {
    P.bld = Camp.DEFAULT_BLD(); P.bld.gun = 2; invAdd("art", 1, "dud"); invAdd("art", 1, "dud"); const not = Camp.canCraft(CFG.recipes.find(x => x.id === "remelt"));
    invAdd("art", 1, "dud"); Camp.click("craft", "remelt"); return { not, arts: P.inv.filter(s => s.art).map(s => s.art) };
  })()`);
  assert.equal(o.not, false); assert.equal(o.arts.length, 1); assert.ok(["medusa", "thorn", "soul", "stoneflower"].includes(o.arts[0]));
});

// ---------- оружие ----------
test("оружие: выстрел тратит патрон и износ, картечь бьёт несколькими дробинами", () => {
  fresh();
  const o = withRandom(0.5, () => run(`(() => {
    P.weapons = ["pistol", "sawnoff"]; P.weapon = "sawnoff"; P.cond.sawnoff = 100; P.cd = 0; invAdd("ammo", 5); keys.mx = 0; keys.my = 0; P.ang = 0;
    Mutants.list = []; Stalkers.list = []; const m = new Mutant("tin", 3060, 3000, null); m.state = "wander"; Mutants.list.push(m);
    shoot(); return { ammo: invCount("ammo"), cond: P.cond.sawnoff, hp: m.hp, tinHp: CFG.mut.tin.hp, cd: P.cd };
  })()`));
  assert.equal(o.ammo, 4); assert.ok(Math.abs(o.cond - (100 - CFG.weapons.sawnoff.wear)) < 1e-9); assert.ok(o.hp < o.tinHp, "картечь должна попасть"); assert.equal(o.cd, CFG.weapons.sawnoff.cd);
});

test("оружие: без патронов выстрела нет; изношенное (<25%) даёт осечки", () => {
  fresh();
  const dry = run(`(() => { P.weapon = "pistol"; P.cd = 0; P.inv = []; shoot(); return { ammo: invCount("ammo"), cd: P.cd }; })()`);
  assert.equal(dry.ammo, 0); assert.equal(dry.cd, 0.3);
  const o = withRandom(0, () => run(`(() => { P.cd = 0; invAdd("ammo", 3); P.cond.pistol = 5; shoot(); return { ammo: invCount("ammo"), cd: P.cd }; })()`));
  assert.equal(o.ammo, 3, "при осечке патрон не тратится"); assert.equal(o.cd, 0.6);
});

test("оружие: покупка, смена, ремонт стоит денег и зависит от навыка и уровня мастерской", () => {
  fresh();
  const o = run(`(() => {
    P.bld = Camp.DEFAULT_BLD(); P.bld.gun = 2; P.money = 2000; Meta.click("wbuy", "revolver", 0, { v: "gun" });
    const bought = { w: P.weapon, has: P.weapons.includes("revolver"), money: P.money };
    P.cond.revolver = 50; const cost = Meta.repairCost("revolver"); P.sk.repair = 5; const cheap = Meta.repairCost("revolver"); P.sk.repair = 0;
    const m0 = P.money; Meta.click("wrepair", "revolver", 0, { v: "gun" }); return { bought, cost, cheap, paid: m0 - P.money, cond: P.cond.revolver };
  })()`);
  assert.equal(o.bought.w, "revolver"); assert.ok(o.bought.has); assert.equal(o.bought.money, 2000 - CFG.weapons.revolver.price);
  assert.ok(o.cheap < o.cost); assert.equal(o.paid, o.cost); assert.equal(o.cond, 100);
});

test("предметы: аптечка лечит и останавливает кровотечение, шина лечит перелом, антибиотик — заражение; лишнее не тратится", () => {
  fresh();
  const o = run(`(() => {
    P.hp = 30; P.bleed = 5; invAdd("medkit", 1); useItem("medkit"); const a = { hp: P.hp, bleed: P.bleed, left: invCount("medkit") };
    invAdd("splint", 1); useItem("splint"); const noFracture = invCount("splint"); P.fracture = true; useItem("splint"); const b = { fracture: P.fracture, left: invCount("splint") };
    invAdd("antibiotic", 1); useItem("antibiotic"); const noInfect = invCount("antibiotic"); P.infect = 50; useItem("antibiotic");
    return { a, noFracture, b, noInfect, infect: P.infect, ab: invCount("antibiotic") };
  })()`);
  assert.equal(o.a.hp, 30 + CFG.items.medkit.use.heal); assert.equal(o.a.bleed, 0); assert.equal(o.a.left, 0);
  assert.equal(o.noFracture, 1, "шина без перелома не тратится"); assert.equal(o.b.fracture, false); assert.equal(o.b.left, 0);
  assert.equal(o.noInfect, 1); assert.equal(o.infect, 0); assert.equal(o.ab, 0);
});

test("костюм: снижает радиацию и урон аномалий, износ ослабляет эффект", () => {
  fresh();
  const o = run(`(() => {
    P.inv = []; const none = Meta.suitRad(); P.inv.push({ id: "suit", n: 1 }); P.suitCond = 100; const fresh = Meta.suitRad(); P.suitCond = 0; const worn = Meta.suitRad(); P.suitCond = 100;
    P.inv.push({ id: "suit2", n: 1 }); const best = Meta.bestSuit().id; const anom = Meta.suitAnom(); P.hp = 100; P.hurt(10, "anom");
    return { none, fresh, worn, best, anom, hp: P.hp, wear: P.suitCond };
  })()`);
  assert.equal(o.none, 0); assert.ok(o.fresh > o.worn && o.worn > 0); assert.equal(o.best, "suit2"); assert.ok(o.hp > 90 && o.hp < 100); assert.ok(o.wear < 100);
});

// ---------- сталкеры ----------
test("сталкеры: выстрел в мирного — он враждебен, репутация −5; убийство своего −15, бандита +2 и добыча", () => {
  fresh();
  const o = run(`(() => {
    Stalkers.list = []; const loner = new Stalker("loner", 3100, 3000); loner.hurt(1, P); const a = { hostile: loner.hostile, rep: P.rep };
    P.rep = 0; const bandit = new Stalker("bandit", 3100, 3100); W.corpses = []; bandit.die(P); const bc = W.corpses[0];
    const b = { rep: P.rep, kills: P.kills, money: bc.items.some(i => i[0] === "money"), ammo: bc.items.some(i => i[0] === "ammo") };
    P.rep = 0; const l2 = new Stalker("loner", 3200, 3000); l2.die(P); return { a, b, killRep: P.rep, cruelty: P.karma.cruelty };
  })()`);
  assert.equal(o.a.hostile, true); assert.equal(o.a.rep, -5); assert.equal(o.b.rep, 2); assert.equal(o.b.kills, 1); assert.ok(o.b.money && o.b.ammo);
  assert.equal(o.killRep, -15); assert.ok(o.cruelty >= 2);
});

test("сталкеры: раненый — помощь аптечкой даёт награду и делает его мирным, добить — карма жестокости", () => {
  fresh();
  const o = run(`(() => {
    Stalkers.list = []; const s = new Stalker("wounded", 3050, 3000); const u = { k: "npc", s, msg: "" }; invAdd("medkit", 1); const m0 = P.money, r0 = P.rep;
    P.quests = [{ type: "help", n: 1, prog: 0, reward: 1, rep: 1, text: "t", id: 1 }]; Meta.click("nheal", 0, 0, u);
    return { state: s.state, kind: s.kind, money: P.money - m0, rep: P.rep - r0, mercy: P.karma.mercy, kit: invCount("medkit"), help: P.quests[0].prog };
  })()`);
  assert.equal(o.state, "wander"); assert.equal(o.kind, "loner"); assert.equal(o.money, 40); assert.equal(o.rep, 8); assert.ok(o.mercy >= 2); assert.equal(o.kit, 0, "аптечка отдана"); assert.equal(o.help, 1);
});

test("оцепление: в закрытом секторе без репутации и пропуска появляется, с пропуском — нет", () => {
  fresh();
  const o = run(`(() => {
    const sp = W.spot(2000); let p = null; for (let i = 0; i < 400 && !p; i++) { const q = W.spot(500, Math.random); if (W.danger(q.x, q.y) === 4) p = q; }
    P.x = p.x; P.y = p.y; Stalkers.list = []; P.rep = 0; P.pass = false; Meta.gateCool = 0; G.t = 10; Meta.update(0.016); const a = Stalkers.list.filter(s => s.kind === "patrol").length;
    Stalkers.list = []; P.pass = true; Meta.gateCool = 0; Meta.update(0.016); const b = Stalkers.list.length;
    P.pass = false; P.rep = CFG.gate.rep; Meta.gateCool = 0; Meta.update(0.016); const c = Stalkers.list.length; return { a, b, c };
  })()`);
  assert.equal(o.a, 3); assert.equal(o.b, 0); assert.equal(o.c, 0);
});

// ---------- выброс ----------
test("выброс: сирена → волна → конец; вне укрытия бьёт, в лагере — нет; после — Зона тасуется", () => {
  fresh();
  const o = run(`(() => {
    G.emi = { s: "calm", left: 0, next: 0.01 }; updateEmission(0.02); const warn = G.emi.s;
    G.emi.left = 0.01; updateEmission(0.02); const blast = G.emi.s;
    P.hp = 100; P.x = 3000; P.y = 3000; const out = isSheltered(); updateEmission(1); const hurt = 100 - P.hp;
    P.x = W.C.x; P.y = W.C.y; P.hp = 100; updateEmission(1); const sheltered = 100 - P.hp;
    const a0 = W.anoms.length; G.emi.left = 0.01; updateEmission(0.02);
    return { warn, blast, out, hurt, sheltered, end: G.emi.s, anoms: W.anoms.length === a0, next: G.emi.next > 0 };
  })()`);
  assert.equal(o.warn, "warn"); assert.equal(o.blast, "blast"); assert.equal(o.out, false); assert.ok(o.hurt > 10);
  assert.equal(o.sheltered, 0); assert.equal(o.end, "calm"); assert.ok(o.anoms && o.next);
});

// ---------- смерть и страховка ----------
test("смерть: артефакты и 40% денег остаются в тайнике на месте смерти, навыки и опыт — при игроке", () => {
  fresh();
  const o = run(`(() => {
    P.money = 1000; P.xp = 5; P.lvl = 3; P.rep = 0; invAdd("art", 1, "soul"); invAdd("scrap", 3); P.equip = [{ art: "medusa", q: 1 }, null]; P.x = 3300; P.y = 3300; P.insured = false;
    W.caches = []; die(); const c = W.caches[0];
    return { dead: G.dead, money: P.money, cache: { money: c.money, arts: c.items.map(i => i.art).sort(), x: c.x }, scrap: invCount("scrap"), artsLeft: P.inv.filter(s => s.art).length, lvl: P.lvl, rep: P.rep, equip: P.equip };
  })()`);
  assert.equal(o.dead, true); assert.equal(o.money, 600); assert.equal(o.cache.money, 400); assert.deepEqual(o.cache.arts, ["medusa", "soul"]);
  assert.equal(o.scrap, 3); assert.equal(o.artsLeft, 0); assert.equal(o.lvl, 3); assert.equal(o.rep, -2); assert.deepEqual(o.equip, [null, null]);
});

test("смерть: страховка срабатывает один раз, хабар остаётся, репутация −1", () => {
  fresh();
  const o = run(`(() => {
    invAdd("art", 1, "soul"); P.insured = true; P.money = 500; P.rep = 0; W.caches = []; die(); const first = { money: P.money, arts: P.inv.filter(s => s.art).length, ins: P.insured, rep: P.rep, caches: W.caches.length };
    G.dead = false; P.dead = false; die(); return { first, secondMoney: P.money, caches: W.caches.length };
  })()`);
  assert.deepEqual(o.first, { money: 500, arts: 1, ins: false, rep: -1, caches: 0 });
  assert.equal(o.secondMoney, 300); assert.equal(o.caches, 1);
});

test("тайник смерти: игрок забирает своё обратно", () => {
  fresh();
  const o = run(`(() => {
    W.caches = [{ x: 3000, y: 3000, items: [{ id: "art", n: 1, art: "soul" }], money: 200 }]; P.money = 0; P.inv = []; const near = findNear(); near.fn();
    return { label: near.label, money: P.money, art: P.inv.some(s => s.art === "soul"), caches: W.caches.length };
  })()`);
  assert.equal(o.label, "Забрать своё"); assert.equal(o.money, 200); assert.ok(o.art); assert.equal(o.caches, 0);
});

// ---------- взаимодействие ----------
test("контейнеры и туши: обыск даёт добычу и не повторяется, разделка даёт мясо и трофеи", () => {
  fresh();
  const o = run(`(() => {
    W.conts = [{ x: 3000, y: 3000, kind: "stash", opened: false, loot: [["scrap", 3], ["money", 25]] }]; W.corpses = []; W.arts = []; W.loot = []; Mutants.corpses = [];
    P.money = 0; const near = findNear(); near.fn(); const a = { money: P.money, scrap: invCount("scrap"), opened: W.conts[0].opened };
    const again = findNear();
    Mutants.corpses.push({ x: 3000, y: 3000, sp: "tin", meat: 3, age: 0 }); P.sk.butcher = 5; const b = findNear(); b.fn();
    return { a, again: again && again.label, meat: invCount("meat"), left: Mutants.corpses.length, label: b.label };
  })()`);
  assert.deepEqual(o.a, { money: 25, scrap: 3, opened: true });
  assert.ok(!o.again || !/тайник/i.test(o.again), "открытый тайник больше не предлагается");
  assert.ok(o.meat >= 1); assert.equal(o.left, 0); assert.match(o.label, /Разделать тушу/);
});

// ---------- сохранение ----------
test("сохранение: деньги, инвентарь, репутация, задания и износ переживают перезагрузку", () => {
  fresh();
  const o = run(`(() => {
    P.money = 777; P.rep = 12; invAdd("scrap", 7); invAdd("art", 1, "soul"); P.known.soul = true; P.cond.pistol = 42; P.weapons.push("revolver"); P.fuel = 9;
    P.quests = [{ type: "bring", mat: "scrap", n: 2, reward: 5, rep: 1, text: "t", id: 1 }]; Camp.enter(true); P.bld.gun = 2; save();
    const seed = W.seed; W = null; const ok = load();
    return { ok, seed: W.seed === seed, money: P.money, rep: P.rep, scrap: invCount("scrap"), art: P.inv.some(s => s.art === "soul"), known: !!P.known.soul, cond: P.cond.pistol, gun: P.weapons.includes("revolver"), lvl: Camp.lvl("gun"), quests: P.quests.length, fuel: P.fuel };
  })()`);
  assert.equal(o.ok, true); assert.ok(o.seed); assert.equal(o.money, 777); assert.equal(o.rep, 12); assert.equal(o.scrap, 7); assert.ok(o.art && o.known);
  assert.equal(o.cond, 42); assert.ok(o.gun); assert.equal(o.lvl, 2); assert.equal(o.quests, 1); assert.equal(o.fuel, 9);
});

test("сохранение: вскрытое, обысканное и подобранное не появляется заново после загрузки", () => {
  fresh();
  const o = run(`(() => {
    const cont = W.conts.findIndex(c => c.kind === "stash"); W.conts[cont].opened = true;
    W.corpses[0].looted = true; const artId = W.arts[0].id; W.arts.splice(0, 1);
    const totalOpened = W.conts.filter(c => c.opened).length; Camp.enter(true); save(); W = null; load();
    return { cont: W.conts[cont].opened, opened: W.conts.filter(c => c.opened).length === totalOpened, corpse: W.corpses[0].looted, art: W.arts.some(a => a.id === artId), others: W.corpses.slice(1, 5).every(c => !c.looted) };
  })()`);
  assert.ok(o.cont && o.opened); assert.ok(o.corpse); assert.equal(o.art, false); assert.ok(o.others);
});

test("автосейв в поле: помечается field, при загрузке — лагерь, −10% денег и ранение; в лагере пометки нет", () => {
  fresh();
  const o = run(`(() => {
    P.money = 1000; invAdd("art", 1, "soul"); P.hp = 100; Camp.enter(true); G.scene = "zone"; P.x = 3000; P.y = 3000; save();
    const noSave = localStorage.getItem("zone_save_v2") === null; save(true); const field = JSON.parse(localStorage.getItem("zone_save_v2")).field;
    W = null; load();
    return { noSave, field, money: P.money, hp: P.hp, art: P.inv.some(s => s.art === "soul"), scene: G.scene };
  })()`);
  assert.equal(o.noSave, true, "вне лагеря без force сохранять нельзя"); assert.equal(o.field, true);
  assert.equal(o.money, 900); assert.ok(o.hp <= CFG.death.hpOnRespawn); assert.ok(o.art, "снаряжение сохранилось"); assert.equal(o.scene, "camp");
});

test("смерть сохраняется сразу: перезагрузка до респауна не возвращает утраченный хабар", () => {
  fresh();
  const o = run(`(() => {
    P.money = 1000; invAdd("art", 1, "soul"); P.insured = false; W.caches = []; G.scene = "zone"; P.x = 3300; P.y = 3300; die();
    const s = JSON.parse(localStorage.getItem("zone_save_v2")); const field = s.field; W = null; load();
    return { field, money: P.money, art: P.inv.some(x => x.art), caches: W.caches.length };
  })()`);
  assert.equal(o.field, false); assert.equal(o.money, 600); assert.equal(o.art, false); assert.equal(o.caches, 1);
});

test("загрузка: пустой или битый JSON не ломает игру", () => {
  fresh();
  const o = run(`(() => { localStorage.removeItem("zone_save_v2"); const a = load(); localStorage.setItem("zone_save_v2", "{oops"); const b = load(); return { a, b }; })()`);
  assert.equal(o.a, false); assert.equal(o.b, false);
});

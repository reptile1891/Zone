"use strict";
// v0.15: артефакты (случайна только сила эффектов) и костюмы (случайные характеристики) — как оружие в v0.14.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createZone } = require("./zone-load");

const z = createZone();
const run = code => JSON.parse(JSON.stringify(z.run(code) ?? null));
const fresh = () => z.run(`(() => {
  W = new World(1234); resetPlayer(); P.stash = []; P.bld = null; Mutants.spawn(); Stalkers.spawn(); Meta.reset(); Camp.enter(true);
  G.events = []; G.dead = false; G.started = true; G.ui = null; G.scene = "zone"; G.emi = { s: "calm", left: 0, next: 99999 }; G.t = 5; VW = 800; VH = 600;
  P.x = 3000; P.y = 3000; P.hp = 100; P.inv = []; P.equip = [null, null]; P.known = {}; P.gunOffers = []; Mutants.list = []; Stalkers.list = []; localStorage.removeItem("zone_save_v2");
})()`);

test("качество артефакта: в пределах 0.70–1.35, в среднем ≈1, глубже — сильнее", () => {
  fresh();
  const o = run(`(() => {
    const st = luck => { let mn = 9, mx = 0, s = 0, n = 20000; for (let i = 0; i < n; i++) { const q = Gear.rollQ(Math.random, luck); mn = Math.min(mn, q); mx = Math.max(mx, q); s += q; } return { mn, mx, avg: s / n }; };
    const g = {}; for (let i = 0; i < 20000; i++) { const n = Gear.grade(Gear.rollQ()).n; g[n] = (g[n] || 0) + 1; }
    return { l0: st(0), l3: st(3), g };
  })()`);
  assert.ok(o.l0.mn >= 0.7 && o.l0.mx <= 1.35); assert.ok(o.l3.mn >= 0.7 && o.l3.mx <= 1.35);
  assert.ok(Math.abs(o.l0.avg - 1) < 0.01, "среднее ≈ 1: " + o.l0.avg); assert.ok(o.l3.avg > o.l0.avg + 0.07);
  assert.ok(o.g["Обычный"] > 10000 && o.g["Слабый"] > 2000 && o.g["Сильный"] > 2000 && o.g["Превосходный"] > 100 && o.g["Превосходный"] < 1000, JSON.stringify(o.g));
});

test("набор свойств артефакта не меняется, меняется только сила; «флаги» не масштабируются", () => {
  fresh();
  const o = run(`(() => {
    const r = {}; for (const id in CFG.arts) { const a = Gear.fxOf(id, 0.7), b = Gear.fxOf(id, 1.35), base = CFG.arts[id].fx; r[id] = { same: JSON.stringify(Object.keys(a)) === JSON.stringify(Object.keys(base)) && JSON.stringify(Object.keys(b)) === JSON.stringify(Object.keys(base)),
      ok: Object.keys(base).every(k => Gear.FLAGS.includes(k) ? a[k] === base[k] && b[k] === base[k] : Math.abs(a[k] - base[k] * 0.7) < 0.001 && Math.abs(b[k] - base[k] * 1.35) < 0.001) }; }
    return { r, one: Gear.fxOf("soul", 1).hpRegen, echo: Gear.fxOf("echo", 1.3), rad: [Gear.radOf("nightstar", 0.7), Gear.radOf("nightstar", 1), Gear.radOf("nightstar", 1.35)] };
  })()`);
  for (const id in o.r) { assert.ok(o.r[id].same, id + ": набор свойств"); assert.ok(o.r[id].ok, id + ": масштаб"); }
  assert.equal(o.one, 1.2); assert.equal(o.echo.repel, 1); assert.ok(Math.abs(o.echo.hpRegen - 1.3) < 1e-9);
  assert.ok(o.rad[0] < o.rad[1] && o.rad[1] < o.rad[2] && o.rad[2] < 0.5 * 1.2, "фон растёт с качеством, но слабее самих эффектов");
});

test("экземпляр хранит качество: рюкзак → контейнер → рюкзак; эффекты берутся по качеству", () => {
  fresh();
  const o = run(`(() => {
    invAdd("art", 1, "soul", 1.3); P.known.soul = true; const q0 = P.inv[0].q;
    panelClick("equip:" + 0); const inEq = P.equip[0], eff = fx("hpRegen"), w = weight();
    panelClick("unequip:" + 0); const back = P.inv[0], none = fx("hpRegen");
    invAdd("art", 1, "soul"); const rolled = P.inv[1].q;
    return { q0, inEq, eff, back, none, rolled, ok: typeof w === "number" };
  })()`);
  assert.equal(o.q0, 1.3); assert.deepEqual(o.inEq, { art: "soul", q: 1.3 }); assert.ok(Math.abs(o.eff - 1.2 * 1.3) < 1e-9); assert.equal(o.back.q, 1.3); assert.equal(o.none, 0);
  assert.ok(o.rolled >= 0.7 && o.rolled <= 1.35 && o.ok);
});

test("качество сохраняется: сохранение/загрузка, старые сохранения со строками в контейнерах, смерть и возврат хабара, бросок и подбор", () => {
  fresh();
  const o = run(`(() => {
    invAdd("art", 1, "thorn", 1.22); invAdd("art", 1, "soul", 0.8); P.known.thorn = P.known.soul = true; panelClick("equip:" + 0);
    save(true); const raw = JSON.parse(localStorage.getItem("zone_save_v2")).P; const okSave = raw.equip[0].q === 1.22 && raw.inv[0].q === 0.8;
    // старый формат: контейнер — строка
    const s = JSON.parse(localStorage.getItem("zone_save_v2")); s.P.equip = ["medusa", null]; s.P.inv = [{ id: "art", n: 1, art: "soul" }]; localStorage.setItem("zone_save_v2", JSON.stringify(s));
    load(); const old = { eq: P.equip, sold: P.inv[0], fx: fx("radRes"), w: weight() };
    // смерть
    P.equip = [{ art: "thorn", q: 1.22 }, null]; P.inv = [{ id: "art", n: 1, art: "soul", q: 0.8 }]; P.money = 100; P.insured = false; P.x = 3300; P.y = 3300; G.scene = "zone"; die();
    const cache = W.caches[W.caches.length - 1], cq = cache.items.map(i => i.art + ":" + i.q).sort(); G.dead = false; P.dead = false; P.x = cache.x; P.y = cache.y; lootCache(cache);
    const back = P.inv.map(s => s.art + ":" + s.q).sort();
    // бросок и подбор
    P.inv = [{ id: "art", n: 1, art: "soul", q: 1.31 }]; W.arts = []; G.ui = { k: "inv" }; panelClick("drop:" + 0); const dropped = W.arts[0]; const a = W.arts[0]; takeArt(a);
    return { okSave, old, cq, back, dropped: dropped.q, taken: P.inv[0] };
  })()`);
  assert.ok(o.okSave); assert.deepEqual(o.old.eq, [{ art: "medusa", q: 1 }, null]); assert.ok(Math.abs(o.old.fx - 0.12) < 1e-9);
  assert.deepEqual(o.cq, ["soul:0.8", "thorn:1.22"]); assert.deepEqual(o.back, ["soul:0.8", "thorn:1.22"]); assert.equal(o.dropped, 1.31); assert.equal(o.taken.q, 1.31);
});

test("цена и подсказка артефакта: опознанный дороже при высоком качестве, у неопознанного качество скрыто", () => {
  fresh();
  const o = run(`(() => {
    const lo = { id: "art", n: 1, art: "thorn", q: 0.75 }, hi = { id: "art", n: 1, art: "thorn", q: 1.3 };
    P.known.thorn = true; const pl = sellPrice(lo, "buyer"), ph = sellPrice(hi, "buyer"), base = CFG.arts.thorn.val;
    const tipHi = Tip.slot(hi, "buyer"), tipLo = Tip.slot(lo);
    P.known.thorn = false; const uh = sellPrice(hi, "buyer"), ul = sellPrice(lo, "buyer"), tipU = Tip.slot(hi);
    return { pl, ph, base, tipHi, tipLo, uh, ul, tipU };
  })()`);
  assert.ok(o.ph > o.pl * 1.5, "цена растёт с качеством: " + o.pl + " → " + o.ph); assert.match(o.tipHi, /Превосходный/); assert.match(o.tipHi, /×1\.30/); assert.match(o.tipLo, /Слабый/);
  assert.match(o.tipHi, /Сопротивление радиации \+39%/); assert.match(o.tipLo, /Сопротивление радиации \+23%/);
  assert.equal(o.uh, o.ul, "у неопознанного качество не влияет на цену"); assert.doesNotMatch(o.tipU, /Качество|Превосходный/);
});

test("надпись в рюкзаке: у опознанного артефакта видно класс качества, у неопознанного — нет", () => {
  fresh();
  const o = run(`(() => {
    invAdd("art", 1, "soul", 1.3); const u = Meta.itemLabel(P.inv[0]); P.known.soul = true; const k = Meta.itemLabel(P.inv[0]);
    invAdd("suit", 1); P.inv[1].g = Gear.roll("suit", Math.random, { rar: 2 }); const s = Meta.itemLabel(P.inv[1]);
    G.ui = { k: "inv" }; renderPanel(); return { u, k, s, html: document.getElementById("panel").innerHTML.includes("Превосходный") };
  })()`);
  assert.doesNotMatch(o.u, /Превосходный/); assert.match(o.k, /Превосходный/); assert.match(o.s, /Плащ сталкера «/);
});

test("костюм: редкости, границы множителей, плюсы платятся минусами", () => {
  fresh();
  const o = run(`(() => {
    const n = 4000, res = {}, ids = ["suit", "suit2", "firecoat"];
    for (const id of ids) { const c = [0, 0, 0, 0], bad = [0, 0, 0, 0], good = [0, 0, 0, 0], names = new Set(); let out = 0, pw = [0, 0, 0, 0];
      for (let i = 0; i < n; i++) { const g = Gear.roll(id, Math.random, { rar: i % 4 }); c[g.rar]++; let gd = 0, bd = 0;
        for (const k in g.m) { const s = Gear.STATS[k]; if (g.m[k] < s.lim[0] - 1e-9 || g.m[k] > s.lim[1] + 1e-9) out++; if (!(k in Gear.BASE[id]) && k !== "w" && k !== "wear") out++; const gg = Gear.goodness(k, g.m[k]); if (gg > 0.001) gd++; else if (gg < -0.001) bd++; }
        good[g.rar] += gd; bad[g.rar] += bd; pw[g.rar] += Gear.power(g); names.add(g.name); }
      res[id] = { out, good: good.map(x => x / (n / 4)), bad: bad.map(x => x / (n / 4)), pw: pw.map(x => x / (n / 4)), names: names.size }; }
    return res;
  })()`);
  for (const id of ["suit", "suit2", "firecoat"]) {
    const r = o[id]; assert.equal(r.out, 0, id + ": границы");
    assert.ok(r.good[3] > 2.99 && r.good[3] < 3.01 && r.bad[3] === 0, id + ": Уникальный — три плюса без минусов");
    assert.ok(r.good[2] > 1.99 && r.good[2] < 2.01 && r.bad[2] > 0.99, id + ": Редкий — два плюса и минус");
    assert.ok(r.good[1] > 0.99 && r.bad[1] > 0.99, id + ": Хороший — плюс и минус");
    assert.ok(r.pw[0] < r.pw[1] && r.pw[1] < r.pw[2] && r.pw[2] < r.pw[3], id + ": сила растёт с редкостью " + r.pw);
    assert.ok(r.pw[0] > 0.97 && r.pw[0] < 1.03, id + ": обычный ≈ базовый");
  }
});

test("костюм: экземпляры не склеиваются, вес/износ/защита берутся у экземпляра, лучший из рюкзака работает, сильный не уходит в верстак", () => {
  fresh();
  const o = run(`(() => {
    invAdd("suit", 1); invAdd("suit", 1); const slots = P.inv.filter(s => s.id === "suit").length;
    P.inv = [{ id: "suit", n: 1, g: { rar: 2, m: { rad: 1.2, w: 0.8, wear: 0.6 }, name: "A" } }, { id: "suit", n: 1, g: { rar: 0, m: { rad: 0.9 }, name: "B" } }];
    const best = Meta.bestSuit().g.name; P.suitCond = 100; const rad = Meta.suitRad(), w = weight(), sw = slotW(P.inv[0]);
    P.suitCond = 100; Meta.wearSuit(100); const wearA = 100 - P.suitCond;
    P.inv = [{ id: "suit", n: 1 }]; P.suitCond = 100; Meta.wearSuit(100); const wearPlain = 100 - P.suitCond;
    P.inv = [{ id: "suit", n: 1, g: { rar: 2, m: { rad: 1.3 }, name: "Сильный" } }, { id: "suit", n: 1, g: { rar: 0, m: {}, name: "Слабый" } }, { id: "suit", n: 1, g: { rar: 1, m: { rad: 1.1 }, name: "Средний" } }];
    invTake("suit", 1); const left = P.inv.map(s => s.g.name).sort();
    return { slots, best, rad, w, sw, wearA, wearPlain, left, none: (P.inv = [], Meta.suitRad()) };
  })()`);
  assert.equal(o.slots, 2); assert.equal(o.best, "A"); assert.ok(Math.abs(o.rad - 0.25 * 1.2) < 1e-9); assert.ok(Math.abs(o.sw - 2.4) < 1e-9 && Math.abs(o.w - 2.4 - 3) < 1e-9);
  assert.ok(Math.abs(o.wearA / o.wearPlain - 0.6) < 1e-9); assert.deepEqual(o.left, ["Сильный", "Средний"]); assert.equal(o.none, 0);
});

test("плащ от огня: экземпляр даёт свою огнестойкость, лучший из имеющихся", () => {
  fresh();
  const o = run(`(() => {
    P.inv = [{ id: "firecoat", n: 1, g: { rar: 1, m: { fire: 1.2 }, name: "Х" } }, { id: "firecoat", n: 1, g: { rar: 0, m: { fire: 0.85 }, name: "Y" } }]; const a = Meta.fireRes();
    P.inv = [{ id: "firecoat", n: 1 }]; const b = Meta.fireRes(); P.inv = []; const c = Meta.fireRes();
    return { a, b, c };
  })()`);
  assert.ok(Math.abs(o.a - 0.72) < 1e-9); assert.ok(Math.abs(o.b - 0.6) < 1e-9); assert.equal(o.c, 0);
});

test("костюм: покупка и верстак дают случайные экземпляры (без Уникальных), склад и бросок сохраняют характеристики", () => {
  fresh();
  const o = run(`(() => {
    P.money = 1e6; const rars = [0, 0, 0, 0]; for (let i = 0; i < 400; i++) { P.inv = []; panelClick("buy:" + "suit"); rars[P.inv[0].g.rar]++; }
    const tip = Tip.fromAttr("buy:suit");
    P.inv = [{ id: "suit", n: 1, g: { rar: 2, m: { rad: 1.25, w: 0.8 }, name: "Плащ сталкера «Свинцовый»" } }]; P.stash = [{ id: "suit", n: 1, g: { rar: 0, m: {}, name: "Плащ сталкера" } }];
    panelClick("stash:" + 0); const st = P.stash.map(s => s.g.name); panelClick("unstash:" + 1); const back = P.inv.map(s => s.g.name);
    G.ui = { k: "inv" }; panelClick("drop:" + 0); const l = W.loot[W.loot.length - 1];
    P.x = l.x - 20; P.y = l.y; W.loot.splice(0, W.loot.length - 1); const pick = W.loot[0]; P.inv = []; P.inv.push({ id: pick.id, n: 1, g: pick.g });
    return { rars, tip, st, back, lootG: !!l.g, pick: P.inv[0].g.name };
  })()`);
  assert.ok(o.rars[0] > 200 && o.rars[1] > 40 && o.rars[3] === 0 && o.rars.reduce((a, b) => a + b) === 400, JSON.stringify(o.rars)); assert.match(o.tip, /Каждый экземпляр/);
  assert.deepEqual(o.st.sort(), ["Плащ сталкера", "Плащ сталкера «Свинцовый»"]); assert.ok(o.back.length === 1 && /Плащ сталкера/.test(o.back[0])); assert.ok(o.lootG); assert.equal(o.pick, "Плащ сталкера «Свинцовый»");
});

test("подсказка костюма: характеристики со сравнением с базовым, без сравнения у обычного", () => {
  fresh();
  const o = run(`(() => {
    const s = { id: "suit", n: 1, g: { rar: 2, m: { rad: 1.2, anom: 0.8, w: 0.8, wear: 1.2 }, name: "Плащ сталкера «Свинцовый»" } }, p = { id: "suit", n: 1 };
    return { s: Tip.slot(s), p: Tip.slot(p), coat: Tip.slot({ id: "firecoat", n: 1, g: { rar: 1, m: { fire: 1.1 }, name: "Огнеупорный плащ «Жаростойкий»" } }) };
  })()`);
  assert.match(o.s, /Редкий/); assert.match(o.s, /Радиация:[^]*−30%[^]*\(\+20%\)/); assert.match(o.s, /Аномалии:[^]*−8%[^]*\(−20%\)/); assert.match(o.s, /Вес:[^]*2\.4 кг[^]*\(−20%\)/); assert.match(o.s, /быстрее/);
  assert.doesNotMatch(o.p, /\(\+|\(−/); assert.match(o.p, /Радиация:[^]*−25%/); assert.match(o.coat, /Огонь:[^]*−66%/);
});

test("сейф бункера иногда даёт костюм не хуже Хорошего; выдача кладёт готовый экземпляр", () => {
  fresh();
  const o = run(`(() => {
    let n = 0, low = 0, ids = new Set(); for (let i = 0; i < 300; i++) { const g = Gear.loot(Math.random, 1 + (i % 4)); n++; if (g.g.rar < 1) low++; ids.add(g.id); }
    const s = Gear.loot(Math.random, 4); P.inv = []; const txt = Dungeon.give([["gear", s]]);
    let has = 0; const b = W.bunkers[0]; Dungeon.enter(b); for (let k = 0; k < 40; k++) { b.gen = k; Dungeon.lvl.seed = 1000 + k; if (Dungeon.vaultLoot(b).some(l => l[0] === "gear")) has++; } Dungeon.leave();
    return { low, ids: [...ids].sort(), txt, id4: s.id, inv: P.inv.length, has };
  })()`);
  assert.equal(o.low, 0); assert.ok(o.ids.every(id => ["suit", "suit2", "helmet", "helmet2", "boots", "pack", "pack2"].includes(id))); assert.ok(o.ids.includes("suit") && o.ids.includes("boots")); assert.equal(o.inv, 1); assert.ok(o.txt.length > 3); assert.ok(o.has > 0 && o.has < 40, "в сейфах бывает, но не всегда: " + o.has);
});

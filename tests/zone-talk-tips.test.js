"use strict";
// «Обочина» v0.9.2: подсказки предметов при наведении и разговоры с жителями лагеря.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createZone } = require("./zone-load");

const z = createZone();
const CFG = z.get("CFG");
const run = code => JSON.parse(JSON.stringify(z.run(code) ?? null));
const fresh = (seed = 1234) => z.run(`(() => {
  W = new World(${seed}); resetPlayer(); P.stash = []; P.bld = null; Mutants.spawn(); Stalkers.spawn(); Meta.reset(); Camp.enter(true); Camp.build();
  G.events = []; G.dead = false; G.emi = { s: "calm", left: 0, next: 99999 }; P.hp = 100; P.money = 1000; P.inv = []; P.quests = []; P.offers = []; P.rep = 0; P.known = {}; P.talked = {}; P.lore = 0;
  G.ui = null; localStorage.removeItem("zone_save_v2");
})()`);
// Нейтральный текст без тегов для проверок
const plain = html => String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

// ---------- подсказки ----------
test("подсказка предмета: название, вид, описание, эффекты, вес и ценность; для стека — общий вес", () => {
  fresh();
  const o = run(`(() => ({ medkit: Tip.item("medkit"), stack: Tip.item("scrap", null, null, 4), trophy: Tip.item("fang"), splint: Tip.item("splint"), none: Tip.item("nope") }))()`);
  const t = plain(o.medkit);
  assert.match(t, /Аптечка/); assert.match(t, /расходник/); assert.match(t, /Лечит \+45 HP/); assert.match(t, /Останавливает кровотечение/); assert.match(t, /Вес: 0\.3 кг/); assert.match(t, /Ценность: 25 ₽/);
  assert.match(plain(o.stack), /×4 = 2\.0 кг/); assert.match(plain(o.trophy), /трофей мутанта/); assert.match(plain(o.splint), /Лечит перелом/); assert.equal(o.none, null);
});

test("подсказка при покупке: цена, пачка и сколько уже в рюкзаке; у скупщика — цена скупки", () => {
  fresh();
  const o = run(`(() => { invAdd("ammo", 7); return { buy: Tip.item("ammo", "buy"), sell: Tip.item("scrap", null, "buyer"), price: buyPrice("ammo"), sellPrice: sellPrice({ id: "scrap", n: 1 }, "buyer") }; })()`);
  assert.match(plain(o.buy), new RegExp("Цена покупки: " + o.price + " ₽ за 6 шт")); assert.match(plain(o.buy), /В рюкзаке: 7/);
  assert.match(plain(o.sell), new RegExp("Скупка: " + o.sellPrice + " ₽ за штуку"));
});

test("подсказка артефакта: неопознанный скрывает свойства, опознанный перечисляет все эффекты и фон", () => {
  fresh();
  const o = run(`(() => { const unk = Tip.art("medusa"); P.known.medusa = true; P.known.springheart = true; P.known.ashheart = true; P.known.moonlight = true;
    return { unk, med: Tip.art("medusa"), spring: Tip.art("springheart"), ash: Tip.art("ashheart"), moon: Tip.art("moonlight", "sci"), slotUnknown: (P.inv = [], invAdd("art", 1, "soul"), Tip.slot(P.inv[0])) }; })()`);
  assert.match(plain(o.unk), /Неопознанный артефакт/); assert.match(plain(o.unk), /Свойства неизвестны/); assert.doesNotMatch(plain(o.unk), /Сопротивление/);
  assert.match(plain(o.med), /Медуза/); assert.match(plain(o.med), /Сопротивление радиации \+12%/); assert.match(plain(o.spring), /Восстановление сил \+8/); assert.match(plain(o.spring), /Грузоподъёмность \+4 кг/);
  assert.match(plain(o.ash), /Огнестойкость \+35%/); assert.match(plain(o.ash), /Регенерация \+0\.8 HP\/с/); assert.match(plain(o.moon), /Привлекает мутантов/); assert.match(plain(o.moon), /Скупка: \d+ ₽/);
  assert.match(plain(o.slotUnknown), /Неопознанный артефакт/);
});

test("подсказка артефакта: навык «Знание» подсказывает про фон у неопознанного", () => {
  fresh();
  const o = run(`(() => { P.sk.lore = 1; return Tip.art("nightstar"); })()`);
  assert.match(plain(o), /Наблюдение: фонит/);
});

test("подсказка оружия: урон, скорострельность, износ, боеприпас; купленное показывает состояние, непокупленное — цену", () => {
  fresh();
  const o = run(`(() => { P.cond.pistol = 35; return { pistol: Tip.weapon("pistol"), sawn: Tip.weapon("sawnoff"), flamer: Tip.weapon("flamer"), smg: Tip.weapon("smg") }; })()`);
  assert.match(plain(o.pistol), /Урон: 30/); assert.match(plain(o.pistol), /Состояние: 35%/); assert.match(plain(o.pistol), /Патроны 9мм/); assert.doesNotMatch(plain(o.pistol), /Цена:/);
  assert.match(plain(o.sawn), /×6 \(картечь\)/); assert.match(plain(o.sawn), /Цена: 260 ₽/); assert.match(plain(o.sawn), /Мастерская: уровень 1/);
  assert.match(plain(o.flamer), /Канистра горючего \(1 шт\. = 25 выстрелов\)/); assert.match(plain(o.flamer), /игнорирует броню/); assert.match(plain(o.smg), /≈ 107 урона\/с/);
});

test("подсказка рецепта: материалы «есть/нужно», уровень здания и навык", () => {
  fresh();
  const o = run(`(() => { P.bld = Camp.DEFAULT_BLD(); invAdd("scrap", 2); return { ammo: Tip.recipe("ammo"), remelt: Tip.recipe("remelt"), suit2: Tip.recipe("suit2"), splint: Tip.recipe("splint") }; })()`);
  assert.match(plain(o.ammo), /Патроны ×12/); assert.match(plain(o.ammo), /мастерская ур\. 2/); assert.match(plain(o.ammo), /Металлолом 2\/2/); assert.match(plain(o.ammo), /Батарея 0\/1/);
  assert.match(plain(o.remelt), /Случайный артефакт из:/); assert.match(plain(o.remelt), /Пустышка 0\/3/); assert.match(plain(o.suit2), /навык «Грузоподъёмность» 2/); assert.match(plain(o.splint), /Лечит перелом/);
});

test("подсказка по кнопке строки: рюкзак, торговля, склад, оружие, рецепт, контейнер артефактов, быстрый слот", () => {
  fresh();
  const o = run(`(() => {
    invAdd("medkit", 2); invAdd("art", 1, "soul"); P.stash = [{ id: "scrap", n: 3 }]; P.known.soul = true; P.equip = [{ art: "soul", q: 1 }, null]; G.ui = { k: "trade", v: "buyer" };
    const r = a => plain(Tip.fromAttr(a)); function plain(h) { return h ? String(h).replace(/<[^>]+>/g, " ") : null; }
    return { equip: r("equip:0"), use: r("use:0"), drop: r("drop:0"), sell: r("sell:1"), stash: r("stash:0"), unstash: r("unstash:0"), unequip: r("unequip:0"), unequipEmpty: r("unequip:1"), buy: r("buy:food"), wbuy: r("wbuy:rifle"), wequip: r("wequip:pistol"), craft: r("craft:shock"),
      quickWeapon: plain(Tip.quick(1)), quickBolt: (Quick.assign(2, "bolt"), plain(Tip.quick(2))), quickMedkit: (Quick.assign(3, "medkit"), plain(Tip.quick(3))), oor: r("sell:99"), close: r("close"), nan: r("qacc:1"), scrapSell: (G.ui = { k: "trade", v: "buyer" }, invAdd("scrap", 3), plain(Tip.fromAttr("sell:" + (P.inv.length - 1)))) };
  })()`);
  assert.match(o.equip, /Аптечка/); assert.match(o.use, /Аптечка/); assert.match(o.drop, /Аптечка/); assert.match(o.sell, /Душа/); assert.match(o.stash, /Аптечка/); assert.match(o.unstash, /Металлолом/);
  assert.match(o.unequip, /Душа/); assert.equal(o.unequipEmpty, null); assert.match(o.buy, /Тушёнка/); assert.match(o.wbuy, /Винтовка/); assert.match(o.wequip, /Пистолет/); assert.match(o.craft, /Шок-бомба/);
  assert.match(o.quickWeapon, /Пистолет/); assert.match(o.quickBolt, /Болт/); assert.match(o.quickMedkit, /Аптечка/); assert.equal(o.oor, null); assert.equal(o.close, null); assert.equal(o.nan, null);
  assert.match(plain(o.scrapSell), /Скупка: \d+ ₽ за штуку/, "в окне торговли показана цена скупки");
});

test("resolve: находит предмет по строке .row, слоту .slot и быстрому слоту .qs; на чужих элементах — null", () => {
  fresh();
  const o = run(`(() => {
    invAdd("medkit", 1); P.known.soul = true; P.equip = [{ art: "soul", q: 1 }, null];
    const btn = { dataset: { a: "use:0" } }, row = { querySelector: s => (s === "[data-a]" ? btn : null) };
    const inRow = { closest: s => (s === ".row" ? row : null) };
    Quick.assign(1, "bolt"); const slot = { closest: s => (s === ".slot" ? { dataset: { a: "unequip:0" } } : null) }, qs = { closest: s => (s === ".qs" ? { dataset: { q: "1" } } : null) };
    const other = { closest: () => null }, emptyRow = { closest: s => (s === ".row" ? { querySelector: () => null } : null) };
    const strip = h => (h ? String(h).replace(/<[^>]+>/g, " ") : null);
    return { row: strip(Tip.resolve(inRow)), slot: strip(Tip.resolve(slot)), qs: strip(Tip.resolve(qs)), other: Tip.resolve(other), emptyRow: Tip.resolve(emptyRow), nul: Tip.resolve(null) };
  })()`);
  assert.match(o.row, /Аптечка/); assert.match(o.slot, /Душа/); assert.match(o.qs, /Болт/); assert.equal(o.other, null); assert.equal(o.emptyRow, null); assert.equal(o.nul, null);
});

test("подсказки есть для каждого предмета, артефакта, оружия и рецепта конфига", () => {
  fresh();
  const o = run(`(() => { const bad = []; for (const k in CFG.items) if (!Tip.item(k)) bad.push("item:" + k);
    for (const k in CFG.arts) { P.known[k] = false; if (!Tip.art(k)) bad.push("art?:" + k); P.known[k] = true; if (!Tip.art(k)) bad.push("art:" + k); }
    for (const k in CFG.weapons) if (!Tip.weapon(k)) bad.push("weapon:" + k); for (const r of CFG.recipes) if (!Tip.recipe(r.id)) bad.push("recipe:" + r.id); return bad; })()`);
  assert.deepEqual(o, []);
});

// ---------- разговоры ----------
test("жители лагеря: у каждого есть id и разговор в конфиге; вопросы известных видов", () => {
  fresh();
  const o = run(`(() => ({ ids: Camp.npcs.map(n => n.id).sort(), talk: Object.keys(CFG.talk).sort() }))()`);
  assert.deepEqual(o.ids, o.talk);
  const kinds = new Set(["rumor", "tip", "text", "gate", "emission", "duds", "locker", "story"]);
  for (const [id, d] of Object.entries(CFG.talk)) {
    assert.ok(d.role && d.greet && d.topics.length >= 2, id); for (const t of d.topics) { assert.ok(kinds.has(t.k), id + ":" + t.k); assert.ok(t.t, id); if (t.k === "text") assert.ok(t.a, id); }
    if (d.topics.some(t => t.k === "story")) assert.ok(d.story, id + ": нет истории");
  }
  assert.ok(CFG.tips.length >= 8);
});

test("на базе: рядом с жителем появляется «Поговорить», E открывает диалог с вопросами и кнопкой «Уйти»", () => {
  fresh();
  const o = run(`(() => {
    const n = Camp.npcs.find(x => x.id === "garik"); G.scene = "camp"; P.x = n.x + 20; P.y = n.y; const labels = []; Camp.near((o, d, lim, label) => { if (d < lim) labels.push(label); });
    G.scene = "camp"; Camp.tick(0.016); const near = G.near && G.near.label; G.near.fn(); const ui = G.ui && G.ui.k, html = Meta.talkHTML(G.ui);
    const far = (P.x = 100, P.y = 100, Camp.tick(0.016), G.near && G.near.label);
    return { labels, near, ui, html, far };
  })()`);
  assert.ok(o.labels.includes("Поговорить: Гарик")); assert.equal(o.near, "Поговорить: Гарик"); assert.equal(o.ui, "talk");
  assert.match(plain(o.html), /Гарик/); assert.match(plain(o.html), /болтун-сталкер/); assert.match(plain(o.html), /Что слышно\?/); assert.match(plain(o.html), /Уйти/); assert.ok(!/Поговорить/.test(String(o.far)));
});

test("разговор: слух и совет берутся из конфига, ответ-текст показывается, приветствие — пока ничего не спрошено", () => {
  fresh();
  const o = run(`(() => {
    const n = Camp.npcs.find(x => x.id === "garik"), u = { k: "talk", n, msg: "" }; const greet = plain(Meta.talkHTML(u));
    Meta.click("tk", 0, 0, u); const rumor = u.msg; Meta.click("tk", 1, 0, u); const tip = u.msg;
    const m = Camp.npcs.find(x => x.id === "mosol"), u2 = { k: "talk", n: m, msg: "" }; Meta.click("tk", 1, 0, u2);
    function plain(h) { return String(h).replace(/<[^>]+>/g, " "); }
    return { greet, rumor, tip, text: u2.msg, rumors: CFG.rumors, tips: CFG.tips, mtext: CFG.talk.mosol.topics[1].a };
  })()`);
  assert.match(o.greet, /Спрашивай/); assert.ok(o.rumors.some(r => o.rumor.includes(r))); assert.ok(o.tips.some(t => o.tip.includes(t))); assert.equal(o.text, o.mtext);
});

test("Седой чует выброс: ответ зависит от времени до выброса и от сирены", () => {
  fresh();
  const o = run(`(() => {
    const n = Camp.npcs.find(x => x.id === "sedoy"), u = { k: "talk", n, msg: "" }, ask = (s, next) => { G.emi = { s, left: 10, next }; Meta.click("tk", 0, 0, u); return u.msg; };
    return { soon: ask("calm", 20), mid: ask("calm", 100), far: ask("calm", 500), warn: ask("warn", 0), blast: ask("blast", 0) };
  })()`);
  assert.match(o.soon, /Минута-две/); assert.match(o.mid, /Скоро/); assert.match(o.far, /Пока тихо/); assert.match(o.warn, /сирену/); assert.match(o.blast, /Сиди/);
  assert.equal(new Set(Object.values(o)).size, 5);
});

test("часовой: рассказывает про сектор 4 — репутация, пропуск, цена", () => {
  fresh();
  const o = run(`(() => {
    const n = Camp.npcs.find(x => x.id === "guard1"), u = { k: "talk", n, msg: "" }; P.rep = 4; P.pass = false; Meta.click("tk", 0, 0, u); const a = u.msg; P.pass = true; Meta.click("tk", 0, 0, u); return { a, b: u.msg, gate: CFG.gate.rep };
  })()`);
  assert.match(o.a, new RegExp("репутации " + 15 + " \\(у тебя 4\\)")); assert.match(o.a, /250 ₽/); assert.match(o.b, /пропуск, так что иди/);
});

test("Мосол покупает пустышки по 9 ₽ (дороже скупщика), остальное не трогает; без пустышек кнопка недоступна", () => {
  fresh();
  const o = run(`(() => {
    const n = Camp.npcs.find(x => x.id === "mosol"), u = { k: "talk", n, msg: "" }; const disabled0 = /class="btn dis" data-a="tk:0"/.test(Meta.talkHTML(u));
    invAdd("art", 1, "dud"); invAdd("art", 1, "dud"); invAdd("art", 1, "soul"); invAdd("scrap", 5); P.money = 0; const disabled1 = /class="btn dis" data-a="tk:0"/.test(Meta.talkHTML(u)); Meta.click("tk", 0, 0, u);
    const left = P.inv.map(s => s.art || s.id).sort(), money = P.money, msg = u.msg; Meta.click("tk", 0, 0, u);
    invAdd("art", 1, "dud"); const buyer = sellPrice(P.inv[P.inv.length - 1], "buyer");
    return { disabled0, disabled1, left, money, msg, again: P.money, buyer, earned: P.earned };
  })()`);
  assert.equal(o.disabled0, true); assert.equal(o.disabled1, false); assert.deepEqual(o.left, ["scrap", "soul"]); assert.equal(o.money, 18); assert.match(o.msg, /18 рублей/); assert.equal(o.again, 18, "повторно без пустышек денег не даёт");
  assert.ok(o.buyer < 9, "скупщик даёт меньше: " + o.buyer); assert.ok(o.earned >= 18);
});

test("Лёха открывает ящик хранения прямо из разговора", () => {
  fresh();
  const o = run(`(() => { const n = Camp.npcs.find(x => x.id === "lyokha"), u = { k: "talk", n, msg: "" }; G.ui = u; Meta.click("tk", 0, 0, u); return { ui: G.ui.k }; })()`);
  assert.equal(o.ui, "storage");
});

test("история: доступна с репутацией 3, один раз на жителя, открывает знание, сохраняется при перезагрузке", () => {
  fresh();
  const o = run(`(() => {
    const n = Camp.npcs.find(x => x.id === "garik"), u = { k: "talk", n, msg: "" }, idx = CFG.talk.garik.topics.findIndex(t => t.k === "story");
    const locked = /class="btn dis" data-a="tk:\\d+"/.test(Meta.talkHTML(u)); Meta.click("tk", idx, 0, u); const early = { msg: u.msg, lore: P.lore, talked: !!P.talked.garik };
    P.rep = 3; Meta.click("tk", idx, 0, u); const first = { msg: u.msg, lore: P.lore, talked: P.talked.garik }; Meta.click("tk", idx, 0, u); const second = { lore: P.lore };
    const other = Camp.npcs.find(x => x.id === "sedoy"), u2 = { k: "talk", n: other, msg: "" }; Meta.click("tk", CFG.talk.sedoy.topics.findIndex(t => t.k === "story"), 0, u2); const two = P.lore;
    Camp.enter(true); save(); P.talked = {}; W = null; load(); return { locked, early, first, second, two, restored: P.talked, story: CFG.talk.garik.story, html: Meta.talkHTML(u) };
  })()`);
  assert.equal(o.locked, true); assert.match(o.early.msg, /плохо знают/); assert.equal(o.early.lore, 0); assert.equal(o.early.talked, false);
  assert.ok(o.first.msg.includes(o.story)); assert.equal(o.first.lore, 1); assert.equal(o.first.talked, true); assert.equal(o.second.lore, 1); assert.equal(o.two, 2);
  assert.deepEqual(o.restored, { garik: true, sedoy: true }); assert.match(plain(o.html), /Уже рассказал/);
});

test("разговор не ломает игру: диалог рисуется, Esc закрывает, панель перерисовывается после ответа", () => {
  fresh();
  const o = run(`(() => { const n = Camp.npcs.find(x => x.id === "guard2"); Meta.openCampTalk(n); const a = G.ui.k; renderPanel(); Meta.click("tk", 1, 0, G.ui); renderPanel(); closePanel(); return { a, after: G.ui }; })()`);
  assert.equal(o.a, "talk"); assert.equal(o.after, null);
});

"use strict";
// «Обочина» v0.12.2: подсказки при наведении на навыки, задания и объекты мира (мутанты, сталкеры, предметы на земле, тайники, враги подземелья).
const test = require("node:test");
const assert = require("node:assert/strict");
const { createZone } = require("./zone-load");

const z = createZone();
const CFG = z.get("CFG");
const run = code => JSON.parse(JSON.stringify(z.run(code) ?? null));
const plain = h => (h == null ? h : String(h).replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
const fresh = () => z.run(`(() => {
  W = new World(1234); resetPlayer(); P.stash = []; P.bld = null; Mutants.spawn(); Stalkers.spawn(); Meta.reset(); Camp.enter(true); Dungeon.levels = {};
  G.events = []; G.dead = false; G.scene = "zone"; G.started = true; G.ui = null; G.night = 0; G.emi = { s: "calm", left: 0, next: 99999 }; G.t = 5; P.hp = 100; P.inv = []; P.quests = []; P.offers = [];
  Stalkers.list = []; Mutants.list = []; Mutants.corpses = []; W.loot = []; W.conts = []; W.arts = []; W.caches = []; W.anoms = []; P.x = 3000; P.y = 3000; cam.x = 2600; cam.y = 2700; localStorage.removeItem("zone_save_v2");
})()`);
// мировые координаты (wx, wy) → экранные при cam = (2600, 2700)
const scr = (wx, wy) => `${wx - 2600}, ${wy - 2700}`;

test("навык: название, описание, уровень и очки", () => {
  fresh();
  const o = run(`(() => { P.sp = 2; P.sk.carry = 1; return { a: Tip.fromAttr("skill:carry"), none: Tip.fromAttr("skill:nope") }; })()`);
  const t = plain(o.a); assert.match(t, /Грузоподъёмность/); assert.match(t, /навык/); assert.match(t, /\+4 кг переносимого веса/); assert.match(t, /Уровень: 1 \/ 5/); assert.match(t, /Очков навыков: 2/); assert.equal(o.none, null);
});

test("задание: предложение показывает награду, репутацию и артефакт; активное — прогресс и статус", () => {
  fresh();
  const o = run(`(() => {
    P.offers = [{ type: "bring", mat: "scrap", n: 3, reward: 90, rep: 4, text: "Принести хлам", item: ["art", "echo"] }, { type: "bring", mat: "scrap", n: 3, reward: 50, rep: 2, text: "Ещё" }];
    P.quests = [{ type: "bring", mat: "scrap", n: 3, reward: 70, rep: 3, text: "Мой заказ", id: 1 }]; const a = Tip.fromAttr("qacc:0"), b = Tip.fromAttr("qturn:0"); invAdd("scrap", 3); const c = Tip.fromAttr("qdrop:0");
    return { a, b, c, none: Tip.fromAttr("qacc:9") };
  })()`);
  assert.match(plain(o.a), /Принести хлам/); assert.match(plain(o.a), /Награда: 90 ₽/); assert.match(plain(o.a), /Репутация: \+4/); assert.match(plain(o.a), /Артефакт: Эхо/); assert.match(plain(o.a), /Активных заданий: 1 \/ 3/);
  assert.match(plain(o.b), /в работе/); assert.match(plain(o.b), /0\/3/); assert.match(plain(o.c), /выполнено/); assert.match(plain(o.c), /3\/3/); assert.equal(o.none, null);
});

test("мутант под курсором: имя, состояние, здоровье, урон, броня, время активности, особенности, трофей", () => {
  fresh();
  const o = run(`(() => {
    const m = new Mutant("tin", 3100, 3050, null); m.state = "wander"; m.hp = 60; Mutants.list = [m];
    const hit = Tip.world(${scr(3100, 3050)}), miss = Tip.world(${scr(3300, 3300)}), edge = Tip.world(${scr(3100 + 13 + 8, 3050)});
    const far = new Mutant("tin", 3100 + 500, 3050, null); far.state = "wander"; Mutants.list = [far]; P.x = 3000; const tooFar = Tip.world(${scr(3600, 3050)});
    return { hit, miss, edge, tooFar };
  })()`);
  const t = plain(o.hit);
  assert.match(t, /Жестянка/); assert.match(t, /бродит/); assert.match(t, /Здоровье: 60 \/ 120/); assert.match(t, /Урон: 24 · броня 50%/); assert.match(t, /Активен: днём/); assert.match(t, /металлический/); assert.match(t, /охраняет территорию/);
  assert.match(t, /Трофей: Ржавая пластина \(22 ₽\)/); assert.equal(o.miss, null); assert.ok(o.edge, "у края хитбокса подсказка ещё есть"); assert.equal(o.tooFar, null, "дальше 420 пикс — не показываем");
});

test("особенности видов: стая, огнеупорность, засада, вода, заражение", () => {
  fresh();
  const o = run(`(() => ({ listener: Tip.mutantFlags(CFG.mut.listener), cinder: Tip.mutantFlags(CFG.mut.cinder), drowner: Tip.mutantFlags(CFG.mut.drowner), rotter: Tip.mutantFlags(CFG.mut.rotter), fogger: Tip.mutantFlags(CFG.mut.fogger), glass: Tip.mutantFlags(CFG.mut.glass) }))()`);
  assert.ok(o.listener.includes("ходит стаей") && o.listener.includes("прыгает")); assert.ok(o.cinder.includes("огнеупорен") && o.cinder.includes("нападает из засады") && o.cinder.includes("может поджечь"));
  assert.ok(o.drowner.includes("живёт в воде, хватает у кромки")); assert.ok(o.rotter.includes("укус заражает рану")); assert.ok(o.fogger.includes("замирает под взглядом")); assert.ok(o.glass.includes("пугливый"));
});

test("скрытых не показываем: Топляк под водой, спящие Углеглот и Туманник; проснувшийся Топляк — показываем", () => {
  fresh();
  const o = run(`(() => {
    W.water = [{ x: 3100, y: 3050, rx: 100, ry: 60 }]; const d = new Mutant("drowner", 3100, 3050, null); d.pond = W.water[0]; const c = new Mutant("cinder", 3100, 3050, null), f = new Mutant("fogger", 3100, 3050, null);
    const res = {}; for (const [k, m] of [["drowner", d], ["cinder", c], ["fogger", f]]) { Mutants.list = [m]; m.state = "sleep"; res[k] = Tip.world(${scr(3100, 3050)}); }
    Mutants.list = [d]; d.state = "hunt"; res.drownerAwake = plain(Tip.world(${scr(3100, 3050)})); function plain(h) { return h && String(h).replace(/<[^>]+>/g, " "); } return res;
  })()`);
  assert.equal(o.drowner, null); assert.equal(o.cinder, null); assert.equal(o.fogger, null); assert.match(o.drownerAwake, /Топляк/); assert.match(o.drownerAwake, /охотится/);
});

test("сталкер: кто он, здоровье, отношение (нейтрален / враждебен / нужна помощь)", () => {
  fresh();
  const o = run(`(() => {
    const s = new Stalker("loner", 3100, 3050); Stalkers.list = [s]; const a = Tip.world(${scr(3100, 3050)}); s.hostile = true; const b = Tip.world(${scr(3100, 3050)});
    Stalkers.list = [new Stalker("wounded", 3100, 3050)]; const c = Tip.world(${scr(3100, 3050)}); return { a, b, c };
  })()`);
  assert.match(plain(o.a), /одиночка/); assert.match(plain(o.a), /нейтрален/); assert.match(plain(o.b), /враждебен/); assert.match(plain(o.c), /раненый/); assert.match(plain(o.c), /нужна помощь/);
});

test("предметы и контейнеры на земле: предмет с описанием и подсказкой E; контейнер — обыскан или нет; артефакт — только рядом; тайник смерти", () => {
  fresh();
  const o = run(`(() => {
    W.loot = [{ x: 3100, y: 3050, id: "medkit", n: 2 }]; const item = Tip.world(${scr(3100, 3050)}); W.loot = [];
    W.conts = [{ x: 3100, y: 3050, kind: "stash", opened: false, loot: [] }]; const closed = Tip.world(${scr(3100, 3050)}); W.conts[0].opened = true; const opened = Tip.world(${scr(3100, 3050)});
    W.conts[0].x = 3500; const farCont = Tip.world(${scr(3500, 3050)}); W.conts = [];
    W.arts = [{ id: 1, type: "soul", x: 3100, y: 3050, anom: 0 }]; const art = Tip.world(${scr(3100, 3050)}); W.arts[0].x = 3600; W.arts[0].y = 3600; const farArt = Tip.world(${scr(3600, 3600)}); W.arts = [];
    W.caches = [{ x: 3100, y: 3050, items: [], money: 1 }]; const cache = Tip.world(${scr(3100, 3050)});
    return { item, closed, opened, farCont, art, farArt, cache };
  })()`);
  assert.match(plain(o.item), /Аптечка/); assert.match(plain(o.item), /Лечит \+45 HP/); assert.match(plain(o.item), /×2/); assert.match(plain(o.item), /Подобрать: E/);
  assert.match(plain(o.closed), /Тайник/); assert.match(plain(o.closed), /можно обыскать/); assert.match(plain(o.opened), /обыскан/); assert.equal(o.farCont, null, "далёкие контейнеры не подсказываются");
  assert.match(plain(o.art), /Что-то поблёскивает/); assert.equal(o.farArt, null); assert.match(plain(o.cache), /Твой хабар/);
});

test("панель, смерть и лагерь гасят подсказки мира", () => {
  fresh();
  const o = run(`(() => {
    W.loot = [{ x: 3100, y: 3050, id: "medkit", n: 1 }]; const a = !!Tip.world(${scr(3100, 3050)}); G.ui = { k: "inv" }; const b = !!Tip.world(${scr(3100, 3050)}); G.ui = null; G.dead = true; const c = !!Tip.world(${scr(3100, 3050)});
    G.dead = false; G.scene = "camp"; const d = !!Tip.world(${scr(3100, 3050)}); G.scene = "zone"; G.started = false; const e = !!Tip.world(${scr(3100, 3050)}); G.started = true; return { a, b, c, d, e };
  })()`);
  assert.deepEqual(o, { a: true, b: false, c: false, d: false, e: false });
});

test("подземелье: враг с описанием поведения, оглушение, Тень видна только вблизи; шкафчик, сейф, лестница", () => {
  fresh();
  const o = run(`(() => {
    const b = W.bunkers[0]; Dungeon.enter(b); Dungeon.enemies = []; const L = Dungeon.lvl, T = 48;
    P.x = Dungeon.center(L.start.tx, L.start.ty).x; P.y = Dungeon.center(L.start.tx, L.start.ty).y; cam.x = 0; cam.y = 0;
    const at = (e) => Tip.world(e.x, e.y);
    const c = new DEnemy(P.x + 30, P.y, CFG.dungeon.enemies.carapace, 1, "carapace"); c.state = "hunt"; Dungeon.enemies = [c]; const crawl = at(c); c.mode = "stun"; const stun = at(c);
    const sh = new DEnemy(P.x + 200, P.y, CFG.dungeon.enemies.shade, 1, "shade"); Dungeon.enemies = [sh]; const farShade = at(sh); sh.x = P.x + 40; const nearShade = at(sh);
    Dungeon.enemies = []; const exit = Tip.world(P.x, P.y); const k = L.lockers[0], kc = Dungeon.center(k.tx, k.ty); const locker = Tip.world(kc.x, kc.y); b.opened.push(0); const lockerOpen = Tip.world(kc.x, kc.y);
    const vc = Dungeon.center(L.vault.tx, L.vault.ty); const vault = Tip.world(vc.x, vc.y); const nothing = Tip.world(vc.x + 200, vc.y + 200);
    return { crawl, stun, farShade, nearShade, exit, locker, lockerOpen, vault, nothing };
  })()`);
  assert.match(plain(o.crawl), /Панцирник/); assert.match(plain(o.crawl), /охотится/); assert.match(plain(o.crawl), /броня 50%/); assert.match(plain(o.crawl), /врезавшись в стену/); assert.match(plain(o.crawl), /Ржавая пластина \(70%\)/);
  assert.match(plain(o.stun), /оглушён: урон ×1\.5/); assert.equal(o.farShade, null, "далёкая тень невидима, подсказки нет"); assert.match(plain(o.nearShade), /Тень/); assert.match(plain(o.nearShade), /Красться/);
  assert.match(plain(o.exit), /Лестница/); assert.match(plain(o.locker), /закрыт/); assert.match(plain(o.lockerOpen), /пуст/); assert.match(plain(o.vault), /Сейф/); assert.match(plain(o.vault), /закрыт/); assert.equal(o.nothing, null);
});

test("подсказки есть для каждого вида мутанта и врага подземелья", () => {
  fresh();
  const o = run(`(() => { const bad = []; for (const sp in CFG.mut) { const m = new Mutant(sp, 100, 100, null); if (!Tip.mutant(m)) bad.push(sp); }
    for (const k in CFG.dungeon.enemies) { const e = new DEnemy(0, 0, CFG.dungeon.enemies[k], 1, k); if (!Tip.denemy(e) || !Tip.KIND[CFG.dungeon.enemies[k].kind]) bad.push(k); }
    for (const k in CFG.skills) if (!Tip.skill(k)) bad.push("skill:" + k); return bad; })()`);
  assert.deepEqual(o, []);
});

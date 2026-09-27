"use strict";
// v0.32: быстрая панель — нож на 1, остальное пусто и раскладывается игроком (в том числе огнестрел); артефакты в раскрытых аномалиях видны.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createZone } = require("./zone-load");

const z = createZone();
const run = code => JSON.parse(JSON.stringify(z.run(code) ?? null));
const fresh = () => z.run(`(() => {
  W = new World(1234); resetPlayer(); P.stash = []; P.bld = null; Mutants.spawn(); Stalkers.spawn(); Meta.reset(); Camp.enter(true);
  G.events = []; G.dead = false; G.started = true; G.ui = null; G.scene = "camp"; P.inv = []; Mutants.list = []; Stalkers.list = []; W.anoms = []; W.arts = [];
})()`);

test("раскладка по умолчанию: нож на 1, пистолет на 2, остальное пусто; нож не переставляется", () => {
  fresh();
  const o = run(`(() => ({ held: heldNames.slice(), q: P.quick.slice(), toKnife: Quick.assign(0, "medkit"), moved: heldNames[0], melee: Quick.assign(3, "melee"), sel: P.sel, v: P.quickV }))()`);
  assert.deepEqual(o.held, ["melee", "w:pistol", null, null, null, null, null, null, null]); assert.deepEqual(o.q, o.held); assert.equal(o.toKnife, false); assert.equal(o.moved, "melee"); assert.equal(o.melee, false); assert.equal(o.sel, 0); assert.equal(o.v, 3);
});

test("любая полезная вещь и любое своё оружие (стволы и ножи) ставятся на любую кнопку 2–9; занятая обменивается; очистка; лишнее не ставится", () => {
  fresh();
  const o = run(`(() => {
    P.weapons.push("revolver"); P.cond.revolver = 100; P.knives = ["knife", "shiv"];
    const ok = Quick.assign(5, "w:pistol"); const a = heldNames.slice(); Quick.assign(1, "w:revolver"); Quick.assign(6, "k:shiv"); const b = heldNames.slice(); const sw = Quick.assign(5, "food"); const c = heldNames.slice(); const clear = Quick.assign(5, null);
    return { ok, a, b, sw, c, clear, d: heldNames.slice(), junk: Quick.can("scrap"), art: Quick.can("art"), hook: Quick.can("hook"), gun: Quick.can("w:pistol"), noGun: Quick.can("w:rifle"), knife: Quick.can("k:knife"), noKnife: Quick.can("k:machete"), legacy: Quick.can("weapon") };
  })()`);
  assert.equal(o.ok, true); assert.equal(o.a[5], "w:pistol"); assert.equal(o.a[1], null, "ствол ушёл с кнопки 2: одна вещь — одна кнопка"); assert.equal(o.b[1], "w:revolver"); assert.equal(o.b[5], "w:pistol"); assert.equal(o.b[6], "k:shiv", "весь арсенал — на кнопках");
  assert.equal(o.c[5], "food"); assert.equal(o.d[5], null); assert.equal(o.junk, false); assert.equal(o.art, false); assert.equal(o.hook, true); assert.equal(o.gun, true); assert.equal(o.noGun, false, "чужого оружия нет"); assert.equal(o.knife, true); assert.equal(o.noKnife, false); assert.equal(o.legacy, false);
});

test("кнопка со стволом берёт именно его в руки и стреляет им; кнопка с ножом бьёт этим ножом; выбор двух стволов подряд", () => {
  fresh();
  const o = run(`(() => {
    P.weapons.push("revolver"); P.cond.revolver = 100; P.knives = ["knife", "shiv"]; Quick.assign(3, "w:revolver"); Quick.assign(4, "k:shiv"); invAdd("ammo", 10); Mutants.list = []; Stalkers.list = [];
    P.sel = 1; Quick.syncWeapon(); const w1 = P.weapon; P.sel = 3; Quick.syncWeapon(); const w2 = P.weapon; P.cd = 0; const a0 = invCount("ammo"); useSel(); const shot = invCount("ammo") === a0 - 1, cd = P.cd;
    P.sel = 4; P.cd = 0; useSel(); const knifeCd = P.cd, shivCd = Melee.DEF.shiv.cd;
    return { w1, w2, shot, cd, knifeCd, shivCd, revCd: Wpn.of("revolver").cd, tip: /Заточка/.test(Tip.quick(4)), tipGun: !!Tip.quick(3) };
  })()`);
  assert.equal(o.w1, "pistol"); assert.equal(o.w2, "revolver"); assert.equal(o.shot, true); assert.equal(o.cd, o.revCd); assert.equal(o.knifeCd, o.shivCd, "бьёт заточкой"); assert.equal(o.tip, true); assert.equal(o.tipGun, true);
});

test("проданное или пропавшее оружие освобождает свою кнопку; оружие не пропадает, если убрать его с кнопки", () => {
  fresh();
  const o = run(`(() => {
    P.weapons.push("revolver"); P.cond.revolver = 100; Quick.assign(4, "w:revolver"); const a = heldNames[4];
    Quick.assign(4, null); const stillOwned = P.weapons.includes("revolver"), cleared = heldNames[4];
    Quick.assign(4, "w:revolver"); P.weapons = P.weapons.filter(w => w !== "revolver"); P.weapon = "pistol"; Quick._t = 1; update(0.1); const gone = heldNames[4];
    return { a, stillOwned, cleared, gone };
  })()`);
  assert.equal(o.a, "w:revolver"); assert.equal(o.stillOwned, true); assert.equal(o.cleared, null); assert.equal(o.gone, null);
});

test("клавиша кнопки использует то, что под ней; пустая кнопка ничего не делает; колесо пропускает пустые", () => {
  fresh();
  const o = run(`(() => {
    Quick.assign(4, "food"); invAdd("food", 2); P.food = 20; P.sel = 4; P.cd = 0; const before = invCount("food"); useSel(); const eaten = P.food > 20 && invCount("food") === before - 1;
    P.sel = 6; P.cd = 0; const f0 = P.food; useSel(); const idle = P.food === f0;
    P.sel = 0; stepSel(1); const s1 = P.sel; stepSel(1); const s2 = P.sel; stepSel(-1); const s3 = P.sel;
    return { eaten, idle, s1, s2, s3, tip: !!Tip.quick(4), tipEmpty: Tip.quick(6), tipKnife: /Нож/.test(Tip.quick(0)) };
  })()`);
  assert.equal(o.eaten, true); assert.equal(o.idle, true); assert.equal(o.s1, 1); assert.equal(o.s2, 4, "пустые 3 пропущены"); assert.equal(o.s3, 1); assert.equal(o.tip, true); assert.equal(o.tipEmpty, null); assert.equal(o.tipKnife, true);
});

test("выбор кнопки в инвентаре; раскладка живёт в сохранении, новая игра — по умолчанию; старые сохранения: полная панель → пустая, v2 «weapon» → пистолет", () => {
  fresh();
  const o = run(`(() => {
    invAdd("antibiotic", 1); G.ui = { k: "inv" }; const u = G.ui;
    Meta.click("cell", "inv", "0", u); Meta.click("cell", "quick", "8", u); const after = heldNames[8];
    G.scene = "camp"; save(true); const raw = JSON.parse(localStorage.getItem(saveKey())); const saved = raw.P.quick && raw.P.quick[8], ver = raw.P.quickV;
    resetPlayer(); const fresh2 = heldNames[8];
    P.quick = ["weapon", "bolt", "medkit", "food", "antirad", "lure", "splint", "shock", "hook"]; P.quickV = undefined; Meta.afterLoad(); const legacy = heldNames.slice();
    P.quick = ["melee", "weapon", null, null, null, null, null, null, "antibiotic"]; P.quickV = 2; Meta.afterLoad(); const v2 = heldNames.slice();
    Quick.assign(2, "antirad"); Quick.reset(); const reset = heldNames.slice();
    return { after, saved, ver, fresh2, legacy, v2, reset };
  })()`);
  assert.equal(o.after, "antibiotic"); assert.equal(o.saved, "antibiotic"); assert.equal(o.ver, 3); assert.equal(o.fresh2, null); assert.deepEqual(o.legacy, ["melee", "w:pistol", null, null, null, null, null, null, null]);
  assert.deepEqual(o.v2, ["melee", "w:pistol", null, null, null, null, null, null, "antibiotic"]); assert.deepEqual(o.reset, ["melee", "w:pistol", null, null, null, null, null, null, null]);
});

test("мусор в раскладке не ломает панель: дубликаты, неподходящее, чужие типы", () => {
  fresh();
  const o = run(`(() => { P.quickV = 3; P.quick = ["x", 5, "scrap", null, "nope", "lure", "lure", "w:pistol", "hook"]; Meta.afterLoad(); return heldNames.slice(); })()`);
  assert.deepEqual(o, ["melee", null, null, null, null, "lure", null, "w:pistol", "hook"]);
});

test("артефакт в раскрытой аномалии виден издалека, в нераскрытой — только вплотную", () => {
  fresh();
  const o = run(`(() => {
    const a = { id: 9, type: "plesh", x: 3000, y: 3000, r: 32, known: false, revealed: 0 }; W.anoms = [a]; const art = { id: 3, type: "soul", x: 3005, y: 3002, anom: 9 }; W.arts = [art];
    const hidden = artSeen(art); a.known = true; const shown = artSeen(art); a.known = false; a.revealed = 5; const flash = artSeen(art); const loose = artSeen({ id: 4, type: "soul", x: 0, y: 0, anom: 0 });
    return { hidden, shown, flash, loose };
  })()`);
  assert.equal(o.hidden, false); assert.equal(o.shown, true); assert.equal(o.flash, true); assert.equal(o.loose, false);
});

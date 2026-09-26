"use strict";
// Защитные тесты баланса «Обочины»: не «правильные» числа, а границы, за которые правка конфига не должна уходить незаметно.
// Если тест упал после осознанной правки — посмотри `npm run balance:zone` и сдвинь границу вместе с правкой.
const test = require("node:test");
const assert = require("node:assert/strict");
const b = require("./zone-balance");
const { CFG } = b;

const pistol = CFG.weapons.pistol;
const dps = w => w.dmg * w.pellets / w.cd;

test("оружие: у каждого платного есть своя ниша относительно пистолета", () => {
  const tin = CFG.mut.tin;
  for (const [k, w] of Object.entries(CFG.weapons)) {
    if (k === "pistol") continue;
    const niche = w.dmg * w.pellets > pistol.dmg || dps(w) > dps(pistol) || w.range > pistol.range || b.timeToKill(w, tin) < b.timeToKill(pistol, tin);
    assert.ok(niche, `${k}: ничем не лучше пистолета за ${w.price} ₽`);
  }
});

test("оружие: секунда стрельбы не дороже утроенной секунды пистолета", () => {
  const per = w => b.shotCost(w) / w.cd;
  for (const [k, w] of Object.entries(CFG.weapons)) assert.ok(per(w) <= per(pistol) * 3, `${k}: ${per(w).toFixed(1)} ₽/с`);
});

test("оружие: платное стоит не больше 1000 ₽ и открывается не позже 3 уровня мастерской", () => {
  const paid = Object.entries(CFG.weapons).filter(([, w]) => w.price > 0);
  for (const [k, w] of paid) assert.ok(w.price <= 1000, `${k}: ${w.price}`);
  for (const [k, w] of paid) assert.ok((w.lvl || 1) <= 3, `${k}: мастерская имеет только 3 уровня`);
});

test("бой: патроны на убийство не дороже 1.5× добычи с туши (стрелять по мутантам не убыточно)", () => {
  for (const [k, m] of Object.entries(CFG.mut)) {
    const cost = b.shotsToKill(pistol, m) * b.shotCost(pistol);
    assert.ok(cost <= b.lootValue(m) * 1.5, `${k}: патроны ${cost}, добыча ${b.lootValue(m).toFixed(1)}`);
  }
});

test("бой: игрок живёт под атакой мутанта не меньше 3 секунд", () => {
  for (const [k, m] of Object.entries(CFG.mut)) assert.ok(b.timeToDie(m) >= 3, `${k}: ${b.timeToDie(m).toFixed(1)} с`);
});

test("бой: опыт за убийство в разумных границах на единицу здоровья", () => {
  for (const [k, m] of Object.entries(CFG.mut)) { const r = m.xp / m.hp; assert.ok(r >= 0.08 && r <= 0.6, `${k}: ${r.toFixed(2)} опыта на HP`); }
});

test("аномалии: награда/риск в пределах 1..25 (нет ни «даром», ни «бессмысленно опасных»)", () => {
  for (const [k, a] of Object.entries(CFG.anoms)) {
    const ratio = b.artAvg(a) / Math.max(1, b.anomRisk(Object.assign({ type: k }, a)));
    assert.ok(ratio >= 1 && ratio <= 25, `${k}: ${ratio.toFixed(2)}`);
  }
});

test("артефакты: цены до 400, пустышка дешёвая и без эффектов", () => {
  for (const [k, a] of Object.entries(CFG.arts)) assert.ok(a.val <= 400, `${k}: ${a.val}`);
  const dud = CFG.arts.dud; assert.ok(dud.val <= 10 && Object.keys(dud.fx).length === 0);
});

test("предметы: цена покупки не ниже цены продажи (нет арбитража у торговца)", () => {
  for (const [k, it] of Object.entries(CFG.items)) if (it.buy) assert.ok(it.buy / (it.pack || 1) >= it.val, `${k}: buy ${it.buy}, val ${it.val}`);
});

test("рецепты: выход стоит от 0.5× до 7× материалов", () => {
  for (const r of CFG.recipes) {
    const { cost, out } = b.recipeInfo(r); assert.ok(out >= cost * 0.5 && out <= cost * 7, `${r.id}: материалы ${cost}, выход ${out.toFixed(0)}`);
  }
});

test("подземелье: враги — не убивают быстрее 3 с, опыт на HP в границах, вес по секторам растёт для сильных видов", () => {
  for (const [k, e] of Object.entries(CFG.dungeon.enemies)) {
    const i = b.dungeonEnemy(e); assert.ok(i.timeToDie >= 3, `${k}: ${i.timeToDie.toFixed(1)} с`);
    const r = e.xp / e.hp; assert.ok(r >= 0.15 && r <= 0.8, `${k}: ${r.toFixed(2)} опыта на HP`);
    assert.ok(i.ammo <= 40, `${k}: убийство пистолетом стоит ${i.ammo} ₽ патронов`);
  }
  const en = CFG.dungeon.enemies; assert.ok(en.carapace.w[3] >= en.carapace.w[2] && en.shade.w[3] >= en.shade.w[1], "опасные виды чаще в глубине");
});

test("прогрессия: до 10 уровня нужно не меньше 200 и не больше 1000 убийств слухача", () => {
  const n = b.totalXp(10) / CFG.mut.listener.xp; assert.ok(n >= 200 && n <= 1000, "убийств: " + Math.round(n));
});

"use strict";
// npm run balance:zone — таблицы баланса «Обочины». Ничего не меняет.
const b = require("./zone-balance");
const { CFG } = b;

const f = (v, n = 1) => (Number.isFinite(v) ? v.toFixed(n) : "∞");
const pad = (s, n) => String(s).padEnd(n);
const line = t => console.log("\n== " + t + " ==");

line("Оружие: dps, урон за выстрел, дальность, цена, стоимость выстрела");
for (const [k, w] of Object.entries(CFG.weapons)) {
  const dps = w.dmg * w.pellets / w.cd;
  console.log(pad(k, 9), "dps", pad(f(dps), 6), "за выстрел", pad(w.dmg * w.pellets, 4), "дальн.", pad(w.range, 4), "цена", pad(w.price, 4), "₽/выстрел", pad(f(b.shotCost(w), 2), 5), "₽ за секунду огня", f(b.shotCost(w) / w.cd, 1));
}

line("Выстрелов до убийства (картечь считается с 60% попаданий; огнемёт бьёт сквозь броню)");
const ws = Object.entries(CFG.weapons);
console.log(pad("моб", 10), pad("hp", 5), ws.map(([k]) => pad(k, 9)).join(""));
for (const m of Object.values(CFG.mut)) {
  const fp = m.fireproof;
  console.log(pad(m.name, 10), pad(m.hp, 5), ws.map(([k, w]) => pad(k === "flamer" && fp ? "—" : b.shotsToKill(w, m), 9)).join(""));
}

line("Убийство пистолетом: цена патронов, добыча, прибыль, опыт");
const pistol = CFG.weapons.pistol;
for (const m of Object.values(CFG.mut)) {
  const cost = b.shotsToKill(pistol, m) * b.shotCost(pistol), loot = b.lootValue(m);
  console.log(pad(m.name, 10), "патроны", pad(f(cost, 0), 4), "добыча", pad(f(loot, 0), 4), "прибыль", pad(f(loot - cost, 0), 5), "опыт", pad(m.xp, 3), "опыт/HP", f(m.xp / m.hp, 2));
}

line("Опасность мутанта: секунд до смерти игрока (100 HP) против стаи или одиночки");
for (const m of Object.values(CFG.mut)) console.log(pad(m.name, 10), "секунд", pad(f(b.timeToDie(m)), 6), m.pack ? "стая " + m.pack.join("–") : "одиночка", m.active);

line("Аномалии: оценка урона за встречу, средняя цена артефакта, награда/риск");
for (const [k, a] of Object.entries(CFG.anoms)) {
  const risk = b.anomRisk(Object.assign({ type: k }, a)), avg = b.artAvg(a);
  console.log(pad(a.name, 18), "риск", pad(f(risk, 0), 5), "арт", pad(f(avg, 0), 5), "награда/риск", f(avg / Math.max(1, risk), 2), "сектора", a.w.join("/"));
}

line("Подземелье: враги (секунд до смерти под одним; выстрелов пистолета; цена патронов; ожидаемый трофей; опыт; вес по секторам)");
for (const [k, e] of Object.entries(CFG.dungeon.enemies)) { const i = b.dungeonEnemy(e); console.log(pad(e.name, 10), "жив", pad(f(i.timeToDie), 5), "выстрелов", pad(i.shots, 3), "патроны", pad(f(i.ammo, 0), 4), "трофей", pad(f(i.drop, 0), 4), "опыт", pad(e.xp, 3), "опыт/HP", pad(f(e.xp / e.hp, 2), 5), "вес", e.w.join("/")); }

line("Артефакты: цена, вес, фон");
for (const [k, a] of Object.entries(CFG.arts)) console.log(pad(a.name, 18), pad(a.val, 5), "вес", pad(a.w, 4), "фон", pad(a.rad, 5), Object.entries(a.fx).map(([e, v]) => e + " " + v).join(", "));

line("Рецепты: материалы → выход (по цене покупки), маржа");
for (const r of CFG.recipes) { const i = b.recipeInfo(r); console.log(pad(r.name, 36), "материалы", pad(f(i.cost, 0), 5), "выход", pad(f(i.out, 0), 5), "маржа", f(i.out - i.cost, 0)); }

line("Прогрессия: суммарный опыт до уровня и слухач-убийств");
for (const lv of [2, 5, 10, 16]) console.log("уровень", pad(lv, 3), "опыт", pad(f(b.totalXp(lv), 0), 6), "≈ убийств слухача", f(b.totalXp(lv) / CFG.mut.listener.xp, 0));

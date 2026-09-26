"use strict";
// Модель баланса «Обочины»: считает таблицы по zone/config.js. Ничего не меняет.
// Используется отчётом (zone-balance-report.js) и защитными тестами (zone-balance.test.js).
const { createZone } = require("./zone-load");

const z = createZone();
const CFG = z.get("CFG");

const AMMO_COST = CFG.items.ammo.buy / CFG.items.ammo.pack;          // ₽ за патрон
const PELLET_HIT = 0.6;                                              // доля картечин, попадающих в цель на средней дистанции
const armorOf = m => m.armor || 0;

// Стоимость одного выстрела/выдоха
function shotCost(w) {
  if (w.perAmmo) return CFG.items[w.ammo].buy / w.perAmmo;
  return AMMO_COST;
}
// Урон за выстрел по цели с бронёй
function shotDmg(w, m) {
  const pierce = w.pierce ? 1 : 1 - armorOf(m);
  return w.dmg * pierce * (w.pellets > 1 ? w.pellets * PELLET_HIT : 1);
}
function shotsToKill(w, m) { return Math.ceil(m.hp / shotDmg(w, m)); }
function timeToKill(w, m) { return shotsToKill(w, m) * w.cd; }

// Ценность добычи с одного убийства: трофей (шанс снять ~0.5) + мясо (среднее 1.2 за тушу, не больше m.meat)
function lootValue(m) {
  const part = CFG.items[m.part].val * 0.5, meat = Math.min(m.meat, 1.2) * CFG.items.meat.val;
  return part + meat;
}
// Сколько секунд игрок живёт под атакой мутанта (стая — суммарно, если в контакте половина)
function timeToDie(m, hp = 100) {
  const n = m.pack ? (m.pack[0] + m.pack[1]) / 2 : 1, dps = m.dmg / m.cd * (m.pack ? 1 + (n - 1) * 0.5 : 1);
  return hp / dps;
}
// Средний урон за встречу с аномалией: время в зоне ≈ время пересечения на бегу + ожидание цикла для импульсных
function anomRisk(a) {
  const cross = (a.r * 2) / (CFG.player.speed * CFG.player.run);
  if (a.dmg && a.period) return a.dmg + (a.burn ? a.burn * 4 * 0.5 : 0);    // импульсные: один удар (+ожог)
  const dps = (a.dps || 0) + (a.coreDps ? a.coreDps * a.core : 0) + (a.metalDps ? 0 : 0);
  return Math.max(a.dmg || 0, dps * cross * 1.5, a.type === 'grinder' ? 65 * 1.4 : 0);
}
const artAvg = a => a.arts.reduce((s, id) => s + CFG.arts[id].val, 0) / a.arts.length;

// Себестоимость рецепта по «справедливой» цене материалов
function matValue(id) {
  if (id.startsWith("art:")) return CFG.arts[id.slice(4)].val;
  return CFG.items[id].val;
}
function recipeInfo(r) {
  const cost = Object.entries(r.mat).reduce((s, [id, n]) => s + matValue(id) * n, 0);
  let out;
  if (r.out[0] === "art") out = r.out[1].reduce((s, id) => s + CFG.arts[id].val, 0) / r.out[1].length;
  else { const it = CFG.items[r.out[0]]; out = it.buy ? it.buy * r.out[1] / (it.pack || 1) : it.val * r.out[1]; }   // buy указана за пачку (pack), если она есть
  return { cost, out };
}

// Опыт
const xpForLevel = n => 60 * Math.pow(n, 1.4);
function totalXp(level) { let t = 0; for (let n = 1; n < level; n++) t += xpForLevel(n); return t; }

module.exports = { z, CFG, AMMO_COST, shotCost, shotDmg, shotsToKill, timeToKill, lootValue, timeToDie, anomRisk, artAvg, recipeInfo, matValue, xpForLevel, totalXp };

"use strict";
// Кривая сложности подземелий по бот-прогонам (tests/zone-dungeon-sim.js). Бот детерминирован (свой ГСЧ), поэтому границы стабильны.
// Бот не уворачивается, так что его успех — нижняя граница человеческого. Если тест упал после осознанной правки врагов — посмотри `npm run sim:dungeon`.
const test = require("node:test");
const assert = require("node:assert/strict");
const { simulate } = require("./zone-dungeon-sim");

const N = 20;
const by = {};
for (let d = 1; d <= 4; d++) by[d] = simulate({ danger: d, n: N, careful: false });

test("кривая: потерянное здоровье строго растёт с сектором, потери в секторе 1 — почти нулевые", () => {
  const l = [1, 2, 3, 4].map(d => by[d].hpLost);
  assert.ok(l[0] < 10, "сектор 1 почти безопасен: " + l[0].toFixed(0)); assert.ok(l[0] < l[1] && l[1] < l[2] && l[2] < l[3], "рост: " + l.map(v => v.toFixed(0)));
  assert.ok(l[1] - l[0] >= 5 && l[2] - l[1] >= 15 && l[3] - l[2] >= 10, "шаги заметны: " + l.map(v => v.toFixed(0)));
});

test("исходы бота: сектора 1–2 проходятся, сектор 3 — чаще да, чем нет, сектор 4 — реально опасен, но не безнадёжен", () => {
  assert.ok(by[1].success >= 0.95, "1: " + by[1].success); assert.ok(by[2].success >= 0.85, "2: " + by[2].success);
  assert.ok(by[3].success >= 0.55 && by[3].success <= 0.95, "3: " + by[3].success); assert.ok(by[4].success >= 0.25 && by[4].success <= 0.75, "4: " + by[4].success);
  assert.ok(by[4].deaths >= 0.25, "глубина должна убивать: " + by[4].deaths); assert.ok(by[1].timeouts + by[2].timeouts + by[3].timeouts + by[4].timeouts <= 0.1, "бот не должен застревать");
});

test("в среднем подземелье проходится за 10–60 секунд, а не за минуты и не за секунды", () => {
  for (let d = 1; d <= 4; d++) assert.ok(by[d].time >= 10 && by[d].time <= 60, `${d}: ${by[d].time.toFixed(0)} с`);
});

test("враги реально участвуют: в среднем убивается больше половины (бот не обходит стороной); с сектором врагов больше", () => {
  for (let d = 1; d <= 4; d++) assert.ok(by[d].kills >= by[d].enemies * 0.5, `${d}: ${by[d].kills.toFixed(1)} из ${by[d].enemies.toFixed(1)}`);
  assert.ok(by[1].enemies < by[2].enemies && by[2].enemies < by[3].enemies && by[3].enemies <= by[4].enemies);
});

test("снаряжение помогает: самострел с фонарём и осторожностью проходит сектор 4 не хуже пистолета", () => {
  const pistol = simulate({ danger: 4, n: N, careful: true }), stealth = simulate({ danger: 4, n: N, careful: true, opts: { weapon: "crossbow", lamp: true } });
  assert.ok(stealth.success >= pistol.success - 0.05, `пистолет ${pistol.success}, скрытный набор ${stealth.success}`);
});

test("прогон бота повторяем: одинаковые параметры — одинаковый результат", () => {
  const a = simulate({ danger: 3, n: 5, careful: false }), b = simulate({ danger: 3, n: 5, careful: false });
  assert.deepEqual(a.rows.map(r => [r.result, Math.round(r.t * 10), Math.round(r.lost)]), b.rows.map(r => [r.result, Math.round(r.t * 10), Math.round(r.lost)]));
});

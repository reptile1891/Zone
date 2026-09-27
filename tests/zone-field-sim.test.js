"use strict";
// Бот-прогон вылазок в Зону (tests/zone-field-sim.js): короткий контрольный запуск — прогон завершается, числа конечны и в разумных пределах.
// Настоящий отчёт: npm run sim:field.
const test = require("node:test");
const assert = require("node:assert/strict");
const { runOne } = require("./zone-field-sim");

test("вылазка бота: короткий прогон в каждом секторе завершается корректно", () => {
  for (let s = 1; s <= 4; s++) {
    const r = JSON.parse(JSON.stringify(runOne(11 + s, s, { world: 1000 + s, minutes: 0.5 })));
    assert.ok(["ok", "dead"].includes(r.result), "исход " + r.result); assert.ok(r.t > 0 && r.t <= 30.2, "время " + r.t);
    for (const k of ["hp", "lost", "kills", "shots", "picks", "wear", "haul"]) assert.ok(Number.isFinite(r[k]) && r[k] >= 0, k + " = " + r[k]);
    assert.ok(r.hp <= 100 && r.wear <= 100); assert.ok(r.start[0] > 0 && r.start[1] > 0, "старт найден в секторе " + s);
  }
});

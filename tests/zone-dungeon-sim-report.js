"use strict";
// npm run sim:dungeon [N] — бот проходит подземелья каждого сектора; печатает исходы. Ничего не меняет.
const { simulate } = require("./zone-dungeon-sim");
const n = +process.argv[2] || 24, pct = v => (v * 100).toFixed(0).padStart(3) + "%", f = (v, d = 1) => v.toFixed(d).padStart(5);
console.log(`Бот-прогон подземелий: ${n} прогонов на сектор (нижняя граница: бот не уворачивается)\n`);
for (const careful of [false, true]) {
  console.log(careful ? "== Осторожный (крадётся, стреляет по преследующим) ==" : "== Обычный (идёт шагом, стреляет по видимым) ==");
  console.log("сектор  дошёл  погиб  таймаут  потеряно HP  время с   аптечек  убито/врагов   патронов");
  for (let d = 1; d <= 4; d++) {
    const r = simulate({ danger: d, n, careful });
    console.log(`  ${d}     ${pct(r.success)}   ${pct(r.deaths)}    ${pct(r.timeouts)}     ${f(r.hpLost, 0)}         ${f(r.time, 0)}     ${f(r.meds)}     ${f(r.kills)}/${f(r.enemies)}    ${f(r.ammo, 0)}`);
  }
  console.log("");
}

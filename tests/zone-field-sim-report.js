"use strict";
// npm run sim:field [N] [минут] — бот делает вылазки в каждом секторе Зоны; печатает добычу и риск. Ничего не меняет.
const { simulate } = require("./zone-field-sim");
const n = +process.argv[2] || 12, minutes = +process.argv[3] || 4, pct = v => (v * 100).toFixed(0).padStart(3) + "%", f = (v, d = 0) => v.toFixed(d).padStart(6);
console.log(`Бот-прогон вылазок: ${n} прогонов на сектор по ${minutes} мин игрового времени (нижняя граница: бот не берёт артефакты из аномалий, не уворачивается)\n`);
console.log("сектор  погиб  добыча ₽  в час ₽   потеряно HP  убито  патронов  износ оружия %  аптечек  предметов  лом   схем");
for (let s = 1; s <= 4; s++) {
  const r = simulate({ sector: s, n, opts: { minutes } });
  console.log(`  ${s}     ${pct(r.deaths)}  ${f(r.haul)}   ${f(r.haul * 60 / minutes)}     ${f(r.lost)}      ${f(r.kills, 1)}  ${f(r.ammo, 1)}    ${f(r.wear, 1)}          ${f(r.meds, 1)}  ${f(r.picks, 1)}   ${f(r.scrap, 1)} ${f(r.circuit, 1)}`);
}

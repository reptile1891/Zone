'use strict';
// Быстрая панель: кнопка 1 — всегда ближний бой (нож, Melee); кнопки 2–9 пустые, игрок сам раскладывает по ним что угодно — расходники, болты,
// приманку, шок, крюк и даже огнестрел («weapon», хоть на 6-ю). В начале игры пистолет лежит на кнопке 2.
//   Перекладывание — в инвентаре (inv.js): взять вещь и кликнуть по кнопке; занятая кнопка обменивается. Раскладка — P.quick (в сохранении, P.quickV — версия);
//   heldNames в main.js — «живой» список (null — пусто), по нему работают клавиши 1–9, колесо, касания и подсказки.
const Quick = {
  V: 2,
  DEFAULT: ['melee', 'weapon', null, null, null, null, null, null, null],
  // что можно поставить на кнопку 2–9 (ближний бой стоит на первой всегда)
  can(id) { return id === 'weapon' || (id !== 'melee' && !!CFG.items[id] && (['bolt', 'lure', 'shock', 'hook'].includes(id) || !!CFG.items[id].use)); },
  layout() {
    const q = Array.isArray(P.quick) && P.quickV === this.V ? P.quick : this.DEFAULT, L = this.DEFAULT.map((d, i) => (i === 0 ? 'melee' : this.can(q[i]) ? q[i] : null)), seen = new Set();
    return L.map(x => (x && seen.has(x) ? null : (x && seen.add(x), x)));   // одна вещь — одна кнопка
  },
  // применить раскладку игрока к живому списку (новая игра, загрузка); старые сохранения (полная панель) начинают с пустой
  apply() { const L = this.layout(); P.quick = L.slice(); P.quickV = this.V; for (let i = 0; i < L.length; i++) heldNames[i] = L[i]; },
  // поставить вещь id на кнопку n (0-based, 1..8); id = null — очистить; если вещь стояла на другой кнопке, кнопки меняются
  assign(n, id) {
    if (n < 1 || n >= this.DEFAULT.length || (id !== null && !this.can(id))) return false;
    const L = this.layout(); if (id === null) { L[n] = null; P.quick = L; this.apply(); return true; }
    const from = L.indexOf(id); if (from === n) return true;
    if (from > 0) L[from] = L[n]; L[n] = id; P.quick = L; this.apply(); return true;
  },
  reset() { P.quick = this.DEFAULT.slice(); P.quickV = this.V; this.apply(); },
  name(id) { return id === 'weapon' ? Wpn.name(P.weapon) : id === 'melee' ? Melee.cur().name : CFG.items[id] ? CFG.items[id].name : id; },
  icon(id) { return id === 'weapon' ? Icons.html('w_' + Wpn.base(P.weapon)) : id === 'melee' ? Melee.cur().icon : CFG.items[id] ? CFG.items[id].icon : ''; },
};

(function () {
  Quick.apply();
  const _rp = resetPlayer; resetPlayer = function () { _rp(); Quick.reset(); };
  const _al = Meta.afterLoad; Meta.afterLoad = function () { _al.call(this); Quick.apply(); };
  const _click = Meta.click; Meta.click = function (a, arg, arg2, u) {
    if (a === 'qreset') { Quick.reset(); return true; }
    return _click.call(this, a, arg, arg2, u);
  };
  const _ie = Meta.invExtra; Meta.invExtra = function () {
    return _ie.call(this) + '<div class="stat" style="margin-top:6px">Быстрая панель: возьми вещь или оружие и кликни по кнопке 2–9. Кнопка 1 — нож. <button class="btn" data-a="qreset">Сбросить раскладку</button></div>';
  };
})();

'use strict';
// Быстрая панель: кнопка 1 — всегда ближний бой (текущий нож, Melee); кнопки 2–9 пустые, игрок сам раскладывает по ним что угодно: расходники, болты, приманку, шок, крюк
// и ЛЮБОЕ своё оружие — каждый ствол и каждый нож отдельной кнопкой. В начале игры пистолет лежит на кнопке 2.
//   Записи кнопки: 'melee' (только на 1) · 'w:<id>' — огнестрел (выбрав кнопку, берёшь именно его) · 'k:<id>' — нож · id предмета · null.
//   Перекладывание — в инвентаре (inv.js): взял вещь или оружие на вкладке, кликнул по кнопке внизу. Оружие не «лежит в рюкзаке» — оно всегда числится во вкладке «Оружие»;
//   если оружие продано или исчезло, его кнопка освобождается. Раскладка — P.quick (P.quickV = 3); heldNames в main.js — «живой» список для клавиш, колеса, касаний и подсказок.
const Quick = {
  V: 3,
  def() { return ['melee', 'w:' + ((P.weapons || []).includes('pistol') ? 'pistol' : P.weapon || 'pistol'), null, null, null, null, null, null, null]; },
  gun(h) { return typeof h === 'string' && h.startsWith('w:') ? h.slice(2) : null; },
  knife(h) { return typeof h === 'string' && h.startsWith('k:') ? h.slice(2) : null; },
  // что можно поставить на кнопку 2–9 (ближний бой стоит на первой всегда)
  can(id) {
    if (!id || id === 'melee') return false;
    if (this.gun(id)) return (P.weapons || []).includes(this.gun(id));
    if (this.knife(id)) return (P.knives || []).includes(this.knife(id));
    return !!CFG.items[id] && (['bolt', 'lure', 'shock', 'hook'].includes(id) || !!CFG.items[id].use);
  },
  layout() {
    const ok = Array.isArray(P.quick) && (P.quickV === 2 || P.quickV === 3), q = ok ? P.quick.map(x => (x === 'weapon' ? 'w:' + P.weapon : x)) : this.def(), seen = new Set();   // v2: «weapon» = текущий ствол
    return this.def().map((d, i) => (i === 0 ? 'melee' : this.can(q[i]) ? q[i] : null)).map(x => (x && seen.has(x) ? null : (x && seen.add(x), x)));
  },
  // применить раскладку игрока к живому списку (новая игра, загрузка); старые сохранения (полная панель) начинают с пустой
  apply() { const L = this.layout(); P.quick = L.slice(); P.quickV = this.V; for (let i = 0; i < L.length; i++) heldNames[i] = L[i]; },
  // раскладка в списке расходится с законной (оружие продано и т.п.)
  valid() { const L = this.layout(); return L.every((x, i) => x === heldNames[i]); },
  // выбранная кнопка держит ствол — он и в руках
  syncWeapon() { const g = this.gun(heldNames[P.sel]); if (g && P.weapon !== g && (P.weapons || []).includes(g)) P.weapon = g; },
  // поставить вещь id на кнопку n (0-based, 1..8); id = null — очистить; если вещь стояла на другой кнопке, кнопки меняются
  assign(n, id) {
    if (n < 1 || n >= 9 || (id !== null && !this.can(id))) return false;
    const L = this.layout(); if (id === null) { L[n] = null; P.quick = L; this.apply(); return true; }
    const from = L.indexOf(id); if (from === n) return true;
    if (from > 0) L[from] = L[n]; L[n] = id; P.quick = L; this.apply(); return true;
  },
  reset() { P.quick = this.def(); P.quickV = this.V; this.apply(); },
  name(id) { const g = this.gun(id), k = this.knife(id); return g ? Wpn.name(g) : k ? Melee.DEF[k].name : id === 'melee' ? Melee.cur().name : CFG.items[id] ? CFG.items[id].name : id; },
  icon(id) { const g = this.gun(id), k = this.knife(id); return g ? Icons.html('w_' + Wpn.base(g)) : k ? Melee.DEF[k].icon : id === 'melee' ? Melee.cur().icon : CFG.items[id] ? CFG.items[id].icon : ''; },
  // число под значком: патроны ствола или запас вещи; у ножей числа нет
  count(id) { const g = this.gun(id); return g ? invCount(Wpn.of(g).ammo || 'ammo') : id && id !== 'melee' && !this.knife(id) ? invCount(id) : ''; },
};

(function () {
  Quick.apply();
  const _rp = resetPlayer; resetPlayer = function () { _rp(); Quick.reset(); };
  const _al = Meta.afterLoad; Meta.afterLoad = function () { _al.call(this); Quick.apply(); };
  const _upd = update; update = function (dt) { Quick.syncWeapon(); _upd(dt); Quick._t = (Quick._t || 0) + dt; if (Quick._t > 0.5) { Quick._t = 0; if (!Quick.valid()) Quick.apply(); } };   // проданное оружие уходит с кнопки
  const _click = Meta.click; Meta.click = function (a, arg, arg2, u) {
    if (a === 'qreset') { Quick.reset(); return true; }
    return _click.call(this, a, arg, arg2, u);
  };
  const _ie = Meta.invExtra; Meta.invExtra = function () {
    return _ie.call(this) + '<div class="stat" style="margin-top:6px">Быстрый доступ: возьми вещь или оружие и кликни по кнопке 2–9 внизу. Кнопка 1 — нож. <button class="btn" data-a="qreset">Сбросить раскладку</button></div>';
  };
  const _tq = Tip.quick; Tip.quick = function (i) { const h = heldNames[i], g = Quick.gun(h), k = Quick.knife(h); return g ? Tip.weapon(g) : k ? Melee.tip(k) : _tq.call(this, i); };
})();

'use strict';
// Быстрая панель: игрок сам решает, что лежит под кнопками 2–9 (слот 1 — всегда оружие).
//   В рюкзаке у подходящих вещей (расходники, болты, приманка, шок, крюк) кнопка «⚡» → выбрать номер слота; вещь, уже стоявшая в другом слоте, меняется местами.
//   Раскладка — P.quick (в сохранении); heldNames в main.js — «живой» список, по которому работают клавиши 1–9, колесо, касания и подсказки.
const Quick = {
  DEFAULT: ['weapon', 'bolt', 'medkit', 'food', 'antirad', 'lure', 'splint', 'shock', 'hook'],
  // что можно поставить на панель
  can(id) { return id !== 'weapon' && !!CFG.items[id] && (['bolt', 'lure', 'shock', 'hook'].includes(id) || !!CFG.items[id].use); },
  layout() { const q = Array.isArray(P.quick) ? P.quick : []; return this.DEFAULT.map((d, i) => (i === 0 ? 'weapon' : this.can(q[i]) ? q[i] : d)); },
  // применить раскладку игрока к живому списку (вызывается при новой игре и загрузке)
  apply() { const L = this.layout(); P.quick = L.slice(); for (let i = 0; i < L.length; i++) heldNames[i] = L[i]; },
  // поставить вещь id на слот n (0-based, 1..8); если она стояла в другом слоте — слоты меняются
  assign(n, id) {
    if (n < 1 || n >= this.DEFAULT.length || !this.can(id)) return false;
    const L = this.layout(), from = L.indexOf(id); if (from === n) return true;
    if (from > 0) L[from] = L[n]; L[n] = id; P.quick = L; this.apply(); return true;
  },
  reset() { P.quick = this.DEFAULT.slice(); this.apply(); },
  // строка выбора слота под списком рюкзака
  chooser(u) {
    if (!u.qpick || !this.can(u.qpick)) return '';
    const L = this.layout(); let h = '<div class="note"><b>' + CFG.items[u.qpick].icon + ' ' + CFG.items[u.qpick].name + '</b> — на какую кнопку быстрой панели поставить?<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">';
    for (let i = 1; i < L.length; i++) h += '<button class="btn" data-a="qset:' + i + '" title="Сейчас: ' + (CFG.items[L[i]] ? CFG.items[L[i]].name : L[i]) + '">' + (i + 1) + ' ' + (CFG.items[L[i]] ? CFG.items[L[i]].icon : '') + '</button>';
    return h + '<button class="btn" data-a="qcancel">Отмена</button></div></div>';
  },
};

(function () {
  Quick.apply();
  const _rp = resetPlayer; resetPlayer = function () { _rp(); P.quick = Quick.DEFAULT.slice(); Quick.apply(); };
  const _al = Meta.afterLoad; Meta.afterLoad = function () { _al.call(this); Quick.apply(); };
  const _click = Meta.click; Meta.click = function (a, arg, arg2, u) {
    if (a === 'qp') { u.qpick = u.qpick === arg ? null : arg; setTimeout(() => { panel.scrollTop = panel.scrollHeight; }, 0); return true; }
    if (a === 'qset') { if (u.qpick && Quick.assign(+arg, u.qpick)) { log('На кнопку ' + (+arg + 1) + ' — ' + CFG.items[u.qpick].name + '.', '#a8c890'); } u.qpick = null; return true; }
    if (a === 'qcancel') { u.qpick = null; return true; }
    if (a === 'qreset') { Quick.reset(); u.qpick = null; return true; }
    return _click.call(this, a, arg, arg2, u);
  };
  const _ie = Meta.invExtra; Meta.invExtra = function () {
    const u = G.ui || {};
    return Quick.chooser(u) + _ie.call(this) + '<div class="stat" style="margin-top:6px">Быстрая панель: возьми вещь в рюкзаке и кликни по кнопке 2–9. ' + '<button class="btn" data-a="qreset">Сбросить раскладку</button></div>';
  };
})();

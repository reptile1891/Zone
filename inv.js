'use strict';
// Инвентарь «point & click»: рюкзак и ящик хранения — сетки ячеек с иконками. Клик по вещи берёт её «в руку» (значок ходит за курсором),
// второй клик кладёт: в другую ячейку рюкзака (порядок; одинаковые стопки сливаются), в контейнер для артефактов, на кнопку быстрой панели
// (вещь остаётся в рюкзаке, кнопка запоминает её), в ящик и обратно. Правая кнопка мыши по вещи — использовать (артефакт — в контейнер).
// Под сеткой строка «В руке» с кнопками: использовать, выбросить, в ящик. Зоны ячеек: inv, stash, equip (контейнеры), quick (кнопки 2–9).
const Inv = {
  COLS: 6,
  zone(z) { return z === 'inv' ? P.inv : z === 'stash' ? P.stash : z === 'equip' ? P.equip : null; },
  // вещь в ячейке зоны (для быстрой панели — id вещи)
  at(z, i) { if (z === 'quick') return heldNames[i] && heldNames[i] !== 'weapon' ? heldNames[i] : null; const a = this.zone(z); return a && a[i] ? a[i] : null; },
  handItem(u) { return u && u.hand ? this.at(u.hand.z, u.hand.i) : null; },
  name(z, x) { return z === 'quick' ? CFG.items[x].name : z === 'equip' ? CFG.arts[x.art].name : Meta.itemLabel(x); },
  // ---- перемещения ----
  stackable(s) { return s && !s.art && !s.g && !CFG.items[s.id].pack0; },
  moveInv(from, to) {
    const a = P.inv; if (from < 0 || from >= a.length) return; const s = a[from];
    const t = a[to]; if (t && to !== from && this.stackable(s) && this.stackable(t) && s.id === t.id) { t.n += s.n; a.splice(from, 1); return; }   // одинаковые стопки сливаются
    a.splice(from, 1); a.splice(Math.min(to, a.length), 0, s);
  },
  equipTo(from, slot) {
    const s = P.inv[from]; if (!s || !s.art) return log('В контейнер кладут только артефакты.');
    if (!P.known[s.art]) return log('Неизвестный артефакт в контейнер не положишь — опознай его в Торговом доме.');
    const old = P.equip[slot]; P.equip[slot] = Gear.slotOf(s); P.inv.splice(from, 1); if (old) invAdd('art', 1, old.art, old.q);
  },
  unequip(slot) { const e = P.equip[slot]; if (e) { P.equip[slot] = null; invAdd('art', 1, e.art, e.q); } },
  // взять/положить по клику на ячейку (z, i); u — состояние панели
  click(u, z, i) {
    const h = u.hand;
    if (!h) {
      if (z === 'quick' && i === 0) { Meta.cycleWeapon(); return; }
      if (this.at(z, i)) u.hand = { z, i };
      return;
    }
    if (h.z === z && h.i === i) { u.hand = null; return; }
    const it = this.at(h.z, h.i); u.hand = null; if (!it) return;
    if (h.z === 'inv') {
      if (z === 'inv') this.moveInv(h.i, i);
      else if (z === 'equip') this.equipTo(h.i, i);
      else if (z === 'quick') { if (Quick.can(it.id)) { if (Quick.assign(i, it.id)) log('На кнопку ' + (i + 1) + ' — ' + CFG.items[it.id].name + '.', '#a8c890'); } else log('На панель ставят расходники, болты, приманку, шок и крюк.'); }
      else if (z === 'stash') Camp.click('stash', String(h.i));
    } else if (h.z === 'stash') { if (z === 'inv' || z === 'stash') Camp.click('unstash', String(h.i)); }
    else if (h.z === 'equip') {
      if (z === 'equip') { const a = P.equip[h.i]; P.equip[h.i] = P.equip[i]; P.equip[i] = a; }
      else if (z === 'inv') this.unequip(h.i);
    } else if (h.z === 'quick') {
      if (z === 'quick' && i > 0) Quick.assign(i, it);
      else if (z === 'inv') { Quick.assign(h.i, Quick.DEFAULT[h.i]); }   // унести с панели — кнопка возвращает прежнюю вещь
    }
  },
  // действия над вещью в руке
  act(u, what) {
    const h = u.hand; if (!h || h.z !== 'inv') return; const s = P.inv[h.i]; if (!s) { u.hand = null; return; }
    u.hand = null;
    if (what === 'use') { if (s.art) { const slot = P.equip.indexOf(null); if (slot < 0) log('Контейнеры заняты.'); else this.equipTo(h.i, slot); } else if (CFG.items[s.id].use) useItem(s.id); }
    else if (what === 'drop') panelClick('drop:' + h.i);
    else if (what === 'stash') Camp.click('stash', String(h.i));
  },
  // ---- разметка ----
  cell(z, i, s, u) {
    const sel = u.hand && u.hand.z === z && u.hand.i === i; let inner = '', col = '', badge = '';
    if (z === 'quick') {
      const id = heldNames[i], w = id === 'weapon', n = w ? invCount(Wpn.of(P.weapon).ammo || 'ammo') : invCount(id);
      inner = (w ? Icons.html('w_' + Wpn.base(P.weapon)) : CFG.items[id].icon) + '<span class="k">' + (i + 1) + '</span><span class="n">' + n + '</span>';
      return '<div class="slot gc' + (sel ? ' sel' : '') + (n === 0 && !w ? ' z' : '') + '" data-a="cell:quick:' + i + '">' + inner + '</div>';
    }
    if (!s) return '<div class="slot gc e' + (u.hand && u.hand.z !== z ? ' hint' : '') + '" data-a="cell:' + z + ':' + i + '"></div>';
    if (z === 'equip') { inner = Codex.artHtml(s.art); col = Gear.grade(s.q).col; }
    else {
      inner = itemIcon(s); if (s.n > 1) badge += '<span class="n">' + s.n + '</span>';
      if (s.art) col = P.known[s.art] ? Gear.grade(s.q).col : '#6a6a5a'; else if (s.g) col = Gear.TIERS[s.g.rar || 0].col;
      if (z === 'inv' && Gear.isWorn(s)) badge += '<span class="w">★</span>';
    }
    return '<div class="slot gc' + (sel ? ' sel' : '') + '" data-a="cell:' + z + ':' + i + '" style="' + (col ? 'border-color:' + col : '') + '">' + inner + badge + '</div>';
  },
  grid(z, u, min) {
    const a = this.zone(z), cells = Math.max(min, Math.ceil((a.length + 1) / this.COLS) * this.COLS); let h = '<div class="ggrid">';
    for (let i = 0; i < cells; i++) h += this.cell(z, i, a[i], u);
    return h + '</div>';
  },
  handBar(u) {
    const it = this.handItem(u); if (!it) return '<div class="stat" style="margin-top:6px">Кликни по вещи, чтобы взять её в руку, и ещё раз — куда положить. Правая кнопка — использовать.</div>';
    const z = u.hand.z, name = this.name(z, it);
    let h = '<div class="note" style="margin-top:6px">В руке: <b>' + name + '</b>';
    if (z === 'inv') {
      const s = P.inv[u.hand.i]; h += ' <span style="display:inline-flex;gap:6px;flex-wrap:wrap">';
      if (s.art || CFG.items[s.id].use) h += btn('hact:use', s.art ? 'В контейнер' : 'Использовать');
      if (u.k === 'storage') h += btn('hact:stash', 'В ящик'); h += btn('hact:drop', 'Выбросить') + '</span>';
    }
    return h + ' <span class="stat">· клик по пустой или другой ячейке — положить, по этой же — отпустить</span></div>';
  },
  skillsHtml() {
    let h = '<h3>Навыки — очков: ' + P.sp + ' · опыт ' + Math.floor(P.xp) + '/' + Math.floor(60 * Math.pow(P.lvl, 1.4)) + '</h3>';
    for (const k in CFG.skills) { const s = CFG.skills[k]; h += row('', s.name + ' <b>' + P.sk[k] + '/' + s.max + '</b>', s.desc, btn('skill:' + k, '+', !P.sp || P.sk[k] >= s.max)); }
    return h + '<h3>Записки (' + P.notes.length + ')</h3>' + (P.notes.map(n => '<div class="note">' + n.txt + '</div>').join('') || '<div class="stat">Нет.</div>');
  },
  html(u) {
    if (u.k === 'storage') {
      const lim = Camp.stashLimit();
      return '<div class="x" data-a="close">✕ Esc</div><h2>Ящик хранения</h2><div class="stat">Вещи здесь в безопасности. Не забывай про вес: ' + weight().toFixed(1) + ' / ' + carryCap() + ' кг.</div>' +
        '<div class="cols"><div><h3>Рюкзак</h3>' + this.grid('inv', u, 24) + '</div><div><h3>Ящик — ' + P.stash.length + ' / ' + (lim > 999 ? '∞' : lim) + '</h3>' + this.grid('stash', u, 24) + '</div></div>' + this.handBar(u) +
        '<div class="stat" style="margin-top:8px">' + Camp.bonusText('storage') + ' ' + btn('ubuild:storage', 'Улучшить ящик', !Camp.canUp('storage')) + '</div>';
    }
    let h = '<div class="x" data-a="close">✕ Esc</div><h2>Снаряжение</h2><div class="cols"><div><h3>Рюкзак — ' + weight().toFixed(1) + ' / ' + carryCap() + ' кг</h3>' + this.grid('inv', u, 24) + this.handBar(u) + '</div><div><h3>Контейнеры для артефактов</h3><div class="ggrid">';
    P.equip.forEach((e, i) => { h += this.cell('equip', i, e, u); }); h += '</div><div class="stat">' + P.equip.map(a => a ? Meta.itemLabel(Gear.asSlot(a)) : '—').join(' · ') + '</div>';
    h += '<h3>Быстрая панель</h3><div class="ggrid q">'; for (let i = 0; i < heldNames.length; i++) h += this.cell('quick', i, null, u); h += '</div><div class="stat">Возьми вещь и кликни по кнопке 2–9. Кнопка 1 — оружие (клик меняет ствол).</div>';
    h += '<h3>Надето</h3>'; for (const k of Gear.KINDS) { const b = Gear.best(k); h += '<div class="stat">' + Gear.KINDNAME[k] + ': <b>' + (b ? Meta.itemLabel(b) : '—') + '</b></div>'; }
    return h + this.skillsHtml() + '</div></div>' + Meta.invExtra();
  },
  // значок вещи в руке ходит за курсором
  syncHand(u) {
    const el = this.el; if (!el) return; const it = u && u.hand ? this.handItem(u) : null;
    if (!it) { el.style.display = 'none'; return; }
    const z = u.hand.z; el.innerHTML = z === 'quick' ? CFG.items[it].icon : z === 'equip' ? Codex.artHtml(it.art) : itemIcon(it); el.style.display = 'block';
  },
};

(function () {
  Inv.el = typeof document !== 'undefined' && document.createElement ? document.createElement('div') : null;
  if (Inv.el && Inv.el.style && document.body && document.body.appendChild) { Inv.el.id = 'hand'; try { document.body.appendChild(Inv.el); } catch (e) { Inv.el = null; } }
  if (typeof addEventListener === 'function') addEventListener('mousemove', e => { if (Inv.el && Inv.el.style && Inv.el.style.display === 'block') { Inv.el.style.left = (e.clientX + 6) + 'px'; Inv.el.style.top = (e.clientY + 6) + 'px'; } });
  const _render = Camp.render; Camp.render = function (u) {
    if (u.k === 'inv' || u.k === 'storage') { panel.style.display = 'block'; const st = panel.scrollTop; panel.innerHTML = Inv.html(u); panel.scrollTop = st; Inv.syncHand(u); return true; }
    Inv.syncHand(null); return _render.call(this, u);
  };
  const _click = Meta.click; Meta.click = function (a, arg, arg2, u) {
    if (a === 'cell') { Inv.click(u, arg, +arg2); return true; }
    if (a === 'hact') { Inv.act(u, arg); return true; }
    return _click.call(this, a, arg, arg2, u);
  };
  // подсказки на ячейках
  const _fa = Tip.fromAttr; Tip.fromAttr = function (attr) {
    const [a, z, i] = String(attr).split(':');
    if (a === 'cell') { const it = Inv.at(z, +i); if (!it) return null; return z === 'inv' ? Tip.slot(it) : z === 'stash' ? Tip.slot(it) : z === 'equip' ? Tip.art(it.art, null, it.q) : Tip.quick(+i); }
    return _fa.call(this, attr);
  };
  // правая кнопка по вещи рюкзака — использовать
  if (typeof panel !== 'undefined' && panel && panel.addEventListener) panel.addEventListener('contextmenu', e => {
    const c = e.target && e.target.closest && e.target.closest('[data-a^="cell:inv:"]'); if (!c || !G.ui || (G.ui.k !== 'inv' && G.ui.k !== 'storage')) return;
    e.preventDefault(); const i = +c.dataset.a.split(':')[2]; if (!P.inv[i]) return; G.ui.hand = { z: 'inv', i }; Inv.act(G.ui, 'use'); renderPanel();
  });
  // выход из инвентаря: рука пуста, значок скрыт
  const _cp = closePanel; closePanel = function () { Inv.syncHand(null); return _cp(); };
})();

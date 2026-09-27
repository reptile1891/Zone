'use strict';
// Инвентарь «point & click»: рюкзак и ящик хранения — сетки ячеек с иконками. Клик по вещи берёт её «в руку» (значок ходит за курсором),
// второй клик кладёт: в другую ячейку рюкзака (порядок; одинаковые стопки сливаются), в контейнер для артефактов, на кнопку быстрой панели
// (вещь остаётся в рюкзаке, кнопка запоминает её), в ящик и обратно. Правая кнопка мыши по вещи — использовать (артефакт — в контейнер).
// Стопки переносятся ПО ОДНОЙ штуке (Shift+клик или кнопка «Все» — вся стопка; «+1» / «−1» — сколько нести).
// Быстрый доступ раскладывается прямо на нижней панели: взял вещь в инвентаре — кликнул по кнопке внизу (окно инвентаря приподнято и не закрывает панель).
// Под сеткой строка «В руке» с кнопками: использовать, выбросить, в ящик. Зоны ячеек: inv, stash, equip (контейнеры), gun, melee; quick — кнопки нижней панели.
const Inv = {
  COLS: 6,
  zone(z) { return z === 'inv' ? P.inv : z === 'stash' ? P.stash : z === 'equip' ? P.equip : null; },
  // вещь в ячейке зоны (для быстрой панели — id вещи)
  at(z, i) { if (z === 'quick') return i > 0 && heldNames[i] ? heldNames[i] : null; if (z === 'gun') return 'weapon'; const a = this.zone(z); return a && a[i] ? a[i] : null; },
  handItem(u) { return u && u.hand ? this.at(u.hand.z, u.hand.i) : null; },
  name(z, x) { return z === 'quick' || z === 'gun' ? Quick.name(x) : z === 'equip' ? CFG.arts[x.art].name : Meta.itemLabel(x); },
  // ---- перемещения ----
  stackable(s) { return s && !s.art && !s.g && !CFG.items[s.id].pack0; },
  // Внутри рюкзака: n штук стопки — на ячейку to (та же вещь — сливаются, иначе отдельная стопка); вся стопка — меняет порядок
  moveInv(from, to, n) {
    const a = P.inv; if (from < 0 || from >= a.length) return; const s = a[from], st = this.stackable(s), t = a[to]; n = st ? Math.min(n || 1, s.n) : 1;
    if (t && to !== from && st && this.stackable(t) && t.id === s.id) { t.n += n; if (s.n > n) s.n -= n; else a.splice(from, 1); return; }
    if (st && n < s.n) { s.n -= n; a.splice(Math.min(to, a.length), 0, { id: s.id, n }); return; }
    a.splice(from, 1); a.splice(Math.min(to, a.length), 0, s);
  },
  // n штук из fromList[i] в toList (рюкзак ↔ ящик): сливаются с такой же стопкой; limit — предел ячеек ящика (0 — без предела)
  moveUnits(fromList, i, toList, n, limit) {
    const s = fromList[i]; if (!s) return; const st = this.stackable(s); n = st ? Math.min(n || 1, s.n) : 1;
    const t = st ? toList.find(x => this.stackable(x) && x.id === s.id) : null;
    if (t) t.n += n; else { if (limit && toList.length >= limit) return log('Ящик полон. Улучши его.'); toList.push(st ? { id: s.id, n } : s); }
    if (st && s.n > n) s.n -= n; else fromList.splice(i, 1);
  },
  limit() { const l = Camp.stashLimit(); return l > 999 ? 0 : l; },
  pickN(z, i) { const s = this.at(z, i); return s && (z === 'inv' || z === 'stash') && this.stackable(s) && !this.shift ? 1 : (s && s.n) || 1; },
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
      if ((z === 'quick' && i === 0) || z === 'melee') { Melee.cycle(); return; }
      if (this.at(z, i)) u.hand = { z, i, n: this.pickN(z, i) };
      return;
    }
    if (h.z === z && h.i === i) { u.hand = null; return; }
    const it = this.at(h.z, h.i); u.hand = null; if (!it) return;
    if (h.z === 'inv') {
      if (z === 'inv') this.moveInv(h.i, i, h.n);
      else if (z === 'equip') this.equipTo(h.i, i);
      else if (z === 'quick') { if (Quick.can(it.id)) { if (Quick.assign(i, it.id)) log('На кнопку ' + (i + 1) + ' — ' + CFG.items[it.id].name + '.', '#a8c890'); } else log('На панель ставят расходники, болты, приманку, шок и крюк.'); }
      else if (z === 'stash') this.moveUnits(P.inv, h.i, P.stash, h.n, this.limit());
    } else if (h.z === 'stash') { if (z === 'inv') this.moveUnits(P.stash, h.i, P.inv, h.n, 0); }
    else if (h.z === 'equip') {
      if (z === 'equip') { const a = P.equip[h.i]; P.equip[h.i] = P.equip[i]; P.equip[i] = a; }
      else if (z === 'inv') this.unequip(h.i);
    } else if (h.z === 'quick') {
      if (z === 'quick' && i > 0) Quick.assign(i, it);
      else if (z === 'inv' || z === 'gun') Quick.assign(h.i, null);   // унести с панели — кнопка освобождается
    } else if (h.z === 'gun') { if (z === 'quick' && i > 0) { Quick.assign(i, 'weapon'); log('На кнопку ' + (i + 1) + ' — ' + Quick.name('weapon') + '.', '#a8c890'); } }
  },
  // действия над вещью в руке
  act(u, what) {
    const h = u.hand; if (!h || (h.z !== 'inv' && h.z !== 'stash')) return; const list = h.z === 'inv' ? P.inv : P.stash, s = list[h.i]; if (!s) { u.hand = null; return; }
    if (what === 'more') { h.n = Math.min(s.n || 1, h.n + 1); return; }
    if (what === 'less') { h.n = Math.max(1, h.n - 1); return; }
    if (what === 'all') { h.n = s.n || 1; return; }
    u.hand = null; if (h.z === 'stash') { if (what === 'take') this.moveUnits(P.stash, h.i, P.inv, h.n, 0); return; }
    if (what === 'use') { if (s.art) { const slot = P.equip.indexOf(null); if (slot < 0) log('Контейнеры заняты.'); else this.equipTo(h.i, slot); } else if (CFG.items[s.id].use) useItem(s.id); }
    else if (what === 'drop') {
      const st = this.stackable(s), n = st ? Math.min(h.n, s.n) : 1;
      if (s.art) W.arts.push({ id: 0, type: s.art, q: s.q, x: P.x + 20, y: P.y, anom: 0 }); else W.loot.push({ x: P.x + 20, y: P.y, id: s.id, n, g: s.g });
      if (st && s.n > n) s.n -= n; else P.inv.splice(h.i, 1);
    } else if (what === 'stash') this.moveUnits(P.inv, h.i, P.stash, h.n, this.limit());
  },
  // ---- разметка ----
  cell(z, i, s, u) {
    const sel = u.hand && u.hand.z === z && u.hand.i === i; let inner = '', col = '', badge = '';
    if (z === 'gun') return '<div class="slot gc' + (sel ? ' sel' : '') + '" data-a="cell:gun:0" title="' + Quick.name('weapon') + '">' + Quick.icon('weapon') + '<span class="n">' + invCount(Wpn.of(P.weapon).ammo || 'ammo') + '</span></div>';
    if (z === 'melee') return '<div class="slot gc" data-a="cell:melee:0" title="' + Melee.cur().name + '">' + Melee.cur().icon + '</div>';
    if (z === 'quick') {
      const id = heldNames[i], w = id === 'weapon', n = w ? invCount(Wpn.of(P.weapon).ammo || 'ammo') : id && id !== 'melee' ? invCount(id) : '';
      if (!id) return '<div class="slot gc e' + (u.hand && (u.hand.z === 'inv' || u.hand.z === 'gun' || u.hand.z === 'quick') ? ' hint' : '') + '" data-a="cell:quick:' + i + '"><span class="k">' + (i + 1) + '</span></div>';
      inner = Quick.icon(id) + '<span class="k">' + (i + 1) + '</span>' + (n === '' ? '' : '<span class="n">' + n + '</span>');
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
    const it = this.handItem(u); if (!it) return '<div class="stat" style="margin-top:6px">Клик по вещи — взять одну штуку в руку, ещё клик — положить (Shift или «Все» — всю стопку). Правая кнопка — использовать. Быстрый доступ: возьми вещь и кликни по кнопке на нижней панели.</div>';
    const z = u.hand.z, name = this.name(z, it);
    let h = '<div class="note" style="margin-top:6px">В руке: <b>' + name + '</b>' + (u.hand.n > 1 || ((it.n || 1) > 1 && (z === 'inv' || z === 'stash')) ? ' ×' + u.hand.n + (it.n > u.hand.n ? ' из ' + it.n : '') : '');
    if (z === 'inv' || z === 'stash') {
      const s = it; h += ' <span style="display:inline-flex;gap:6px;flex-wrap:wrap">';
      if (this.stackable(s) && s.n > 1) h += btn('hact:less', '−1', u.hand.n <= 1) + btn('hact:more', '+1', u.hand.n >= s.n) + btn('hact:all', 'Все', u.hand.n >= s.n);
      if (z === 'stash') h += btn('hact:take', 'В рюкзак');
      else { if (s.art || CFG.items[s.id].use) h += btn('hact:use', s.art ? 'В контейнер' : 'Использовать'); if (u.k === 'storage') h += btn('hact:stash', 'В ящик'); h += btn('hact:drop', 'Выбросить'); }
      h += '</span>';
    }
    return h + ' <span class="stat">· клик по ячейке — положить, по этой же — отпустить</span></div>';
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
    h += '<h3>Оружие</h3><div class="ggrid q">' + this.cell('gun', 0, null, u) + this.cell('melee', 0, null, u) + '</div><div class="stat">Огнестрел — возьми и кликни по любой кнопке 2–9 внизу; нож (кнопка 1) — клик по нему меняет нож.</div>';
    h += '<div class="stat">Быстрый доступ — нижняя панель: возьми вещь или оружие и кликни по кнопке внизу; вещь с кнопки — в рюкзак, чтобы убрать.</div>';
    h += '<h3>Надето</h3>'; for (const k of Gear.KINDS) { const b = Gear.best(k); h += '<div class="stat">' + Gear.KINDNAME[k] + ': <b>' + (b ? Meta.itemLabel(b) : '—') + '</b></div>'; }
    return h + this.skillsHtml() + '</div></div>' + Meta.invExtra();
  },
  // значок вещи в руке ходит за курсором
  syncHand(u) {
    const q = typeof document !== 'undefined' && document.getElementById ? document.getElementById('quick') : null, it0 = u && u.hand ? this.handItem(u) : null;
    if (q && q.classList) q.classList.toggle('hold', !!it0);   // пока что-то в руке, нижняя панель подсвечена: клик по кнопке ставит вещь туда
    const el = this.el; if (!el) return; const it = it0;
    if (!it) { el.style.display = 'none'; return; }
    const z = u.hand.z; el.innerHTML = (z === 'quick' || z === 'gun' ? Quick.icon(it) : z === 'equip' ? Codex.artHtml(it.art) : itemIcon(it)) + (u.hand.n > 1 ? '<span style="font-size:13px;color:#e8d8a0"> ×' + u.hand.n + '</span>' : ''); el.style.display = 'block';
  },
};

(function () {
  Inv.el = typeof document !== 'undefined' && document.createElement ? document.createElement('div') : null;
  if (Inv.el && Inv.el.style && document.body && document.body.appendChild) { Inv.el.id = 'hand'; try { document.body.appendChild(Inv.el); } catch (e) { Inv.el = null; } }
  if (typeof addEventListener === 'function') addEventListener('mousemove', e => { if (Inv.el && Inv.el.style && Inv.el.style.display === 'block') { Inv.el.style.left = (e.clientX + 6) + 'px'; Inv.el.style.top = (e.clientY + 6) + 'px'; } });
  const _render = Camp.render; Camp.render = function (u) {
    if (panel.classList) { if (u.k === 'inv' || u.k === 'storage') panel.classList.add('inv'); else panel.classList.remove('inv'); }   // окно приподнято: нижняя панель остаётся видна
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
  const _cp = closePanel; closePanel = function () { Inv.syncHand(null); if (panel.classList) panel.classList.remove('inv'); return _cp(); };
  if (typeof panel !== 'undefined' && panel && panel.addEventListener) panel.addEventListener('click', e => { Inv.shift = !!e.shiftKey; }, true);   // Shift+клик — вся стопка
})();

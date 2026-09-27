'use strict';
// Инвентарь «point & click»: рюкзак и ящик хранения — сетки ячеек с иконками. Клик по вещи берёт её «в руку» (значок ходит за курсором),
// второй клик кладёт: в другую ячейку рюкзака (порядок; одинаковые стопки сливаются), в контейнер для артефактов, на кнопку быстрой панели
// (вещь остаётся в рюкзаке, кнопка запоминает её), в ящик и обратно. Правая кнопка мыши по вещи — использовать (артефакт — в контейнер).
// Клик по стопке берёт ВСЮ стопку; Shift+клик — одну штуку; «−1» / «+1» / «Все» в строке «В руке» — сколько нести.
// Быстрый доступ раскладывается прямо на нижней панели: взял вещь в инвентаре — кликнул по кнопке внизу (окно инвентаря приподнято и не закрывает панель).
// Под сеткой строка «В руке» с кнопками: использовать, выбросить, в ящик. Зоны ячеек: inv, stash, equip (контейнеры), gun (свои стволы), melee (свои ножи); quick — кнопки нижней панели.
// ОДИН большой инвентарь, как в Diablo: в общей сетке 10×N лежит всё — стволы, ножи, снаряжение, артефакты, расходники; справа — контейнеры артефактов и «Надето».
// Оружие берут и кликают по кнопке нижней панели — оно встаёт на неё; вернуть в инвентарь — взять с кнопки и кликнуть по сетке (кнопка освобождается, оружие остаётся в сетке).
// Магазины и верстак (shop.js) — тот же язык: «shop» — витрина (только источник для «взять в руку», не цель), «Продать»/«Опознать»/«Починить»/«Тюнинг»/«Разобрать» —
// кнопки в строке «В руке», когда держишь подходящую вещь в подходящем окне (Inv.stationButtons); Inv.shopList — текущая витрина (задаёт Shop перед рендером).
const Inv = {
  COLS: 6, BIG: 10, shopList: [],
  zone(z) { return z === 'inv' ? P.inv : z === 'stash' ? P.stash : z === 'equip' ? P.equip : null; },
  // вещь в ячейке зоны (для быстрой панели — id вещи; для витрины — сам offer-объект)
  at(z, i) {
    if (z === 'quick') return i > 0 && heldNames[i] ? heldNames[i] : null;
    if (z === 'gun') return P.weapons[i] ? 'w:' + P.weapons[i] : null;
    if (z === 'melee') return (P.knives || [])[i] ? 'k:' + P.knives[i] : null;
    if (z === 'worn') return Gear.KINDS[i] ? Gear.best(Gear.KINDS[i]) : null;
    if (z === 'shop') return this.shopList[i] || null;
    const a = this.zone(z); return a && a[i] ? a[i] : null;
  },
  handItem(u) { return u && u.hand ? this.at(u.hand.z, u.hand.i) : null; },
  name(z, x) { return z === 'shop' ? x.name : z === 'quick' || z === 'gun' ? Quick.name(x) : z === 'equip' ? CFG.arts[x.art].name : Meta.itemLabel(x); },
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
  limit() { return Camp.stashLimit() > 999 ? 0 : Camp.stashLimit(); },
  pickN(z, i) { const s = this.at(z, i); return s && (z === 'inv' || z === 'stash') && this.stackable(s) && this.shift ? 1 : (s && s.n) || 1; },
  equipTo(from, slot) {
    const s = P.inv[from]; if (!s || !s.art) return log('В контейнер кладут только артефакты.');
    if (!P.known[s.art]) return log('Неизвестный артефакт в контейнер не положишь — опознай его у Учёного в Мастерской.');
    const old = P.equip[slot]; P.equip[slot] = Gear.slotOf(s); P.inv.splice(from, 1); if (old) invAdd('art', 1, old.art, old.q);
  },
  unequip(slot) { const e = P.equip[slot]; if (e) { P.equip[slot] = null; invAdd('art', 1, e.art, e.q); } },
  // ---- витрина (магазины и верстак): взять предложение в руку можно, только если по силам хотя бы одна штука ----
  shopAfford(o, n) { return o.price == null || P.money >= o.price * (n || 1); },
  shopMax(o) { return o.stack ? Math.max(1, Math.floor(P.money / o.price)) : 1; },
  buy(o, n) {
    n = Math.max(1, Math.min(n || 1, this.shopMax(o)));
    if (o.kind === 'item') {
      const d = CFG.items[o.id]; if (d.req) for (const k in d.req) if (P.sk[k] < d.req[k]) return log('Слишком тяжело: нужен навык «' + CFG.skills[k].name + '» ' + d.req[k] + '.');
      if (!this.shopAfford(o, n)) return; P.money -= o.price * n; invAdd(o.id, (o.qty || d.pack || 1) * n); Snd.pick();
    } else if (o.kind === 'weapon') { if (!this.shopAfford(o, 1) || P.weapons.includes(o.id)) return; P.money -= o.price; P.weapons.push(o.id); P.cond[o.id] = 100; P.weapon = o.id; Snd.pick(); log('Куплено: ' + o.name); }
    else if (o.kind === 'knife') { if (!this.shopAfford(o, 1) || (P.knives || []).includes(o.id)) return; P.money -= o.price; P.knives.push(o.id); P.knife = o.id; Snd.pick(); log('Куплено: ' + o.name); }
    else if (o.kind === 'offer') { if (!Wpn.buyOffer(o.idx)) return; }
    else if (o.kind === 'slot') { if (!this.shopAfford(o, 1)) return; P.money -= o.price; P.equip.push(null); Snd.pick(); log('Контейнер добавлен.'); }
    else if (o.kind === 'gear') { if (!this.shopAfford(o, 1)) return; P.money -= o.price; P.inv.push(o.gear); Snd.pick(); log('Куплено: ' + o.name); }
    else if (o.kind === 'run') { if (!this.shopAfford(o, 1) || (o.can && !o.can())) return; if (o.price) P.money -= o.price; o.run(); }
    o.sold = true;
  },
  // Продать то, что в руке (любая зона-источник): в окне торговли (u.v) или мастерской — если этот кто-то это покупает
  sellHand(u) {
    const h = u.hand; if (!h) return; u.hand = null;
    if (h.z === 'gun') { const id = P.weapons[h.i]; if (id) { const p = Wpn.sellPrice(id), nm = Wpn.name(id); Wpn.remove(id); P.money += p; P.earned += p; Snd.pick(); log('Продано: ' + nm + ' за ' + p + ' ₽'); } return; }
    if (h.z === 'melee') { const id = (P.knives || [])[h.i]; if (id && id !== 'knife') { const p = Math.floor(Melee.DEF[id].price / 2); P.knives.splice(P.knives.indexOf(id), 1); if (P.knife === id) P.knife = P.knives[0]; P.money += p; Snd.pick(); log('Продано: ' + Melee.DEF[id].name + ' за ' + p + ' ₽'); } return; }
    if (h.z === 'inv') {
      const s = P.inv[h.i]; if (!s) return; const p1 = sellPrice(s, u.v); if (p1 <= 0) return;
      const n = this.stackable(s) ? Math.min(h.n, s.n) : 1, p = p1 * n; P.money += p; P.earned += p; addXp(p * 0.06);
      const key = s.art || s.id; G.demand[key] = Math.max(0.5, (G.demand[key] || 1) * Math.pow(0.94, n));
      if (s.art) P.inv.splice(h.i, 1); else { s.n -= n; if (s.n <= 0) P.inv.splice(h.i, 1); } Snd.pick();
    }
  },
  // взять/положить по клику на ячейку (z, i); u — состояние панели
  click(u, z, i) {
    const h = u.hand; if (z === 'worn') { if (h) u.hand = null; return; }   // «Надето» только показывает лучшее из рюкзака
    if (!h) {
      if (z === 'quick' && i === 0) { Melee.cycle(); return; }
      if (z === 'shop') { const o = this.at('shop', i); if (o && this.shopAfford(o, 1)) u.hand = { z, i, n: 1 }; return; }
      if (this.at(z, i)) u.hand = { z, i, n: this.pickN(z, i) };
      return;
    }
    if (h.z === z && h.i === i) { u.hand = null; return; }
    if (h.z === 'shop') { if (z === 'shop') { const o = this.at('shop', i); u.hand = o && this.shopAfford(o, 1) ? { z, i, n: 1 } : null; } else u.hand = null; return; }   // витрина — не цель, только источник
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
      else if (z === 'inv' || z === 'gun' || z === 'melee') { Quick.assign(h.i, null); log('Кнопка ' + (h.i + 1) + ' свободна: ' + Quick.name(it) + ' — в инвентаре.', '#a8c890'); }   // вернуть с кнопки в инвентарь
    } else if (h.z === 'gun' || h.z === 'melee') { if (z === 'quick' && i > 0) { Quick.assign(i, it); log('На кнопку ' + (i + 1) + ' — ' + Quick.name(it) + '.', '#a8c890'); } }
  },
  // действия над вещью в руке
  act(u, what) {
    const h = u.hand;
    if (h && h.z === 'shop') {
      const o = this.at('shop', h.i); if (!o) { u.hand = null; return; } const max = this.shopMax(o);
      if (what === 'more') { h.n = Math.min(max, h.n + 1); return; } if (what === 'less') { h.n = Math.max(1, h.n - 1); return; } if (what === 'all') { h.n = max; return; }
      if (what === 'buy') { this.buy(o, h.n); u.hand = null; } return;
    }
    if (what === 'sell') { this.sellHand(u); return; }
    if (h && h.z === 'quick' && what === 'unslot') { const it = this.at('quick', h.i); u.hand = null; if (it) { Quick.assign(h.i, null); log('Кнопка ' + (h.i + 1) + ' свободна: ' + Quick.name(it) + (Quick.gun(it) || Quick.knife(it) ? ' — оружие осталось во вкладке «Оружие».' : ' осталась в рюкзаке.'), '#a8c890'); } return; }
    if (!h || (h.z !== 'inv' && h.z !== 'stash')) return; const list = h.z === 'inv' ? P.inv : P.stash, s = list[h.i]; if (!s) { u.hand = null; return; }
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
    if (z === 'shop') {
      const o = this.shopList[i]; if (!o) return '<div class="slot gc e" data-a="cell:shop:' + i + '"></div>';
      const afford = this.shopAfford(o, 1);
      return '<div class="slot gc' + (sel ? ' sel' : '') + (afford ? '' : ' z') + '" data-a="cell:shop:' + i + '" title="' + o.name.replace(/"/g, '') + (o.sub ? ' — ' + o.sub.replace(/<[^>]+>/g, '').replace(/"/g, '') : '') + '">' + o.icon + (o.price != null ? '<span class="n">' + o.price + '₽</span>' : '') + (o.mark ? '<span class="w">' + o.mark + '</span>' : '') + '</div>';
    }
    if (z === 'gun') { const id = P.weapons[i]; if (!id) return '<div class="slot gc e" data-a="cell:gun:' + i + '"></div>'; return '<div class="slot gc' + (sel ? ' sel' : '') + '" data-a="cell:gun:' + i + '" style="border-color:' + Wpn.color(id) + '">' + Quick.icon('w:' + id) + '<span class="n">' + Quick.count('w:' + id) + '</span>' + (P.weapon === id ? '<span class="w">★</span>' : '') + '</div>'; }
    if (z === 'melee') { const id = (P.knives || [])[i]; if (!id) return '<div class="slot gc e" data-a="cell:melee:' + i + '"></div>'; return '<div class="slot gc' + (sel ? ' sel' : '') + '" data-a="cell:melee:' + i + '">' + Melee.DEF[id].icon + (P.knife === id ? '<span class="w">★</span>' : '') + '</div>'; }
    if (z === 'quick') {
      const id = heldNames[i], w = !!Quick.gun(id), n = id ? Quick.count(id) : '';
      if (!id) return '<div class="slot gc e' + (u.hand && (u.hand.z === 'inv' || u.hand.z === 'gun' || u.hand.z === 'quick' || u.hand.z === 'melee') ? ' hint' : '') + '" data-a="cell:quick:' + i + '"><span class="k">' + (i + 1) + '</span></div>';
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
  // на телефоне (Touch.on) вертикальное место в панели очень ограничено — не резервируем под пустые ячейки больше двух рядов
  minCells(min, cols) { return (typeof Touch !== 'undefined' && Touch.on) ? Math.min(min, cols * 2) : min; },
  grid(z, u, min) {
    const a = this.zone(z), cells = Math.max(this.minCells(min, this.COLS), Math.ceil((a.length + 1) / this.COLS) * this.COLS); let h = '<div class="ggrid">';
    for (let i = 0; i < cells; i++) h += this.cell(z, i, a[i], u);
    return h + '</div>';
  },
  // сетка витрины: задать список офферов перед вызовом (Inv.shopList = list)
  shopGrid(u) { let h = '<div class="ggrid">'; for (let i = 0; i < this.shopList.length; i++) h += this.cell('shop', i, null, u); return h + (this.shopList.length ? '' : '<div class="stat">Пусто.</div>') + '</div>'; },
  // ---- контекстные кнопки станка/торговли для вещи в руке ----
  stationButtons(u, z, it) {
    let h = '';
    if (u.v) {
      if (z === 'gun') { const id = it.slice(2), p = Wpn.sellPrice(id); h += btn('hact:sell', 'Продать за ' + p + ' ₽'); }
      else if (z === 'melee') { const id = it.slice(2); if (id !== 'knife') h += btn('hact:sell', 'Продать за ' + Math.floor(Melee.DEF[id].price / 2) + ' ₽'); }
      else if (z === 'inv') {
        const p1 = sellPrice(it, u.v); if (p1 > 0) { const n = this.stackable(it) ? u.hand.n : 1; h += btn('hact:sell', 'Продать' + (n > 1 ? ' ×' + n : '') + ' за ' + (p1 * n) + ' ₽'); }
        if (u.v === 'sci' && it.art) {
          if (!P.known[it.art]) { const c = Camp.identCost(); h += btn('ident:' + u.hand.i, 'Опознать за ' + c + ' ₽', P.money < c); }
          else if (!P.researched[it.art]) { const c = Camp.researchCost(); h += btn('research:' + u.hand.i, 'Исследовать за ' + c + ' ₽', P.money < c || P.lore >= CFG.lore.length); }
        }
      }
    }
    if (u.k === 'craft' && u.st === 'gun') {
      if (z === 'gun') {
        const id = it.slice(2), wear = 100 - P.cond[id];
        if (wear >= 1) { const rc = Meta.repairMats(wear, 'gun'); if (Object.keys(rc).length) h += btn('wrepairm:' + id, 'Из хлама: ' + Meta.matsText(rc), !Meta.canPay(rc)); const mc = Meta.repairCost(id); h += btn('wrepair:' + id, 'Почистить за ' + mc + ' ₽', P.money < mc); }
        const n = Wpn.tuneCount(id), cap = Camp.lvl('gun');
        if (n < cap) { const tc = Meta.tuneCost(n); for (const k of Wpn.tuneKeys(id)) h += btn('wtune:' + id + ':' + k, Wpn.TUNE[k].text + ' · ' + Meta.matsText(tc), !Meta.canPay(tc)); }
        const sm = Meta.salvageWeapon(id); if (sm) h += btn('salv:w:' + id, u.sc === 'w' + id ? 'Точно?' : 'Разобрать → ' + Meta.matsPlain(sm));
      } else if (z === 'inv' && Gear.isGear(it.id)) {
        if (Gear.isWorn(it)) {
          const wear = 100 - P.suitCond;
          if (['body', 'coat'].includes(Gear.KIND[it.id]) && wear >= 1) { const rc = Meta.repairMats(wear, 'gear'); if (Object.keys(rc).length) h += btn('srepairm', 'Из хлама: ' + Meta.matsText(rc), !Meta.canPay(rc)); const mc = Meta.suitRepairCost(); h += btn('srepair', 'Починить за ' + mc + ' ₽', P.money < mc); }
          const n = (it.g && it.g.t) || 0, cap = Camp.lvl('gear');
          if (n < cap) { const tc = Meta.tuneCost(n); for (const k of Gear.keys(it.id)) h += btn('gtune:' + u.hand.i + ':' + k, Gear.TUNE[k].text + ' · ' + Meta.matsText(tc), !Meta.canPay(tc)); }
        }
        const sm = Meta.salvageSlot(it); if (sm) h += btn('salv:g:' + u.hand.i, u.sc === 'g' + u.hand.i ? 'Точно?' : 'Разобрать → ' + Meta.matsPlain(sm));
      }
    }
    return h;
  },
  handBar(u) {
    const it = this.handItem(u); if (!it) return '<div class="stat hbar" style="margin-top:6px">Клик по вещи — взять в руку, ещё клик — положить (Shift+клик — одну штуку из стопки; «−1» / «+1» / «Все» — сколько нести). Правая кнопка — использовать. Быстрый доступ: возьми вещь и кликни по кнопке на нижней панели.</div>';
    const z = u.hand.z, name = this.name(z, it);
    let h = '<div class="note hbar" style="margin-top:6px">' + (z === 'shop' ? 'Выбрано' : 'В руке') + ': <b>' + name + '</b>' + (z === 'shop' && it.sub ? ' — ' + it.sub : '') + (u.hand.n > 1 || ((it.n || 1) > 1 && (z === 'inv' || z === 'stash')) ? ' ×' + u.hand.n + (z !== 'shop' && it.n > u.hand.n ? ' из ' + it.n : '') : '');
    h += ' <span style="display:inline-flex;gap:6px;flex-wrap:wrap;align-items:center">';
    if (z === 'shop') {
      const max = this.shopMax(it); if (it.stack && max > 0) h += btn('hact:less', '−1', u.hand.n <= 1) + '<b>×' + u.hand.n + '</b>' + btn('hact:more', '+1', u.hand.n >= max) + btn('hact:all', 'Все', u.hand.n >= max);
      const price = it.price != null ? ' — ' + (it.price * u.hand.n) + ' ₽' : '';
      h += btn('hact:buy', (it.buyLabel || 'Взять') + price, it.price != null && !this.shopAfford(it, u.hand.n));
    } else {
      if (z === 'quick') h += btn('hact:unslot', 'Убрать с кнопки');
      if (z === 'inv' || z === 'stash') {
        const s = it; if (this.stackable(s) && s.n > 1) h += btn('hact:less', '−1', u.hand.n <= 1) + btn('hact:more', '+1', u.hand.n >= s.n) + btn('hact:all', 'Все', u.hand.n >= s.n);
        if (z === 'stash') h += btn('hact:take', 'В рюкзак');
        else { if (s.art || CFG.items[s.id].use) h += btn('hact:use', s.art ? 'В контейнер' : 'Использовать'); if (u.k === 'storage') h += btn('hact:stash', 'В ящик'); h += btn('hact:drop', 'Выбросить'); }
      }
      h += this.stationButtons(u, z, it);
    }
    return h + '</span>' + (z === 'shop' ? '' : ' <span class="stat">· клик по ячейке — положить, по этой же — отпустить</span>') + '</div>';
  },
  skillsHtml() {
    let h = '<h3>Навыки — очков: ' + P.sp + ' · опыт ' + Math.floor(P.xp) + '/' + Math.floor(60 * Math.pow(P.lvl, 1.4)) + '</h3>';
    for (const k in CFG.skills) { const s = CFG.skills[k]; h += row('', s.name + ' <b>' + P.sk[k] + '/' + s.max + '</b>', s.desc, btn('skill:' + k, '+', !P.sp || P.sk[k] >= s.max)); }
    return h + '<h3>Записки (' + P.notes.length + ')</h3>' + (P.notes.map(n => '<div class="note">' + n.txt + '</div>').join('') || '<div class="stat">Нет.</div>');
  },
  // общая сетка: сначала стволы и ножи, затем стопки рюкзака; свободные ячейки — конец рюкзака
  bigGrid(u) {
    const list = []; P.weapons.forEach((id, i) => list.push(['gun', i])); (P.knives || []).forEach((id, i) => list.push(['melee', i])); P.inv.forEach((s, i) => list.push(['inv', i]));
    const cells = Math.max(this.minCells(60, this.BIG), Math.ceil((list.length + 1) / this.BIG) * this.BIG); let h = '<div class="ggrid big">';
    for (let k = 0; k < cells; k++) { if (k < list.length) { const [z, i] = list[k]; h += this.cell(z, i, z === 'inv' ? P.inv[i] : null, u); } else h += this.cell('inv', P.inv.length + (k - list.length), null, u); }
    return h + '</div>';
  },
  wornCell(i) {
    const b = Gear.KINDS[i] ? Gear.best(Gear.KINDS[i]) : null; if (!b) return '<div class="slot gc e" data-a="cell:worn:' + i + '" title="' + Gear.KINDNAME[Gear.KINDS[i]] + '"><span class="k">' + Gear.KINDNAME[Gear.KINDS[i]].slice(0, 3) + '</span></div>';
    return '<div class="slot gc" data-a="cell:worn:' + i + '" style="border-color:' + (b.g ? Gear.TIERS[b.g.rar || 0].col : '#4a4030') + '">' + itemIcon(b) + '<span class="w">★</span></div>';
  },
  html(u) {
    if (u.k === 'storage') {
      const lim = Camp.stashLimit();
      return '<div class="x" data-a="close">✕ Esc</div><h2>Ящик хранения</h2><div class="stat">Вещи здесь в безопасности. Не забывай про вес: ' + weight().toFixed(1) + ' / ' + carryCap() + ' кг.</div>' +
        '<div class="cols"><div><h3>Рюкзак</h3>' + this.grid('inv', u, 24) + '</div><div><h3>Ящик — ' + P.stash.length + ' / ' + (lim > 999 ? '∞' : lim) + '</h3>' + this.grid('stash', u, 24) + '</div></div>' + this.handBar(u) +
        '<div class="stat" style="margin-top:8px">' + Camp.bonusText('storage') + ' ' + btn('ubuild:storage', 'Улучшить ящик', !Camp.canUp('storage')) + '</div>';
    }
    let h = '<div class="x" data-a="close">✕ Esc</div><h2>Инвентарь</h2><div class="cols"><div style="flex:2;min-width:560px"><h3>Рюкзак — ' + weight().toFixed(1) + ' / ' + carryCap() + ' кг</h3>' + this.bigGrid(u) + this.handBar(u) + '</div><div style="flex:1;min-width:250px">';
    h += '<h3>Контейнеры для артефактов</h3><div class="ggrid">'; P.equip.forEach((e, i) => { h += this.cell('equip', i, e, u); }); h += '</div><div class="stat">' + P.equip.map(a => a ? Meta.itemLabel(Gear.asSlot(a)) : '—').join(' · ') + '</div>';
    h += '<h3>Надето</h3><div class="ggrid doll">'; for (let i = 0; i < Gear.KINDS.length; i++) h += this.wornCell(i); h += '</div>';
    for (const k of Gear.KINDS) { const b = Gear.best(k); h += '<div class="stat">' + Gear.KINDNAME[k] + ': <b>' + (b ? Meta.itemLabel(b) : '—') + '</b></div>'; }
    return h + this.skillsHtml() + '</div></div>' + Meta.invExtra();
  },
  // значок вещи в руке ходит за курсором; окно приподнято во всех окнах с сеткой (инвентарь, ящик, торговля, верстак) — низ панели остаётся виден
  syncHand(u) {
    if (typeof panel !== 'undefined' && panel && panel.classList) panel.classList.toggle('inv', !!(u && ['inv', 'storage', 'trade', 'craft'].includes(u.k)));
    const q = typeof document !== 'undefined' && document.getElementById ? document.getElementById('quick') : null, it0 = u && u.hand ? this.handItem(u) : null;
    if (q && q.classList) q.classList.toggle('hold', !!it0);   // пока что-то в руке, нижняя панель подсвечена: клик по кнопке ставит вещь туда
    const el = this.el; if (!el) return; const it = it0;
    if (!it) { el.style.display = 'none'; return; }
    const z = u.hand.z; el.innerHTML = (z === 'shop' ? it.icon : z === 'quick' || z === 'gun' || z === 'melee' ? Quick.icon(it) : z === 'equip' ? Codex.artHtml(it.art) : itemIcon(it)) + (u.hand.n > 1 ? '<span style="font-size:13px;color:#e8d8a0"> ×' + u.hand.n + '</span>' : ''); el.style.display = 'block';
  },
};

(function () {
  Inv.el = typeof document !== 'undefined' && document.createElement ? document.createElement('div') : null;
  if (Inv.el && Inv.el.style && document.body && document.body.appendChild) { Inv.el.id = 'hand'; try { document.body.appendChild(Inv.el); } catch (e) { Inv.el = null; } }
  if (typeof addEventListener === 'function') addEventListener('mousemove', e => { if (Inv.el && Inv.el.style && Inv.el.style.display === 'block') { Inv.el.style.left = (e.clientX + 6) + 'px'; Inv.el.style.top = (e.clientY + 6) + 'px'; } });
  const _render = Camp.render; Camp.render = function (u) {
    if (u.k === 'inv' || u.k === 'storage') { panel.style.display = 'block'; const st = panel.scrollTop; panel.innerHTML = Inv.html(u); panel.scrollTop = st; Inv.syncHand(u); return true; }
    const r = _render.call(this, u); if (!r) Inv.syncHand(null); return r;
  };
  const _click = Meta.click; Meta.click = function (a, arg, arg2, u) {
    if (a === 'cell') { Inv.click(u, arg, +arg2); return true; }
    if (a === 'hact') { Inv.act(u, arg); return true; }
    return _click.call(this, a, arg, arg2, u);
  };
  // подсказки на ячейках
  const _fa = Tip.fromAttr; Tip.fromAttr = function (attr) {
    const [a, z, i] = String(attr).split(':');
    if (a === 'cell') {
      const it = Inv.at(z, +i); if (!it) return null;
      if (z === 'shop') {
        if (it.kind === 'item') return Tip.item(it.id, 'buy');
        if (it.kind === 'weapon') return Tip.weapon(it.id);
        if (it.kind === 'offer') { const o = (P.gunOffers || [])[it.idx]; return o ? Tip.weapon(null, o.def) : null; }
        if (it.kind === 'knife') return Melee.tip(it.id);
        return Tip.head(it.name, it.sub || '') + (it.price != null ? Tip.row('Цена:', it.price + ' ₽') : '');
      }
      return z === 'inv' ? Tip.slot(it) : z === 'stash' ? Tip.slot(it) : z === 'equip' ? Tip.art(it.art, null, it.q) : z === 'worn' ? Tip.slot(it) : z === 'gun' ? Tip.weapon(it.slice(2)) : z === 'melee' ? Melee.tip(it.slice(2)) : Tip.quick(+i);
    }
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

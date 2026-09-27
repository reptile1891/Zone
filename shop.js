'use strict';
// «Point & click» для магазинов, услуг и верстака — тот же язык, что у инвентаря (inv.js): сетка значков + строка снизу.
//   Витрина (купить, продать оружие/ножи/снаряжение, ремонт, тюнинг, разборка, опознание, исследование): значок берётся В РУКУ
//   (Inv.click/handBar), у стопок — счётчик «−1/+1/Все», подтверждение — кнопкой в строке «В руке» (Inv.buy/Inv.sellHand/Inv.stationButtons).
//   Разовые действия без вещи (услуги лагеря, задания, рецепты, улучшение здания) — значок, клик сразу выполняет (если по силам).
const Shop = {
  // разовая ячейка-действие: клик выполняет data-a сразу (используется для услуг, заданий, рецептов, чертежей)
  icon(attr, ic, badge, disabled, title, mark) {
    return '<div class="slot gc' + (disabled ? ' dis' : '') + '" data-a="' + attr + '" title="' + String(title || '').replace(/"/g, '') + '">' + ic + (badge != null ? '<span class="n">' + badge + '</span>' : '') + (mark ? '<span class="w">' + mark + '</span>' : '') + '</div>';
  },
  row(items) { return '<div class="ggrid">' + items.join('') + '</div>'; },

  // ---------- витрины (Inv.shopList) ----------
  stockList(vk) {
    return Camp.stock(vk).map(id => { const d = CFG.items[id]; return { id, kind: 'item', icon: d.icon, name: d.name + (d.pack ? ' ×' + d.pack : ''), sub: d.desc, price: buyPrice(id), stack: true, buyLabel: 'Купить' }; });
  },
  weaponList() {
    const out = [];
    for (const k in CFG.weapons) { if (k === 'pistol' && P.weapons.includes('pistol')) continue; const w = CFG.weapons[k]; if ((w.lvl || 1) > Camp.lvl('gun') || P.weapons.includes(k)) continue;
      out.push({ id: k, kind: 'weapon', icon: Icons.html('w_' + k), name: w.name, sub: 'урон ' + w.dmg + (w.pellets > 1 ? '×' + w.pellets : '') + ' · дальн. ' + w.range + (w.note ? ' · ' + w.note : ''), price: w.price, buyLabel: 'Купить' }); }
    (P.gunOffers || []).forEach((o, idx) => { const w = Wpn.eff(o.def); out.push({ id: 'offer' + idx, kind: 'offer', idx, icon: Icons.html('w_' + o.def.base), name: w.name, sub: Wpn.TIERS[o.def.rar].n + ' · сегодня', price: o.price, buyLabel: 'Купить' }); });
    return out;
  },
  knifeList() {
    const out = [];
    for (const k in Melee.DEF) { if ((P.knives || []).includes(k)) continue; const d = Melee.DEF[k]; if ((d.lvl || 1) > Camp.lvl('gun')) continue; out.push({ id: k, kind: 'knife', icon: d.icon, name: d.name, sub: Melee.stats(d), price: d.price, buyLabel: 'Купить' }); }
    return out;
  },
  slotList() { const p = Meta.slotPrice(); return p ? [{ id: 'slot', kind: 'slot', icon: '✦', name: 'Контейнер для артефакта', sub: 'Слотов: ' + P.equip.length + ' → ' + (P.equip.length + 1), price: p, buyLabel: 'Купить' }] : []; },

  // ---------- Любой торговец (Торговый дом, Учёный «Лис») — один и тот же экран ----------
  tradeHTML(u) {
    Inv.shopList = this.stockList(u.v).concat(u.v === 'market' ? [...this.weaponList(), ...this.knifeList(), ...this.slotList()] : []);
    let h = '<div class="cols"><div style="flex:1;min-width:280px"><h3>Витрина</h3>' + Inv.shopGrid(u) + '</div>';
    h += '<div style="flex:1;min-width:280px"><h3>Твой рюкзак — продать' + (u.v === 'sci' ? ', опознать, исследовать' : '') + '</h3>' + Inv.bigGrid(u) + '</div></div>' + Inv.handBar(u);
    if (u.v === 'market' && Gear.KINDS.some(k => Gear.best(k))) h += '<div class="stat" style="margin-top:8px">Ремонт и тюнинг надетого снаряжения — возьми его в рюкзаке (отмечено ★).</div>';
    return h;
  },

  // ---------- Мастерская: верстак (Ржавый) ----------
  workshopHTML(u) {
    let h = '<div class="cols"><div style="flex:2;min-width:340px"><h3>Твоё оружие и снаряжение</h3>' + Inv.bigGrid(u) + Inv.handBar(u) + '</div>';
    h += '<div style="flex:1;min-width:260px"><h3>Верстак — рецепты</h3>' + this.recipesHTML(u, 'gun');
    h += '<h3 style="margin-top:10px">Чертежи</h3>' + this.buildingHTML('gun') + '</div></div>';
    return h;
  },
  labHTML(u) {
    let h = '<div class="cols"><div style="flex:2;min-width:340px"><h3>Твои вещи</h3>' + Inv.bigGrid(u) + Inv.handBar(u) + '</div>';
    h += '<div style="flex:1;min-width:260px"><h3>Лабораторный синтез</h3>' + this.recipesHTML(u, 'sci') + '<h3 style="margin-top:10px">Чертежи</h3>' + this.buildingHTML('sci') + '</div></div>';
    return h;
  },
  recipesHTML(u, st) {
    const l = Camp.lvl(st);
    return '<div class="ggrid">' + CFG.recipes.filter(r => r.st === st).map(r => {
      const ic = r.out[0] === 'art' ? Icons.html('art') : CFG.items[r.out[0]].icon, can = Camp.canCraft(r);
      const sub = l < r.lvl ? 'Нужен уровень здания ' + r.lvl : (r.req && !Object.keys(r.req).every(k => P.sk[k] >= r.req[k]) ? 'Нужен навык «' + CFG.skills[Object.keys(r.req)[0]].name + '» ' + Object.values(r.req)[0] : Object.keys(r.mat).map(id => Camp.matName(id) + ' ' + Camp.have(id) + '/' + r.mat[id]).join(', '));
      return this.icon('craft:' + r.id, ic, null, !can, r.name + ' — ' + sub);
    }).join('') + '</div>';
  },
  buildingHTML(k) {
    const b = CFG.buildings[k], l = Camp.lvl(k);
    let h = '<div class="stat">' + b.name + ': уровень ' + l + ' / 3 — ' + (l < b.fx.length ? b.fx[l - 1] : b.fx[b.fx.length - 1]) + '</div>';
    if (l >= 3) return h + '<div class="stat">Максимальный уровень.</div>';
    const u2 = b.ups[l - 1], can = Camp.canUp(k);
    const mats = Object.keys(u2.mat).map(id => this.icon('', CFG.items[id].icon, Camp.have(id) + '/' + u2.mat[id], invCount(id) < u2.mat[id], CFG.items[id].name)).join('');
    return h + '<div class="ggrid">' + mats + this.icon('ubuild:' + k, '⬆', u2.money + '₽', !can, 'Улучшить до уровня ' + (l + 1)) + '</div>';
  },

  // ---------- Бар ----------
  barHTML(u) {
    let h = '<div class="cols"><div><h3>Задания — предложения</h3><div class="ggrid">';
    h += P.offers.map((o, i) => this.icon('qacc:' + i, '📋', o.reward + '₽', P.quests.length >= 3, o.text + ' · репутация +' + o.rep)).join('') || '<div class="stat">Нет предложений.</div>';
    h += '</div><h3 style="margin-top:8px">Задания — активные</h3><div class="ggrid">';
    h += P.quests.map((q, i) => this.icon('qturn:' + i, '✔', null, !this.done(q), q.text + ' — ' + Meta.progText(q))).join('') || '<div class="stat">Нет активных.</div>';
    h += '</div><h3 style="margin-top:8px">Записки</h3><div class="ggrid">';
    const notes = P.notes.map((n, i) => (n.sold ? null : this.icon('tell:' + i, '✎', CFG.vendors.bar.noteSell + '₽', false, n.txt))).filter(Boolean);
    h += notes.join('') || '<div class="stat">Новых записок нет.</div>';
    h += '</div></div><div><h3>Услуги</h3><div class="ggrid">';
    h += this.icon('sleep', '☾', Camp.sleepCost() + '₽', P.money < Camp.sleepCost(), 'Переночевать: утро, здоровье, сохранение');
    h += this.icon('map', '🗺', CFG.vendors.bar.map + '₽', P.money < CFG.vendors.bar.map, 'Карта участка: открывает район и отмечает аномалии');
    h += this.icon('rumor', '💬', null, false, 'Слухи (бесплатно)');
    h += this.icon('ins', '🛡', 150, P.insured || P.money < 150, 'Страховка: если погибнешь — вернут вместе с хабаром (один раз)');
    h += this.icon('pass', '🎫', 250, P.pass || P.rep < 5 || P.money < 250, P.pass ? 'Уже есть' : 'Пропуск в сектор 4 (нужна репутация 5+)');
    h += this.icon('guide', '🧭', 220, P.money < 220, 'Проводник: отметит аномалии на большом участке');
    const cells = known.reduce((a, b2) => a + b2, 0) - P.mapSold, pay = Math.round(Math.max(0, cells) * 0.04 * (1 + 0.1 * P.sk.mapping));
    h += this.icon('sellmap', '📡', pay, pay < 20, 'Продать данные разведки: новых клеток — ' + Math.max(0, cells));
    h += '</div>' + (u && G.ui && G.ui.r ? '<div class="note" id="rumortxt">' + G.ui.r + '</div>' : '<div class="note" id="rumortxt"></div>');
    h += '<h3 style="margin-top:8px">На рынке</h3>' + ((G.events || []).map(e => '<div class="note">' + e.text + '</div>').join('') || '<div class="stat">Спокойно.</div>') + '</div></div>';
    return h;
  },
  done(q) { return Meta.done(q); },
};

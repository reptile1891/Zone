'use strict';
// Подсказки при наведении: на строки панелей (рюкзак, торговля, верстак, склад), слоты артефактов и быстрые слоты.
// Предмет определяется по кнопке внутри строки (data-a: equip:3, buy:medkit, craft:ammo …), поэтому строки панелей не нужно размечать отдельно.
// Загружается после dungeon.js; отрисовка — в #itip (создаётся здесь же).
const Tip = {
  el: null,
  FX: {
    radRes: v => 'Сопротивление радиации +' + Math.round(v * 100) + '%', stamRegen: v => 'Восстановление сил +' + v, carry: v => 'Грузоподъёмность +' + v + ' кг',
    hpRegen: v => 'Регенерация +' + v + ' HP/с', lure: () => 'Привлекает мутантов', psy: v => 'Давит на рассудок: +' + v + ' напряжения/с',
    repel: () => 'Мутанты хуже замечают тебя', fireRes: v => 'Огнестойкость +' + Math.round(v * 100) + '%', sight: v => 'Обзор в темноте +' + v,
  },
  USE: {
    heal: v => 'Лечит +' + v + ' HP', stopBleed: () => 'Останавливает кровотечение и тушит огонь', food: v => 'Сытость +' + v, rad: v => 'Радиация ' + (v > 0 ? '+' : '−') + Math.abs(v),
    fixFracture: () => 'Лечит перелом', cureInfect: () => 'Лечит заражение раны', identify: () => 'Опознаёт один неопознанный артефакт', repairGun: v => 'Чинит ' + v + '% износа оружия',
    repairSuit: v => 'Чинит ' + v + '% износа костюма', sensor: () => 'Ставится на землю, пищит при движении рядом',
  },
  row(label, text, col) { return '<div class="ti-r">' + label + ' <b' + (col ? ' style="color:' + col + '"' : '') + '>' + text + '</b></div>'; },
  head(name, tag, col) { return '<div class="ti-h"' + (col ? ' style="color:' + col + '"' : '') + '>' + name + (tag ? ' <span>' + tag + '</span>' : '') + '</div>'; },
  kind(id) { const d = CFG.items[id]; return d.part ? 'трофей мутанта' : d.junk ? 'хлам' : d.use ? 'расходник' : d.buy ? 'снаряжение' : 'предмет'; },

  // Предмет по id (без учёта стека). ctx: 'buy' — показать цену покупки, vendor — цена продажи у торговца
  item(id, ctx, vendor, n) {
    const d = CFG.items[id]; if (!d) return null;
    let h = this.head(d.name, this.kind(id)) + (d.desc ? '<div class="ti-d">' + d.desc + '</div>' : '');
    for (const k in d.use || {}) if (this.USE[k]) h += this.row('▸', this.USE[k](d.use[k]));
    for (const k in d.req || {}) h += this.row('Нужно:', 'навык «' + CFG.skills[k].name + '» ' + d.req[k], P.sk[k] >= d.req[k] ? '#8fbf7f' : '#e06060');
    h += this.row('Вес:', d.w + ' кг' + (n > 1 ? ' (×' + n + ' = ' + (d.w * n).toFixed(1) + ' кг)' : '')) + this.row('Ценность:', d.val + ' ₽');
    if (ctx === 'buy') h += this.row('Цена покупки:', buyPrice(id) + ' ₽' + (d.pack ? ' за ' + d.pack + ' шт.' : '')) + this.row('В рюкзаке:', invCount(id));
    else if (vendor) { const p = sellPrice({ id, n: 1 }, vendor); if (p) h += this.row('Скупка:', p + ' ₽ за штуку'); }
    return h;
  },
  // Артефакт по id. Неопознанный показывает только намёки навыка «Знание артефактов»
  art(id, vendor) {
    const a = CFG.arts[id]; if (!a) return null;
    if (!P.known[id]) {
      let h = this.head('Неопознанный артефакт', 'артефакт', '#c8ccd0') + '<div class="ti-d">Свойства неизвестны. Опознай у Учёного (или реагентом), тогда можно положить в контейнер.</div>';
      const hint = Meta.itemName({ art: id }).replace('Неопознанный артефакт', '').trim(); if (hint) h += this.row('Наблюдение:', hint.replace(/[()]/g, ''));
      h += this.row('Вес:', a.w + ' кг'); if (vendor) { const p = sellPrice({ art: id }, vendor); if (p) h += this.row('Скупка (по низу):', p + ' ₽'); }
      return h;
    }
    let h = this.head(a.name, 'артефакт', '#e8c060') + '<div class="ti-d">' + a.desc + '</div>';
    for (const k in a.fx) if (this.FX[k]) h += this.row('▸', this.FX[k](a.fx[k]));
    h += this.row('Фон:', a.rad ? a.rad.toFixed(2) + ' (растёт с числом артефактов)' : 'нет') + this.row('Вес:', a.w + ' кг') + this.row('Ценность:', a.val + ' ₽');
    if (vendor) { const p = sellPrice({ art: id }, vendor); if (p) h += this.row('Скупка:', p + ' ₽'); }
    return h;
  },
  // Слот рюкзака (предмет или артефакт)
  slot(s, vendor) { if (!s) return null; return s.art ? this.art(s.art, vendor) : this.item(s.id, null, vendor, s.n); },
  weapon(k) {
    const w = CFG.weapons[k]; if (!w) return null;
    const dps = w.dmg * w.pellets / w.cd, own = P.weapons.includes(k);
    let h = this.head(w.name, 'оружие', '#c9c2a8') + (w.note ? '<div class="ti-d">' + w.note + '</div>' : '');
    h += this.row('Урон:', w.dmg + (w.pellets > 1 ? ' ×' + w.pellets + ' (картечь)' : '')) + this.row('Скорострельность:', (1 / w.cd).toFixed(1) + ' выстр./с (≈ ' + dps.toFixed(0) + ' урона/с)');
    h += this.row('Дальность:', w.range) + this.row('Шум:', w.noise) + this.row('Износ за выстрел:', w.wear + '%') + this.row('Боеприпас:', CFG.items[w.ammo || 'ammo'].name + (w.perAmmo ? ' (1 шт. = ' + w.perAmmo + ' выстрелов)' : ''));
    if (own) h += this.row('Состояние:', Math.round(P.cond[k]) + '%', P.cond[k] < 40 ? '#e0a060' : '#8fbf7f'); else h += this.row('Цена:', w.price + ' ₽') + this.row('Мастерская:', 'уровень ' + (w.lvl || 1));
    return h;
  },
  recipe(id) {
    const r = CFG.recipes.find(x => x.id === id); if (!r) return null;
    const lvl = Camp.lvl(r.st), out = r.out[0] === 'art' ? null : CFG.items[r.out[0]];
    let h = this.head(r.name, r.st === 'sci' ? 'лаборатория ур. ' + r.lvl : 'мастерская ур. ' + r.lvl, lvl >= r.lvl ? '#c9c2a8' : '#e06060');
    if (out) { if (out.desc) h += '<div class="ti-d">' + out.desc + '</div>'; for (const k in out.use || {}) if (this.USE[k]) h += this.row('▸', this.USE[k](out.use[k])); } else h += '<div class="ti-d">Случайный артефакт из: ' + r.out[1].map(a => CFG.arts[a].name).join(', ') + '</div>';
    h += '<div class="ti-r">Материалы:</div>';
    for (const m in r.mat) { const have = Camp.have(m); h += this.row('•', Camp.matName(m) + ' ' + have + '/' + r.mat[m], have >= r.mat[m] ? '#8fbf7f' : '#e06060'); }
    if (r.req) for (const k in r.req) h += this.row('Нужно:', 'навык «' + CFG.skills[k].name + '» ' + r.req[k], P.sk[k] >= r.req[k] ? '#8fbf7f' : '#e06060');
    return h;
  },
  quick(i) {
    const h = heldNames[i]; if (!h) return null;
    return h === 'weapon' ? this.weapon(P.weapon) : this.item(h, null, null, invCount(h));
  },
  // Подсказка по атрибуту кнопки строки (data-a)
  fromAttr(attr) {
    const [a, arg] = String(attr).split(':'), i = +arg, u = G.ui || {}, vk = u.k === 'trade' ? u.v : null;
    switch (a) {
      case 'equip': case 'use': case 'drop': case 'sell': case 'sellall': case 'ident': case 'research': case 'stash': return this.slot(P.inv[i], vk);
      case 'unstash': return this.slot((P.stash || [])[i]);
      case 'unequip': return P.equip[i] ? this.art(P.equip[i]) : null;
      case 'buy': return this.item(arg, 'buy');
      case 'wbuy': case 'wequip': case 'wrepair': return this.weapon(arg);
      case 'craft': return this.recipe(arg);
    }
    return null;
  },
  // Что под курсором
  resolve(el) {
    if (!el || !el.closest) return null;
    const q = el.closest('.qs'); if (q && q.dataset && q.dataset.q != null) return this.quick(+q.dataset.q);
    const sl = el.closest('.slot'); if (sl && sl.dataset && sl.dataset.a) return this.fromAttr(sl.dataset.a);
    const row = el.closest('.row'); if (!row) return null;
    const b = row.querySelector('[data-a]'); return b ? this.fromAttr(b.dataset.a) : null;
  },
  show(html, x, y) {
    if (!this.el) return; const t = this.el; t.innerHTML = html; t.style.display = 'block';
    const w = t.offsetWidth || 260, h = t.offsetHeight || 120, vw = innerWidth, vh = innerHeight;
    t.style.left = Math.max(6, Math.min(vw - w - 6, x + 18)) + 'px'; t.style.top = Math.max(6, Math.min(vh - h - 6, y + 14)) + 'px';
  },
  hide() { if (this.el) this.el.style.display = 'none'; },
  init() {
    const t = document.createElement('div'); t.id = 'itip'; document.body.appendChild(t); this.el = t;
    addEventListener('mousemove', e => {
      let html = null; try { html = this.resolve(e.target); } catch (err) { html = null; }
      if (html) this.show(html, e.clientX, e.clientY); else this.hide();
    });
    addEventListener('blur', () => this.hide());
    addEventListener('keydown', () => this.hide());   // Tab/Esc/E меняют панель, а мышь при этом не двигается
    const panel = document.getElementById('panel');   // перерисовка или закрытие панели — старая подсказка больше не к месту
    if (typeof MutationObserver !== 'undefined' && panel && panel.nodeType) new MutationObserver(() => this.hide()).observe(panel, { childList: true, attributes: true, attributeFilter: ['style'] });
  },
};
Tip.init();

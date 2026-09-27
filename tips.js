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
  FX_ROUND: ['radRes', 'fireRes'],   // проценты считаются как есть, остальные числа округляются до десятых
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
    if (Gear.isGear(id) && ctx === 'buy') h += '<div class="ti-d">Каждый экземпляр со своими характеристиками: чаще обычный, иногда лучше или хуже. Видно после покупки.</div>';
    if (ctx === 'buy') h += this.row('Цена покупки:', buyPrice(id) + ' ₽' + (d.pack ? ' за ' + d.pack + ' шт.' : '')) + this.row('В рюкзаке:', invCount(id));
    else if (vendor) { const p = sellPrice({ id, n: 1 }, vendor); if (p) h += this.row('Скупка:', p + ' ₽ за штуку'); }
    return h;
  },
  // Артефакт по id. Неопознанный показывает только намёки навыка «Знание артефактов»
  art(id, vendor, q) {
    const a = CFG.arts[id]; if (!a) return null; q = q || 1;
    if (!P.known[id]) {
      let h = this.head('Неопознанный артефакт', 'артефакт', '#c8ccd0') + '<div class="ti-d">Свойства неизвестны. Опознай у Учёного (или реагентом), тогда можно положить в контейнер.</div>';
      const hint = Meta.itemName({ art: id }).replace('Неопознанный артефакт', '').trim(); if (hint) h += this.row('Наблюдение:', hint.replace(/[()]/g, ''));
      h += this.row('Вес:', a.w + ' кг'); if (vendor) { const p = sellPrice({ art: id }, vendor); if (p) h += this.row('Скупка (по низу):', p + ' ₽'); }
      return h;
    }
    const gr = Gear.grade(q), fx = Gear.fxOf(id, q), r1 = v => Math.round(v * 10) / 10;
    let h = this.head(a.name, 'артефакт', '#e8c060') + '<div class="ti-d">' + a.desc + '</div>' + this.row('Качество:', gr.n + ' (сила эффектов ×' + q.toFixed(2) + ')', gr.col);
    for (const k in a.fx) if (this.FX[k]) h += this.row('▸', this.FX[k](this.FX_ROUND.includes(k) ? fx[k] : r1(fx[k])));
    h += this.row('Фон:', a.rad ? Gear.radOf(id, q).toFixed(2) + ' (растёт с числом артефактов)' : 'нет') + this.row('Вес:', a.w + ' кг') + this.row('Ценность:', Math.round(a.val * Gear.valMul(q)) + ' ₽');
    if (vendor) { const p = sellPrice({ art: id, q }, vendor); if (p) h += this.row('Скупка:', p + ' ₽'); }
    return h;
  },
  // Слот рюкзака (предмет или артефакт)
  slot(s, vendor) { if (!s) return null; return s.art ? this.art(s.art, vendor, s.q) : Gear.isGear(s.id) ? this.suit(s) : this.item(s.id, null, vendor, s.n); },
  // Костюм/плащ со своими характеристиками; сравнение с базовым (зелёный — лучше, оранжевый — хуже)
  suit(s) {
    const d = CFG.items[s.id], e = Gear.eff(s), b = Gear.BASE[s.id], rar = Gear.rarOf(s), tier = Gear.TIERS[rar], w0 = d.w;
    const cmp = (v, bv, lowGood) => { if (!bv) return ''; const pc = Math.round((v / bv - 1) * 100); if (!pc) return ''; const good = lowGood ? pc < 0 : pc > 0; return ' <span style="color:' + (good ? '#8fbf7f' : '#e0a060') + '">(' + (pc > 0 ? '+' : '−') + Math.abs(pc) + '%)</span>'; };
    const kind = Gear.KIND[s.id], kn = Gear.KINDNAME[kind], worn = Gear.isWorn(s);
    let h = this.head(Gear.name(s), tier.n + ' · ' + kn, tier.col) + '<div class="ti-d">' + d.desc + '</div>';
    const LB = { rad: ['Радиация', v => '−' + Math.round(v * 100) + '%'], anom: ['Аномалии', v => '−' + Math.round(v * 100) + '%'], fire: ['Огонь', v => '−' + Math.round(v * 100) + '%'], psy: ['Напряжение', v => '−' + Math.round(v * 100) + '%'], speed: ['Скорость', v => '+' + Math.round(v * 100) + '%'], noise: ['Шум шагов', v => '−' + Math.round(v * 100) + '%'], carry: ['Грузоподъёмность', v => '+' + Math.round(v * 10) / 10 + ' кг'] };
    for (const k in b) if (LB[k]) h += this.row(LB[k][0] + ':', LB[k][1](e[k]) + cmp(e[k], b[k]));
    h += this.row('Вес:', e.w + ' кг' + cmp(e.w, w0, true));
    if (kind === 'body' || kind === 'coat') h += this.row('Износ:', 'скорость ×' + e.wear.toFixed(2) + (e.wear < 0.95 ? ' (медленнее)' : e.wear > 1.05 ? ' (быстрее)' : ''), e.wear < 0.95 ? '#8fbf7f' : e.wear > 1.05 ? '#e0a060' : null);
    if (kind !== 'coat') h += '<div class="ti-d">' + (worn ? '<b style="color:#7fe07f">Надето сейчас.</b> ' : '') + 'Из вещей этого слота (' + kn + ') работает лучшая в рюкзаке.</div>';
    return h + this.row('Ценность:', d.val + ' ₽');
  },
  // Оружие: по id (своё, простое или со случайными характеристиками) или по описанию def (товар на прилавке)
  weapon(k, defo) {
    const d = defo || (Wpn.def(k) || (CFG.weapons[k] ? Wpn.plain(k) : null)); if (!d) return null;
    const w = defo ? Wpn.eff(d) : Wpn.of(k), own = !defo && P.weapons.includes(k), tier = Wpn.TIERS[d.rar], dps = w.dmg * w.pellets / w.cd;
    let h = this.head(w.name, tier.n + ' · оружие', tier.col) + (w.note ? '<div class="ti-d">' + w.note + '</div>' : '');
    const b = CFG.weapons[d.base], cmp = (v, bv, lowGood) => { if (v === bv || !bv) return ''; const pc = Math.round((v / bv - 1) * 100); if (!pc) return ''; const good = lowGood ? pc < 0 : pc > 0; return ' <span style="color:' + (good ? '#8fbf7f' : '#e0a060') + '">(' + (pc > 0 ? '+' : '−') + Math.abs(pc) + '%)</span>'; };
    h += this.row('Урон:', w.dmg + (w.pellets > 1 ? ' ×' + w.pellets + ' (картечь)' : '') + cmp(w.dmg, b.dmg)) + this.row('Скорострельность:', (1 / w.cd).toFixed(1) + ' выстр./с (≈ ' + dps.toFixed(0) + ' урона/с)' + cmp(1 / w.cd, 1 / b.cd));   // выше темп — лучше, поэтому сравниваем скорость, а не перезарядку
    h += this.row('Дальность:', w.range + cmp(w.range, b.range)) + this.row('Шум:', w.noise + cmp(w.noise, b.noise, true)) + this.row('Износ за выстрел:', w.wear + '%' + cmp(w.wear, b.wear, true));
    if (w.spread) h += this.row('Разброс:', w.spread + cmp(w.spread, b.spread, true));
    if (w.crit) h += this.row('★ Критический удар:', Math.round(w.crit * 100) + '% (×2)', '#e8a040'); if (w.ammoSave) h += this.row('★ Экономия:', Math.round(w.ammoSave * 100) + '% выстрелов бесплатны', '#e8a040');
    h += this.row('Боеприпас:', CFG.items[w.ammo || 'ammo'].name + (w.perAmmo ? ' (1 шт. = ' + w.perAmmo + ' выстрелов)' : ''));
    if (own) h += this.row('Состояние:', Math.round(P.cond[k]) + '%', P.cond[k] < 40 ? '#e0a060' : '#8fbf7f') + this.row('Цена продажи:', Wpn.sellPrice(k) + ' ₽');
    else if (defo) h += this.row('Сила:', Wpn.power(d).toFixed(2) + ' (обычное оружие ≈ 1.00)'); else h += this.row('Цена:', b.price + ' ₽') + this.row('Мастерская:', 'уровень ' + (b.lvl || 1));
    return h;
  },
  tuneTip(t, n, cap) {
    if (!t) return null; const c = Meta.tuneCost(n);
    return this.head('Тюнинг', n + ' / ' + cap, '#8fbf7f') + '<div class="ti-d">' + t.text + '. Улучшения необратимы, их число ограничено уровнем мастерской (или снабжения).</div>' + (n >= cap ? this.row('', 'Мест для улучшений нет', '#e0a060') : this.row('Цена:', Meta.matsText(c)));
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
  skill(k) {
    const s = CFG.skills[k]; if (!s) return null;
    return this.head(s.name, 'навык') + '<div class="ti-d">' + s.desc + '</div>' + this.row('Уровень:', P.sk[k] + ' / ' + s.max) + this.row('Очков навыков:', P.sp, P.sp ? '#e8c060' : null);
  },
  offer(o) {
    if (!o) return null;
    let h = this.head('Задание', 'предложение', '#e8c060') + '<div class="ti-d">' + o.text + '</div>' + this.row('Награда:', o.reward + ' ₽') + this.row('Репутация:', '+' + o.rep);
    if (o.item) h += this.row('Артефакт:', CFG.arts[o.item[1]].name);
    return h + this.row('Активных заданий:', P.quests.length + ' / 3', P.quests.length >= 3 ? '#e06060' : null);
  },
  quest(q) {
    if (!q) return null;
    const ok = Meta.done(q);
    return this.head('Задание', ok ? 'выполнено' : 'в работе', ok ? '#8fbf7f' : '#e8c060') + '<div class="ti-d">' + q.text + '</div>' + this.row('Прогресс:', Meta.progText(q), ok ? '#8fbf7f' : null) + this.row('Награда:', q.reward + ' ₽, репутация +' + q.rep);
  },

  // ---- подсказки при наведении на мир (зона и подземелье) ----
  STATE: { sleep: 'спит', wander: 'бродит', investigate: 'насторожен', hunt: 'охотится', flee: 'убегает', eat: 'ест', idle: 'не заметил тебя' },
  KIND: { crawl: 'Кусает вплотную, может вызвать кровотечение.', spit: 'Держится на расстоянии и плюёт кислотой: сгусток медленный, шаг в сторону — уворот.', shade: 'Слепая: идёт на шум. Красться — почти не слышит. Видна только вблизи.', charge: 'Замирает и несётся по прямой; врезавшись в стену, оглушён и уязвим.' },
  mutantFlags(c) {
    const f = []; if (c.pack) f.push('ходит стаей'); if (c.timid) f.push('пугливый'); if (c.territory) f.push('охраняет территорию'); if (c.metal) f.push('металлический — магнитная яма бьёт его сильнее');
    if (c.fireproof) f.push('огнеупорен'); if (c.charge) f.push('разбегается'); if (c.lunge) f.push('прыгает'); if (c.stalker) f.push('замирает под взглядом'); if (c.ambush) f.push('нападает из засады');
    if (c.aquatic) f.push('живёт в воде, хватает у кромки'); if (c.infect) f.push('укус заражает рану'); if (c.bleed) f.push('вызывает кровотечение'); if (c.fracture) f.push('может сломать ногу'); if (c.burn) f.push('может поджечь');
    return f;
  },
  mutant(m) {
    const c = m.c, act = { day: 'днём', night: 'ночью', weather: 'в туман и дождь' }[c.active];
    let h = this.head(c.name, this.STATE[m.state] || m.state, '#c9c2a8') + this.row('Здоровье:', Math.ceil(m.hp) + ' / ' + c.hp) + this.row('Урон:', c.dmg + (c.armor ? ' · броня ' + Math.round(c.armor * 100) + '%' : ''));
    if (!c.aquatic) h += this.row('Активен:', act);
    const fl = this.mutantFlags(c); if (fl.length) h += '<div class="ti-d">' + fl.join('; ') + '.</div>';
    return h + this.row('Трофей:', CFG.items[c.part].name + ' (' + CFG.items[c.part].val + ' ₽)') + this.row('Опыт:', c.xp);
  },
  stalker(s) {
    const kind = { loner: 'одиночка', bandit: 'бандит', patrol: 'оцепление', wounded: 'раненый' }[s.kind] || s.kind;
    return this.head(s.name, kind, s.hostile ? '#e06060' : '#c9c2a8') + this.row('Здоровье:', Math.ceil(s.hp) + ' / ' + s.c.hp) + this.row('Отношение:', s.state === 'wounded' ? 'нужна помощь (E)' : s.hostile ? 'враждебен' : 'нейтрален (E — поговорить)', s.hostile ? '#e06060' : '#8fbf7f');
  },
  denemy(e) {
    const c = e.c; let h = this.head(c.name, e.state === 'hunt' ? 'охотится' : this.STATE[e.state] || e.state, '#c9c2a8') + this.row('Здоровье:', Math.ceil(e.hp) + ' / ' + e.max) + this.row('Урон:', c.dmg + (c.armor ? ' · броня ' + Math.round(c.armor * 100) + '%' : ''));
    h += '<div class="ti-d">' + this.KIND[c.kind] + '</div>'; if (e.mode === 'stun') h += this.row('', 'оглушён: урон ×1.5', '#f0d060');
    return h + (c.drop ? this.row('Трофей:', CFG.items[c.drop.id].name + ' (' + Math.round(c.drop.p * 100) + '%)') : '') + this.row('Опыт:', c.xp);
  },
  CONT: { stash: 'Тайник', house: 'Дом', wreck: 'Остов', lab: 'Шкаф лаборатории', road: 'Обгоревший остов' },
  // Что лежит под курсором в мире (координаты экрана); null, если ничего или открыта панель
  world(mx, my) {
    if (typeof G === 'undefined' || !G.started || G.dead || G.ui) return null;
    const wx = mx + cam.x, wy = my + cam.y, near = (o, r) => Math.hypot(o.x - wx, o.y - wy) < r;
    if (G.scene === 'dungeon' && Dungeon.lvl) {
      for (const e of Dungeon.enemies) if (near(e, e.r + 10) && e.alpha() > 0.3) return this.denemy(e);
      const L = Dungeon.lvl, b = Dungeon.cur;
      L.lockers.forEach((k, i) => { const p = Dungeon.center(k.tx, k.ty); if (near(p, 26)) this._hit = this.head('Шкафчик', b.opened.includes(i) ? 'пуст' : 'закрыт') + '<div class="ti-d">' + (b.opened.includes(i) ? 'Здесь уже пусто.' : 'Подойди и нажми E: внутри хлам, патроны, иногда аптечка.') + '</div>'; });
      const v = Dungeon.center(L.vault.tx, L.vault.ty); if (near(v, 30)) this._hit = this.head('Сейф', b.opened.includes(99) ? 'вскрыт' : 'закрыт', '#e8c060') + '<div class="ti-d">' + (b.opened.includes(99) ? 'Пуст.' : 'Самая жирная добыча бункера: деньги, артефакт, знание. Подойди и нажми E.') + '</div>';
      const s = Dungeon.center(L.start.tx, L.start.ty); if (near(s, 30)) this._hit = this.head('Лестница', 'выход') + '<div class="ti-d">Наверх: E.</div>';
      const r = this._hit || null; this._hit = null; return r;
    }
    if (G.scene !== 'zone') return null;
    for (const m of Mutants.list) if (!m.dead && !Mutants.hidden(m) && !(m.sp === 'cinder' && m.state === 'sleep') && !(m.sp === 'fogger' && m.state === 'sleep') && near(m, m.r + 10) && Math.hypot(m.x - P.x, m.y - P.y) < 420) return this.mutant(m);
    for (const s of Stalkers.list) if (!s.dead && near(s, 16) && Math.hypot(s.x - P.x, s.y - P.y) < 420) return this.stalker(s);
    for (const l of W.loot) if (near(l, 14)) return (l.g ? this.suit({ id: l.id, n: 1, g: l.g }) : this.item(l.id, null, null, l.n)) + '<div class="ti-r">Подобрать: <b>E</b></div>';
    for (const c of W.conts) if (near(c, 30) && Math.hypot(c.x - P.x, c.y - P.y) < 200) return this.head(this.CONT[c.kind] || 'Контейнер', c.opened ? 'обыскан' : 'можно обыскать') + '<div class="ti-d">' + (c.opened ? 'Пусто.' : 'Подойди и нажми E: хлам, патроны, деньги.') + '</div>';
    for (const a of W.arts) if (near(a, 22) && Math.hypot(a.x - P.x, a.y - P.y) < artR() * 0.75) return this.head('Что-то поблёскивает', 'артефакт', '#e8c060') + '<div class="ti-d">Подойди и возьми (E). Если вокруг аномалия — сначала проверь болтом.</div>';
    for (const c of W.caches) if (near(c, 16)) return this.head('Твой хабар', 'тайник смерти', '#e06060') + '<div class="ti-d">Здесь остались артефакты и часть денег. Забери (E).</div>';
    return null;
  },
  // Подсказка по атрибуту кнопки строки (data-a)
  fromAttr(attr) {
    const [a, arg, arg2] = String(attr).split(':'), i = +arg, u = G.ui || {}, vk = u.k === 'trade' ? u.v : null;
    switch (a) {
      case 'equip': case 'use': case 'drop': case 'sell': case 'sellall': case 'ident': case 'research': case 'stash': return this.slot(P.inv[i], vk);
      case 'unstash': return this.slot((P.stash || [])[i]);
      case 'unequip': return P.equip[i] ? this.art(P.equip[i].art, null, P.equip[i].q) : null;
      case 'buy': return this.item(arg, 'buy');
      case 'wbuy': case 'wequip': case 'wrepair': case 'wsell': return this.weapon(arg);
      case 'wbuyg': return (P.gunOffers || [])[i] ? this.weapon(null, P.gunOffers[i].def) : null;
      case 'craft': return this.recipe(arg);
      case 'wwork': return this.weapon(arg);
      case 'salv': { const m = arg === 'w' ? (P.weapons.includes(arg2) ? Meta.salvageWeapon(arg2) : null) : Meta.salvageSlot(P.inv[+arg2]); const t = arg === 'w' ? this.weapon(arg2) : this.slot(P.inv[+arg2]); return t && m ? t + this.row('Разборка даст:', Meta.matsPlain(m), '#a8c890') + '<div class="ti-d">Нажми дважды, чтобы подтвердить. Вещь исчезнет.</div>' : null; }
      case 'wtune': return this.tuneTip(Wpn.TUNE[arg2], Wpn.tuneCount(arg), Camp.lvl('gun'));
      case 'gtune': { const s = P.inv[i]; return s && Gear.TUNE[arg2] ? this.tuneTip(Gear.TUNE[arg2], (s.g && s.g.t) || 0, Camp.lvl('gear')) : null; }
      case 'wrepairm': return this.head('Ремонт из хлама', 'без денег', '#a8c890') + '<div class="ti-d">Снимает весь износ оружия за металлолом и схемы. Навык «Ремонт» и уровень мастерской удешевляют.</div>';
      case 'srepairm': return this.head('Ремонт из хлама', 'без денег', '#a8c890') + '<div class="ti-d">Снимает весь износ костюма за металлолом и схемы.</div>';
      case 'skill': return this.skill(arg);
      case 'qacc': return this.offer(P.offers[i]);
      case 'qturn': case 'qdrop': return this.quest(P.quests[i]);
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
      clearTimeout(this.dwell);
      let html = null; try { html = this.resolve(e.target); } catch (err) { html = null; }
      if (html) return this.show(html, e.clientX, e.clientY);
      this.hide();
      // над миром показываем не сразу, а когда курсор постоял: иначе подсказки мешали бы целиться
      if (e.target && e.target.id === 'cv') { const x = e.clientX, y = e.clientY; this.dwell = setTimeout(() => { let h = null; try { h = this.world(x, y); } catch (err) { h = null; } if (h) this.show(h, x, y); }, 260); }
    });
    addEventListener('blur', () => this.hide());
    addEventListener('keydown', () => this.hide());   // Tab/Esc/E меняют панель, а мышь при этом не двигается
    const panel = document.getElementById('panel');   // перерисовка или закрытие панели — старая подсказка больше не к месту
    if (typeof MutationObserver !== 'undefined' && panel && panel.nodeType) new MutationObserver(() => this.hide()).observe(panel, { childList: true, attributes: true, attributeFilter: ['style'] });
  },
};
Tip.init();

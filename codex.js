'use strict';
// Справочник Зоны (клавиша B, кнопка 📚 на телефоне): мутанты, обитатели бункеров, аномалии, артефакты и места.
// Записи открываются по ходу игры: мутант — когда увидел (описание) и убил (характеристики и советы), аномалия — когда обнаружил,
// артефакт — когда опознал, место — когда там побывал. Прогресс хранится в P.codex = { m: {вид: {n: убито}}, d: {…}, a: {тип: 1}, b: {биом: 1} } и сохраняется.
// Числа берутся из CFG, тексты (описание и советы) — из CODEX.TEXT ниже; списки «где обитает» и «какие артефакты» строятся из конфига сами.
const Codex = {
  CATS: [{ k: 'm', n: 'Мутанты', ic: '☠' }, { k: 'd', n: 'Под землёй', ic: '▼' }, { k: 'a', n: 'Аномалии', ic: '◎' }, { k: 'r', n: 'Артефакты', ic: '✦' }, { k: 'b', n: 'Места', ic: '⌖' }],
  TEXT: {
    m: {
      listener: ['Ходит по ночам стаями. Почти слепой, зато слышит каждый шорох: шаг, выстрел, звон болта. Кусает до крови.', 'Красться (Ctrl или кнопка «Красться») почти вдвое тише. Стая опасна в открытом поле: держись у укрытий, бей по одиночкам, уводи шумом (болт в сторону). Кровотечение останавливает аптечка.'],
      glass: ['Безобидное травоядное, стаями пасётся на лугах. Пугливое: убегает, а не нападает. Им кормятся Слухачи и Щетинники.', 'Мясо и железы — ходовой товар и безопасный заработок. Крупные хищники за ними охотятся, поэтому стая стеклоедов иногда выдаёт, где рядом опасно.'],
      tin: ['Ржавый бронированный зверь со свалок и карьеров. Охраняет свою территорию и бросается с разбега. Слухачей не терпит.', 'Броня режет половину урона: бей в упор или дробью. Удар может сломать ногу (нужна шина). Металл сильнее всего страдает в Магнитной яме — заманивай туда.'],
      fogger: ['Появляется в туман и дождь. Пока на него смотрят — замирает, стоит отвернуться — подкрадывается.', 'Не отворачивайся: держи в поле зрения и стреляй, пока он замер. В ясную погоду не встречается.'],
      bristler: ['Днём охраняет свой участок леса и луга. Бьёт с разбега иглами по бокам, гоняет стеклоедов.', 'Иглы вызывают кровотечение — держи аптечку. Границу участка видно по поведению стеклоедов: обходи или бей издалека.'],
      rotter: ['Ночная стая из болот и руин. Укус заражает рану.', 'Заражение лечит только антибиотик (лаборатория и Снабженец). Ночью в болота без запаса лекарств лучше не ходить; в стае они опасны, у стены — терпимо.'],
      drowner: ['Прячется под водой и хватает за ноги того, кто подошёл к кромке или забрёл в воду. Из пруда не уходит.', 'Не стой у самой воды. Схватил — жми движение в стороны: рывки сокращают хватку. Обходи пруды или бей издали, пока он не проснулся.'],
      cinder: ['Спит в золе Гари и выпрыгивает из засады на подошедшего. Огнеупорен, поджигает укусом.', 'Огонь его не берёт (огнемёт бесполезен), обычное оружие — да. Спящих обходи. Ожог тушится водой или аптечкой; огнеупорный плащ его режет.'],
    },
    d: {
      crawler: ['Подземник: слепо прёт на ближнего и кусает до крови. Слабый, но обычно их несколько.', 'Держись коридоров, отступай к лестнице, не давай окружить.'],
      spitter: ['Кислотник держится на расстоянии и после короткого замаха плюёт медленным сгустком (урон и замедление).', 'Шаг в сторону — и сгусток мимо. Прячься за углом, а потом выскакивай и добивай.'],
      shade: ['Тень слепая и идёт на шум: бег слышно издалека, шаг ближе, крадущегося почти не слышно. Видна только вблизи.', 'Крадись. Налобный фонарь расширяет круг, в котором тень различима. Горящую или раненую видно лучше.'],
      carapace: ['Панцирник медленный и бронированный. Заметив тебя в прямом коридоре, замирает, потом несётся по прямой.', 'Не стой на линии разбега: уйди в сторону. Врезавшись в стену, он оглушён и уязвим (урон ×1.5) — самое время стрелять.'],
    },
    a: {
      plesh: ['Круглая проплешина. Земля голая, вокруг дохлые комары.', 'Постоянный сильный урон, пока стоишь внутри. Не заходи без нужды и не задерживайся.'],
      grinder: ['Обрывки одежды и кости кольцом. Иногда слышен скрежет.', 'Работает циклами: пауза — короткий смертельный удар. Проходи в паузу, а по скрежету отходи.'],
      funnel: ['Пыль кружит по спирали, трава лежит по кругу.', 'Затягивает к центру, а в самом ядре урон резко выше. Иди по краю и не поддавайся течению: отходи сразу, как потянуло.'],
      electra: ['Воздух потрескивает, на камнях нагар.', 'Копит заряд (потрескивание нарастает) и бьёт разрядом. Проходи сразу после разряда.'],
      fluff: ['Белые хлопья висят в воздухе почти неподвижно.', 'Замедляет и понемногу жжёт. Опасна тем, что задерживает: не заходи с мутантами на хвосте.'],
      slime: ['Блестящая плёнка на земле. Ни одной мухи.', 'Сильно замедляет, почти не ранит. Опасна только в связке с врагом рядом. Часто прячет самые бесполезные «пустышки».'],
      spring: ['Земля пружинит под ногой. Трава примята кольцами.', 'Раз в несколько секунд подбрасывает и отшвыривает, удар заметный. Смотри на кольца и проходи в паузу.'],
      magnet: ['Ржавчина тянется к центру, железки лежат кольцом.', 'Тянет к центру, металл рвёт втрое сильнее живого: заманивай туда Жестянок. Болты и железки притягивает.'],
      smolder: ['Земля тлеет красным, тянет дымом. Вокруг ни травинки.', 'Между вспышками просто светится; вспышка — конус туда, куда «смотрит» колодец (видно по заряду). Поджигает; огнеупорный плащ режет ожог.'],
    },
    b: {
      meadow: 'Открытые луга. Тихо, далеко видно, укрытий мало. Здесь кормятся стеклоеды.',
      forest: 'Лес. Видимость ниже, деревья скрывают засады. Днём здесь хозяйничают Щетинники.',
      town: 'Руины Хармонта. Дома с добычей, тайники и остовы машин. Ночью — Слухачи, среди руин — Жестянки.',
      junkyard: 'Свалка техники. Много металла и остовов, много Жестянок; магнитные аномалии.',
      swamp: 'Болото. Сыро, тяжело идти, ночью — Гнилозубы, у воды — Топляки.',
      industrial: 'Заводская зона. Корпуса, ржавое железо, Жестянки и опасные аномалии.',
      quarry: 'Карьер. Открытые уступы, металл и тяжёлые мутанты.',
      deadfield: 'Мёртвое поле. Ничего не растёт; ночью здесь ходят стаи.',
      saltflat: 'Солончак. Белая плоская равнина: далеко видно и далеко слышно.',
      lake: 'Озёрный край. Пруды и топи; у кромки воды караулят Топляки.',
      burnt: 'Гарь. Выгоревшая земля, Пепельный тракт из обгоревших остовов, Тлеющие колодцы и Углеглоты.',
    },
  },
  ACT: { day: 'днём', night: 'ночью', weather: 'в туман и дождь' },

  ensure() { const c = P.codex || (P.codex = {}); for (const k of ['m', 'd', 'a', 'b']) if (!c[k]) c[k] = {}; return c; },
  // Запись: новая — сообщение в лог. n — прибавка к счётчику убийств
  see(cat, id, n = 0) {
    const c = this.ensure()[cat]; let e = c[id], fresh = false;
    if (!e) { e = c[id] = cat === 'm' || cat === 'd' ? { n: 0 } : { n: 1 }; fresh = true; }
    e.n += n;
    if (fresh) log('Справочник: новая запись — ' + this.title(cat, id) + ' (B)', '#9ad0e8');
    else if (n && e.n === 1 && (cat === 'm' || cat === 'd')) log('Справочник: ' + this.title(cat, id) + ' изучен — открыты характеристики и советы (B)', '#9ad0e8');
    return e;
  },
  title(cat, id) { return cat === 'm' ? CFG.mut[id].name : cat === 'd' ? CFG.dungeon.enemies[id].name : cat === 'a' ? CFG.anoms[id].name : cat === 'r' ? CFG.arts[id].name : CFG.biomes[id].name; },
  ids(cat) { return cat === 'm' ? Object.keys(CFG.mut) : cat === 'd' ? Object.keys(CFG.dungeon.enemies) : cat === 'a' ? Object.keys(CFG.anoms) : cat === 'r' ? Object.keys(CFG.arts) : Object.keys(CFG.biomes); },
  open(cat, id) { const c = this.ensure(); return cat === 'r' ? !!P.known[id] : !!c[cat][id]; },
  count(cat) { const ids = this.ids(cat); return { have: ids.filter(i => this.open(cat, i)).length, all: ids.length }; },
  total() { let h = 0, a = 0; for (const c of this.CATS) { const n = this.count(c.k); h += n.have; a += n.all; } return { have: h, all: a }; },
  // Изучен ли вид: убит хотя бы раз (характеристики и советы)
  studied(cat, id) { const e = this.ensure()[cat][id]; return !!(e && e.n > 0); },

  // ---------- наблюдение ----------
  tick(dt) {
    if (!G.started || G.dead) return; this.ensure(); this.t = (this.t || 0) - dt; if (this.t > 0) return; this.t = 0.4;
    if (G.scene === 'zone') {
      this.see('b', W.biomeAt(P.x, P.y), 0);
      for (const m of Mutants.list) if (!m.dead && !Mutants.hidden(m) && !(m.sp === 'cinder' && m.state === 'sleep') && !(m.sp === 'fogger' && m.state === 'sleep') && CFG.mut[m.sp] && Math.hypot(m.x - P.x, m.y - P.y) < 300) { if (!this.ensure().m[m.sp]) this.see('m', m.sp); }
      for (const a of W.anoms) if ((a.known || a.revealed > 0) && !this.ensure().a[a.type]) this.see('a', a.type);
    } else if (G.scene === 'dungeon' && typeof Dungeon !== 'undefined') {
      for (const e of Dungeon.enemies || []) if (!e.dead && e.alpha() > 0.3 && Math.hypot(e.x - P.x, e.y - P.y) < 280 && !this.ensure().d[e.type]) this.see('d', e.type);
    }
  },

  // ---------- панель ----------
  openPanel() { G.ui = { k: 'codex', tab: (G.ui && G.ui.tab) || 'm', sel: null }; renderPanel(); },
  html(u) {
    const tot = this.total(), cat = this.CATS.find(c => c.k === u.tab) || this.CATS[0], ids = this.ids(cat.k);
    let h = '<div class="x" data-a="close">✕ Esc</div><h2>Справочник Зоны</h2><div class="stat">Открыто записей: <b>' + tot.have + ' из ' + tot.all + '</b>. Мутанты изучаются, когда их увидишь и убьёшь; аномалии — когда найдёшь; артефакты — когда опознаешь; места — когда побываешь.</div>';
    h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0">' + this.CATS.map(c => { const n = this.count(c.k); return '<button class="btn" data-a="cxt:' + c.k + '" style="' + (c.k === cat.k ? 'border-color:#b5742a;background:#3a2f16;color:#f0d9a0' : '') + '">' + c.ic + ' ' + c.n + ' ' + n.have + '/' + n.all + '</button>'; }).join('') + '</div>';
    h += '<div class="cols"><div>';
    for (const id of ids) {
      const on = this.open(cat.k, id), sel = u.sel === id;
      h += '<div class="row"' + (on ? ' data-a="cx:' + cat.k + ':' + id + '" style="cursor:pointer' + (sel ? ';background:#1c1b14;border-left:2px solid #b5742a' : '') + '"' : ' style="opacity:.45"') + '><div class="ic">' + (on ? cat.ic : '?') + '</div><div class="nm">' + (on ? this.title(cat.k, id) : '??? ') + '<div class="sub">' + (on ? this.sub(cat.k, id) : 'Не открыто') + '</div></div></div>';
    }
    h += '</div><div>' + (u.sel && this.open(cat.k, u.sel) ? this.detail(cat.k, u.sel) : '<div class="stat">Выберите запись слева.</div>') + '</div></div>';
    return h;
  },
  sub(cat, id) {
    if (cat === 'm' || cat === 'd') { const e = this.ensure()[cat][id]; return e && e.n > 0 ? 'Изучен · убито: ' + e.n : 'Замечен — убей, чтобы изучить'; }
    if (cat === 'r') return CFG.arts[id].desc;
    return cat === 'a' ? 'Найдена' : 'Посещено';
  },
  detail(cat, id) {
    const t = cat === 'b' ? [this.TEXT.b[id]] : (this.TEXT[cat] || {})[id] || [], row = (l, v) => '<div class="ti-r" style="color:#7d7864">' + l + ' <b style="color:#c9c2a8;font-weight:normal">' + v + '</b></div>';
    let h = '<h3 style="margin-top:0;color:#b5742a">' + this.title(cat, id) + '</h3>';
    if (cat === 'm') {
      const c = CFG.mut[id], st = this.studied('m', id), e = this.ensure().m[id];
      h += '<div class="note">' + t[0] + '</div>';
      const fl = Tip.mutantFlags(c); if (fl.length) h += '<div class="stat" style="margin:6px 0">Повадки: ' + fl.join('; ') + '.</div>';
      h += row('Обитает:', c.biomes.map(b => CFG.biomes[b].name).join(', ')) + row('Активен:', this.ACT[c.active] || '') + (c.pack ? row('Стая:', c.pack[0] + '–' + c.pack[1] + ' особей') : '');
      if (st) {
        h += '<div style="margin-top:8px"></div>' + row('Здоровье:', c.hp) + row('Урон:', c.dmg + (c.armor ? ' · броня ' + Math.round(c.armor * 100) + '%' : '')) + row('Трофей:', CFG.items[c.part].name + ' (' + CFG.items[c.part].val + ' ₽)') + row('Опыт:', c.xp) + row('Убито:', e.n);
        h += '<h3>Как справиться</h3><div class="note">' + t[1] + '</div>';
      } else h += '<div class="stat" style="margin-top:8px">Характеристики и советы откроются, когда убьёшь такого.</div>';
    } else if (cat === 'd') {
      const c = CFG.dungeon.enemies[id], st = this.studied('d', id), e = this.ensure().d[id];
      h += '<div class="note">' + t[0] + '</div>' + row('Встречается:', 'в бункерах (чем глубже сектор, тем чаще)');
      if (st) h += '<div style="margin-top:8px"></div>' + row('Здоровье:', c.hp) + row('Урон:', c.dmg + (c.armor ? ' · броня ' + Math.round(c.armor * 100) + '%' : '')) + (c.drop ? row('Трофей:', CFG.items[c.drop.id].name + ' (' + Math.round(c.drop.p * 100) + '%)') : '') + row('Опыт:', c.xp) + row('Убито:', e.n) + '<h3>Как справиться</h3><div class="note">' + t[1] + '</div>';
      else h += '<div class="stat" style="margin-top:8px">Характеристики и советы откроются, когда убьёшь такого.</div>';
    } else if (cat === 'a') {
      const c = CFG.anoms[id], where = Object.keys(CFG.biomes).filter(b => (CFG.biomes[b].am[id] || 0) > 0).map(b => CFG.biomes[b].name);
      h += '<div class="note">Признак: ' + t[0] + '</div>' + row('Болт покажет:', c.react) + row('Радиус:', c.r + ' пикс.') + (where.length ? row('Встречается:', where.join(', ')) : '');
      h += '<h3>Как обойти</h3><div class="note">' + t[1] + '</div>';
      h += '<h3>Артефакты в ней</h3><div class="stat">' + c.arts.map(a => P.known[a] ? '<b>' + CFG.arts[a].name + '</b>' : '???').join(', ') + '</div>';
    } else if (cat === 'r') {
      const a = CFG.arts[id], where = Object.keys(CFG.anoms).filter(k => CFG.anoms[k].arts.includes(id)).map(k => this.open('a', k) ? CFG.anoms[k].name : '???');
      h += '<div class="note">' + a.desc + '</div>';
      for (const k in a.fx) if (Tip.FX[k]) h += '<div class="ti-r">▸ <b style="color:#c9c2a8;font-weight:normal">' + Tip.FX[k](Tip.FX_ROUND.includes(k) ? a.fx[k] : Math.round(a.fx[k] * 10) / 10) + '</b></div>';
      h += row('Фон:', a.rad ? a.rad.toFixed(2) : 'нет') + row('Вес:', a.w + ' кг') + row('Ценность:', a.val + ' ₽') + '<div class="stat" style="margin-top:6px">Значения — для качества «Обычный»; у каждого экземпляра сила эффектов своя (×0.70–1.35).</div>';
      h += row('Ищи в:', where.length ? where.join(', ') : id === 'echo' ? 'награда за цепочку «Нижний ярус»' : 'не встречается в аномалиях');
    } else {
      const inh = Object.keys(CFG.mut).filter(k => CFG.mut[k].biomes.includes(id)).map(k => this.open('m', k) ? CFG.mut[k].name : '???'), an = Object.keys(CFG.anoms).filter(k => (CFG.biomes[id].am[k] || 0) > 0).map(k => this.open('a', k) ? CFG.anoms[k].name : '???');
      h += '<div class="note">' + t[0] + '</div>' + row('Мутанты:', inh.join(', ') || '—') + row('Аномалии:', an.join(', ') || '—');
    }
    return h;
  },
};

(function () {
  // выпавший мутант или обитатель бункера — запись «убит»
  const _md = Mutant.prototype.die; Mutant.prototype.die = function (src) { const was = this.dead; _md.call(this, src); if (!was && this.dead && CFG.mut[this.sp]) Codex.see('m', this.sp, 1); };
  const _dd = DEnemy.prototype.die; DEnemy.prototype.die = function (src) { const was = this.dead; _dd.call(this, src); if (!was && this.dead) Codex.see('d', this.type, 1); };
  const _upd = update; update = function (dt) { _upd(dt); Codex.tick(dt); };
  // панель и клики
  const _render = Camp.render; Camp.render = function (u) { if (u.k === 'codex') { panel.style.display = 'block'; const st = panel.scrollTop; panel.innerHTML = Codex.html(u); panel.scrollTop = st; return true; } return _render.call(this, u); };
  const _click = Meta.click; Meta.click = function (a, arg, arg2, u) {
    if (a === 'cxt') { u.tab = arg; u.sel = null; return true; }
    if (a === 'cx') { u.tab = arg; u.sel = arg2; return true; }
    return _click.call(this, a, arg, arg2, u);
  };
  if (typeof addEventListener === 'function') addEventListener('keydown', e => {
    if (e.code !== 'KeyB' || e.repeat || !G.started || G.dead) return;
    if (G.ui && G.ui.k === 'codex') closePanel(); else if (!G.ui || G.ui.k !== 'menu') { closePanel(); Codex.openPanel(); }
  });
})();

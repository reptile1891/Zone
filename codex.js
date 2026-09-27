'use strict';
// Справочник Зоны (клавиша B, кнопка 📚 на телефоне): мутанты (в том числе обитатели бункеров), аномалии, артефакты и места.
// Записи открываются по ходу игры: мутант — когда увидел (описание) и убил (характеристики и советы), аномалия — когда обнаружил,
// артефакт — когда опознал, место — когда там побывал. Прогресс хранится в P.codex = { m: {вид: {n: убито}}, d: {…}, a: {тип: 1}, b: {биом: 1} } и сохраняется.
// Числа берутся из CFG, тексты (описание и советы) — из CODEX.TEXT ниже; списки «где обитает» и «какие артефакты» строятся из конфига сами.
const Codex = {
  CATS: [{ k: 'm', n: 'Мутанты', ic: '☠' }, { k: 'a', n: 'Аномалии', ic: '◎' }, { k: 'r', n: 'Артефакты', ic: '✦' }, { k: 'w', n: 'Оружие', ic: '⌐' }, { k: 'i', n: 'Предметы', ic: '▣' }, { k: 'b', n: 'Места', ic: '⌖' }],
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
      switcher: ['Рельсы блестят чище, чем должны. Гравий вокруг лежит полосой, будто его сдуло в одну сторону.', 'Копит заряд, потом рывком отшвыривает вдоль путей — не от центра, как Пружина. Смотри, куда «смотрит» стрелка (видно по заряду), и не стой у неё на пути.'],
    },
    w: {
      pistol: 'Табельный ствол сталкера. Слабый, зато с самого начала и почти не требует ухода.',
      sawnoff: 'Обрез двустволки: картечь на короткой дистанции. Шумный и медленный, но вблизи валит.',
      revolver: 'Надёжный и точный, бьёт заметно сильнее пистолета. Хороший первый апгрейд.',
      rifle: 'Дальнобойная и мощная, но медленная. Для тех, кто выбирает цель заранее.',
      flamer: 'Огнемёт-самоделка: конус огня бьёт всех внутри сквозь броню и поджигает. Ест топливо (канистры). Огнеупорным мутантам не страшен.',
      crossbow: 'Самострел: почти бесшумный, из засады (по неподозревающей цели) бьёт вдвое сильнее. Стреляет болтами.',
      smg: 'ПП «Оса»: очень частые выстрелы и большой разброс. Жрёт патроны, зато плотный огонь спасает в стае.',
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
      depot: 'Депо. Заброшенная сортировочная станция: составы, ржавые пути и Стрелки — рывком отшвыривают вдоль рельсов.',
    },
  },
  ACT: { day: 'днём', night: 'ночью', weather: 'в туман и дождь' },

  // ---------- картинки ----------
  // Мутанты и обитатели бункеров — их игровые спрайты, аномалии — схематичный рисунок по цвету и повадке, артефакты — значок по главному свойству,
  // места — кусочек местности из настоящих спрайтов. Рисуются в data-URL один раз (кэш), при сбое картинки просто нет.
  _pics: {},
  FXCOL: { radRes: '#7ad07a', stamRegen: '#e8d060', carry: '#6aa8e8', hpRegen: '#e06060', psy: '#a070d0', repel: '#e8e8f4', lure: '#d09060', fireRes: '#e88a30', sight: '#60d8e0' },
  PROPSPR: { car: 'car_b', dtuft: 'tuft_d', container: 'crate', barrel: 'barrel' },
  rnd(str) { let h = 2166136261; for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) + 1013904223 | 0) >>> 0) / 4294967296; },
  // Готовые пиксельные значки оружия и предметов (Icons) — в рамке, увеличенные
  frame(inner, S) { return '<div style="width:' + S + 'px;height:' + S + 'px;background:#10120d;border:1px solid #33321f;display:flex;align-items:center;justify-content:center;flex:none">' + inner + '</div>'; },
  iconImg(html, S) {
    const m = /src="([^"]+)"/.exec(html || ''), sz = Math.round(S * 0.72);
    return this.frame(m ? '<img src="' + m[1] + '" width="' + sz + '" height="' + sz + '" style="image-rendering:pixelated;display:block" alt="">' : '<span style="font-size:' + Math.round(S * 0.5) + 'px;line-height:1">' + (html || '?') + '</span>', S);
  },
  img(cat, id, S) {
    cat = this.rc(cat, id);
    if (cat === 'w') { const u = Icons.cache['w_' + id]; return u ? this.frame('<img src="' + u + '" width="' + Math.round(S * 0.8) + '" height="' + Math.round(S * 0.8) + '" style="image-rendering:pixelated;display:block" alt="">', S) : ''; }
    if (cat === 'i') return this.iconImg(CFG.items[id].icon, S);
    const key = cat + ':' + id + ':' + S; let u = this._pics[key];
    if (u === undefined) { try { u = this.paint(cat, id, S) || ''; } catch (e) { u = ''; } this._pics[key] = u; }
    return u ? '<img src="' + u + '" width="' + S + '" height="' + S + '" style="image-rendering:pixelated;display:block" alt="">' : '';
  },
  // Значок артефакта для рюкзака, торговли и контейнеров (у неопознанного — общий «?»-значок)
  artHtml(id) {
    if (!P.known[id]) return Icons.html('art_u');
    const key = 'r:' + id + ':bare'; let u = this._pics[key];
    if (u === undefined) { try { u = this.paint('r', id, 32, true) || ''; } catch (e) { u = ''; } this._pics[key] = u; }
    return u ? '<img class="ico" src="' + u + '" alt="">' : Icons.html('art');
  },
  paint(cat, id, S, bare) {
    const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    if (!bare) { g.fillStyle = '#10120d'; g.fillRect(0, 0, S, S); g.strokeStyle = '#33321f'; g.strokeRect(0.5, 0.5, S - 1, S - 1); }
    const R = this.rnd(cat + id), sprite = (spr, box) => { const w = spr.width, h = spr.height, k = Math.max(1, Math.floor(Math.min(box / w, box / h))); return { w: w * k, h: h * k }; };
    if (cat === 'm' || cat === 'd') {
      if (cat === 'd' && typeof Dungeon !== 'undefined') Dungeon.initSprites();   // спрайты подземных врагов создаются лениво
      const spr = Spr.cache[cat === 'd' ? CFG.dungeon.enemies[id].spr : id]; if (!spr) return '';
      const d = sprite(spr, S - 10); g.drawImage(spr, Math.round((S - d.w) / 2), Math.round((S - d.h) / 2), d.w, d.h);
    } else if (cat === 'a') this.anom(g, id, S, R);
    else if (cat === 'r') this.gem(g, id, S);
    else {
      const b = CFG.biomes[id]; g.fillStyle = b.map; g.fillRect(1, 1, S - 2, S - 2);
      const props = Object.keys(b.props).map(k => [k, this.PROPSPR[k] && Spr.cache[this.PROPSPR[k]] ? this.PROPSPR[k] : k]).filter(p => Spr.cache[p[1]]).sort((x, y) => b.props[y[0]] - b.props[x[0]]).slice(0, 6);
      props.forEach((p, i) => { const spr = Spr.cache[p[1]], d = sprite(spr, S * 0.36), cx = S * (0.2 + (i % 3) * 0.3) + (R() - 0.5) * S * 0.06, cy = S * (i < 3 ? 0.34 : 0.72) + (R() - 0.5) * S * 0.06; g.drawImage(spr, Math.round(cx - d.w / 2), Math.round(cy - d.h / 2), d.w, d.h); });
    }
    return c.toDataURL();
  },
  // Аномалия: свечение и кольцо цвета из конфига, внутри — примета типа
  anom(g, id, S, R) {
    const a = CFG.anoms[id], k = S / 64, cx = S / 2, cy = S / 2, col = a.col, dot = (x, y, r, c) => { g.fillStyle = c; g.fillRect(Math.round(cx + x * k), Math.round(cy + y * k), Math.max(1, Math.round(r * k)), Math.max(1, Math.round(r * k))); };
    const gr = g.createRadialGradient(cx, cy, 2 * k, cx, cy, 28 * k); gr.addColorStop(0, col + '88'); gr.addColorStop(1, col + '00'); g.fillStyle = gr; g.fillRect(2, 2, S - 4, S - 4);
    g.strokeStyle = col; g.lineWidth = Math.max(1, 2 * k); g.beginPath(); g.arc(cx, cy, 24 * k, 0, 6.283); g.stroke();
    const ring = (n, r0, r1, c, sz) => { for (let i = 0; i < n; i++) { const t = i / n * 6.283 + R() * 0.3, r = r0 + (r1 - r0) * R(); dot(Math.cos(t) * r, Math.sin(t) * r, sz, c); } };
    switch (id) {
      case 'plesh': g.fillStyle = '#5a4a30'; g.beginPath(); g.arc(cx, cy, 15 * k, 0, 6.283); g.fill(); ring(14, 6, 22, '#20180e', 2); break;
      case 'grinder': ring(14, 12, 21, '#d8cfae', 3); ring(6, 4, 10, '#a05050', 2); break;
      case 'funnel': for (let t = 0; t < 12; t += 0.25) dot(Math.cos(t) * (2 + t * 1.8), Math.sin(t) * (2 + t * 1.8), 2, '#e8dcb0'); break;
      case 'electra': g.strokeStyle = '#dff0ff'; g.lineWidth = Math.max(1, 2 * k); g.beginPath(); g.moveTo(cx - 8 * k, cy - 22 * k); g.lineTo(cx + 2 * k, cy - 6 * k); g.lineTo(cx - 6 * k, cy + 2 * k); g.lineTo(cx + 6 * k, cy + 22 * k); g.stroke(); break;
      case 'fluff': ring(22, 0, 21, '#fff8e8', 2); break;
      case 'slime': g.fillStyle = col; g.beginPath(); g.arc(cx, cy, 16 * k, 0, 6.283); g.fill(); dot(-6, -6, 5, '#e8ffe8'); dot(4, 3, 3, '#e8ffe8'); break;
      case 'spring': g.strokeStyle = '#f0d890'; g.lineWidth = Math.max(1, 2 * k); for (const r of [8, 15, 21]) { g.beginPath(); g.arc(cx, cy, r * k, 0, 6.283); g.stroke(); } break;
      case 'magnet': for (let i = 0; i < 8; i++) { const t = i / 8 * 6.283; dot(Math.cos(t) * 18 - 2, Math.sin(t) * 18 - 2, 4, '#b0c0d8'); } dot(-3, -3, 6, '#5a6a80'); break;
      case 'smolder': g.fillStyle = '#ffb060'; g.beginPath(); g.arc(cx, cy, 7 * k, 0, 6.283); g.fill(); ring(10, 8, 20, '#7a2a10', 3); break;
      case 'switcher': g.strokeStyle = col; g.lineWidth = Math.max(1, 2 * k); g.beginPath(); g.moveTo(cx - 20 * k, cy); g.lineTo(cx, cy); g.lineTo(cx + 18 * k, cy - 14 * k); g.moveTo(cx, cy); g.lineTo(cx + 18 * k, cy + 14 * k); g.stroke(); break;
      default: ring(10, 6, 20, col, 3);
    }
  },
  // Артефакт: 16×16 «камень»; цвет — по главному свойству, форма — по номеру в списке, чтобы разные были не похожи
  gem(g, id, S) {
    const a = CFG.arts[id], main = Object.keys(a.fx)[0], col = this.FXCOL[main] || '#8a8a8a', shape = Object.keys(CFG.arts).indexOf(id) % 4, dark = '#00000055', light = '#ffffff88';
    const px = document.createElement('canvas'); px.width = px.height = 16; const p = px.getContext('2d');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const u = x - 7.5, v = y - 7.5, au = Math.abs(u), av = Math.abs(v);
      const inside = shape === 0 ? au + av < 6.5 : shape === 1 ? u * u + v * v < 42 : shape === 2 ? (au * av < 7 && au + av < 9) : (v > -1 ? u * u + v * v < 40 : au < (v + 7) * 0.9 && v > -7);
      if (!inside) continue; p.fillStyle = col; p.fillRect(x, y, 1, 1);
      if (u + v > 5) { p.fillStyle = dark; p.fillRect(x, y, 1, 1); } else if (u + v < -4) { p.fillStyle = light; p.fillRect(x, y, 1, 1); }
    }
    const core = Math.floor(Object.keys(CFG.arts).indexOf(id) / 4) % 4;   // вторая примета, чтобы одноцветные камни не путались
    p.fillStyle = '#000000aa'; if (core === 1) p.fillRect(7, 7, 2, 2); else if (core === 2) { p.fillRect(7, 5, 2, 6); p.fillRect(5, 7, 6, 2); } else if (core === 3) { p.fillRect(5, 5, 6, 1); p.fillRect(5, 10, 6, 1); p.fillRect(5, 5, 1, 6); p.fillRect(10, 5, 1, 6); }
    g.drawImage(px, Math.round(S * 0.12), Math.round(S * 0.12), Math.round(S * 0.76), Math.round(S * 0.76));
  },

  ensure() { const c = P.codex || (P.codex = {}); for (const k of ['m', 'd', 'a', 'b', 'r', 'w', 'i']) if (!c[k]) c[k] = {}; return c; },
  // Запись открыта в справочнике — метка «новое» снимается
  viewed(cat, id) { const e = this.ensure()[this.rc(cat, id)][id]; if (e && e.nw) delete e.nw; },
  isNew(cat, id) { const e = this.ensure()[this.rc(cat, id)][id]; return !!(e && e.nw); },
  anyNew(cat) { return this.ids(cat).some(id => this.open(cat, id) && this.isNew(cat, id)); },
  // Запись: новая — сообщение в лог. n — прибавка к счётчику убийств
  see(cat, id, n = 0, silent) {
    const c = this.ensure()[cat]; let e = c[id], fresh = false;
    if (!e) { e = c[id] = cat === 'm' || cat === 'd' ? { n: 0 } : { n: 1 }; fresh = true; if (!silent) e.nw = 1; }   // nw — «новое», пока запись не открыли в справочнике
    e.n += n;
    if (fresh && !silent) log('Справочник: новая запись — ' + this.title(cat, id) + ' (B)', '#9ad0e8');
    else if (n && e.n === 1 && (cat === 'm' || cat === 'd')) { e.nw = 1; log('Справочник: ' + this.title(cat, id) + ' изучен — открыты характеристики и советы (B)', '#9ad0e8'); }
    return e;
  },
  // Обитатели бункеров показываются во вкладке «Мутанты»; хранятся и считаются отдельно (P.codex.d)
  rc(cat, id) { return cat === 'm' && !CFG.mut[id] && CFG.dungeon.enemies[id] ? 'd' : cat; },
  title(cat, id) { cat = this.rc(cat, id); return cat === 'm' ? CFG.mut[id].name : cat === 'd' ? CFG.dungeon.enemies[id].name : cat === 'a' ? CFG.anoms[id].name : cat === 'r' ? CFG.arts[id].name : cat === 'w' ? CFG.weapons[id].name : cat === 'i' ? CFG.items[id].name : CFG.biomes[id].name; },
  ids(cat) { return cat === 'm' ? Object.keys(CFG.mut).concat(Object.keys(CFG.dungeon.enemies)) : cat === 'd' ? Object.keys(CFG.dungeon.enemies) : cat === 'a' ? Object.keys(CFG.anoms) : cat === 'r' ? Object.keys(CFG.arts) : cat === 'w' ? Object.keys(CFG.weapons) : cat === 'i' ? Object.keys(CFG.items).filter(k => k !== 'art') : Object.keys(CFG.biomes); },
  open(cat, id) { cat = this.rc(cat, id); const c = this.ensure(); return cat === 'r' ? !!P.known[id] : !!c[cat][id]; },
  // Изучен ли вид: убит хотя бы раз (характеристики и советы)
  studied(cat, id) { cat = this.rc(cat, id); const e = this.ensure()[cat][id]; return !!(e && e.n > 0); },

  // ---------- наблюдение ----------
  tick(dt) {
    if (!G.started || G.dead) return; const cx = this.ensure(); this.t = (this.t || 0) - dt; if (this.t > 0) return; this.t = 0.4;
    // при первой проверке (новая игра или старое сохранение) уже имеющееся заносится молча
    const quiet = !cx.init; cx.init = 1;
    for (const sl of P.inv) if (!sl.art && CFG.items[sl.id] && !cx.i[sl.id]) this.see('i', sl.id, 0, quiet);
    for (const id of P.weapons) { const b = Wpn.base(id); if (CFG.weapons[b] && !cx.w[b]) this.see('w', b, 0, quiet); }
    for (const id in P.known) if (P.known[id] && CFG.arts[id] && !cx.r[id]) this.see('r', id, 0, quiet);
    if (G.scene === 'zone') {
      this.see('b', W.biomeAt(P.x, P.y), 0);
      for (const m of Mutants.list) if (!m.dead && !Mutants.hidden(m) && !(m.sp === 'cinder' && m.state === 'sleep') && !(m.sp === 'fogger' && m.state === 'sleep') && CFG.mut[m.sp] && Math.hypot(m.x - P.x, m.y - P.y) < 300) { if (!this.ensure().m[m.sp]) this.see('m', m.sp); }
      for (const a of W.anoms) if ((a.known || a.revealed > 0) && !this.ensure().a[a.type]) this.see('a', a.type);
    } else if (G.scene === 'dungeon' && typeof Dungeon !== 'undefined') {
      for (const e of Dungeon.enemies || []) if (!e.dead && e.alpha() > 0.3 && Math.hypot(e.x - P.x, e.y - P.y) < 280 && !this.ensure().d[e.type]) this.see('d', e.type);
    }
  },

  // ---------- панель ----------
  openPanel() { G.ui = { k: 'codex', tab: (G.ui && G.ui.tab) || 'm', sel: null, q: '' }; renderPanel(); },
  html(u) {
    const cat = this.CATS.find(c => c.k === u.tab) || this.CATS[0], q = (u.q || '').trim().toLowerCase();
    const all = this.ids(cat.k).filter(id => this.open(cat.k, id)), ids = q ? all.filter(id => this.title(cat.k, id).toLowerCase().includes(q)) : all;
    let h = '<div class="x" data-a="close">✕ Esc</div><h2>Справочник Зоны</h2><div class="stat">Записи появляются по ходу игры: мутантов заносят, когда увидишь, а характеристики и советы — когда убьёшь; аномалии — когда найдёшь; артефакты — когда опознаешь; оружие и предметы — когда получишь; места — когда побываешь.</div>';
    h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0">' + this.CATS.map(c => '<button class="btn" data-a="cxt:' + c.k + '" style="' + (c.k === cat.k ? 'border-color:#b5742a;background:#3a2f16;color:#f0d9a0' : '') + '">' + c.ic + ' ' + c.n + (this.anyNew(c.k) ? ' <span style="color:#7fe07f">●</span>' : '') + '</button>').join('') + '</div>';
    if (all.length > 5) h += '<input id="cxq" type="text" placeholder="Поиск по названию…" value="' + (u.q || '').replace(/"/g, '') + '" autocomplete="off" style="width:100%;margin:0 0 6px;padding:7px 9px;background:#0e0f0b;border:1px solid #4a4634;color:#c9c2a8;font:inherit;user-select:text">';
    h += '<div class="cols"><div id="cxlist">';
    for (const id of ids) {
      const sel = u.sel === id, nw = this.isNew(cat.k, id), nm = this.title(cat.k, id);
      h += '<div class="row" data-n="' + nm.toLowerCase().replace(/"/g, '') + '" data-a="cx:' + cat.k + ':' + id + '" style="cursor:pointer' + (sel ? ';background:#1c1b14;border-left:2px solid #b5742a' : '') + '"><div class="ic" style="width:52px;height:52px;padding:0">' + (this.img(cat.k, id, 48) || cat.ic) + '</div><div class="nm">' + nm + (nw ? ' <span style="color:#7fe07f;font-size:11px">● новое</span>' : '') + '<div class="sub">' + this.sub(cat.k, id) + '</div></div></div>';
    }
    if (!ids.length) h += '<div class="stat">' + (q ? 'Ничего не найдено.' : 'Пока пусто.') + '</div>';
    h += '</div><div>' + (u.sel && this.open(cat.k, u.sel) && this.ids(cat.k).includes(u.sel) ? this.detail(cat.k, u.sel) : '<div class="stat">' + (ids.length ? 'Выберите запись слева.' : '') + '</div>') + '</div></div>';
    return h;
  },
  sub(cat, id) {
    cat = this.rc(cat, id);
    if (cat === 'm' || cat === 'd') { const e = this.ensure()[cat][id], pre = cat === 'd' ? 'Бункер · ' : ''; return pre + (e && e.n > 0 ? 'Изучен · убито: ' + e.n : 'Замечен — убей, чтобы изучить'); }
    if (cat === 'r') return CFG.arts[id].desc;
    if (cat === 'w') return 'Тип оружия';
    if (cat === 'i') return Tip.kind(id);
    return cat === 'a' ? 'Найдена' : 'Посещено';
  },
  detail(cat, id) {
    cat = this.rc(cat, id);
    const t = cat === 'b' ? [this.TEXT.b[id]] : (this.TEXT[cat] || {})[id] || [], row = (l, v) => '<div class="ti-r" style="color:#7d7864">' + l + ' <b style="color:#c9c2a8;font-weight:normal">' + v + '</b></div>';
    const pic = this.img(cat, id, cat === 'm' || cat === 'd' ? 200 : 160);
    let h = '<div style="display:flex;gap:10px;align-items:center;margin-bottom:6px">' + pic + '<h3 style="margin:0;color:#b5742a;font-size:16px">' + this.title(cat, id) + '</h3></div>';
    if (cat === 'w') {
      const w = CFG.weapons[id], b = (l, v) => row(l, v);
      h += '<div class="note">' + this.TEXT.w[id] + '</div>' + b('Урон:', w.dmg + (w.pellets > 1 ? ' ×' + w.pellets + ' (картечь)' : '')) + b('Скорострельность:', (1 / w.cd).toFixed(1) + ' выстр./с') + b('Дальность:', w.range) + b('Шум:', w.noise) + (w.spread ? b('Разброс:', w.spread) : '') + b('Износ за выстрел:', w.wear + '%') + b('Боеприпас:', CFG.items[w.ammo || 'ammo'].name + (w.perAmmo ? ' (1 шт. = ' + w.perAmmo + ' выстрелов)' : '')) + b('Цена:', w.price ? w.price + ' ₽' : 'выдаётся сразу') + (w.lvl ? b('Продаётся:', 'Оружейник, мастерская ур. ' + w.lvl) : '');
      h += '<h3>Разные экземпляры</h3><div class="note">Найденное и купленное оружие бывает Обычным, Хорошим, Редким и Уникальным: у каждого свои множители урона, темпа, разброса, дальности, шума и износа. Улучшить можно на верстаке (тюнинг).</div>';
    } else if (cat === 'i') {
      const it = CFG.items[id], mob = Object.keys(CFG.mut).filter(k => CFG.mut[k].part === id && this.open('m', k)).map(k => CFG.mut[k].name), dun = Object.keys(CFG.dungeon.enemies).filter(k => CFG.dungeon.enemies[k].drop && CFG.dungeon.enemies[k].drop.id === id && this.open('m', k)).map(k => CFG.dungeon.enemies[k].name);
      const rec = CFG.recipes.filter(r => r.out[0] === id).map(r => (r.st === 'sci' ? 'лаборатория' : 'верстак') + ' ур. ' + r.lvl), made = CFG.recipes.filter(r => r.mat[id]).map(r => r.name);
      const sells = Object.keys(CFG.vendors).filter(k => (CFG.vendors[k].sells || []).includes(id)).map(k => CFG.vendors[k].name);
      h += Tip.item(id).replace(/^<div class="ti-h"[^]*?<\/div>/, '');
      if (mob.length || dun.length) h += row('Трофей с:', mob.concat(dun).join(', '));
      if (sells.length) h += row('Продаёт:', sells.join(', ') + (it.buy ? ' (' + it.buy + ' ₽)' : ''));
      if (rec.length) h += row('Делается:', rec.join(', ')); if (made.length) h += row('Нужен для:', made.slice(0, 4).join('; '));
    } else if (cat === 'm') {
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
      h += row('Крюк-кошка:', 'цепляет артефакт с шансом ' + Math.round(Math.min(0.97, c.snag + P.sk.sense * 0.04) * 100) + '%' + (['grinder', 'electra', 'spring', 'smolder'].includes(id) ? ' (не в момент срабатывания)' : ''));
      if (['electra', 'spring', 'smolder'].includes(id)) h += row('Выброс:', 'во время выброса срабатывает почти вдвое чаще' + (id === 'electra' ? '; в грозу — тоже' : ''));
      h += row('Живность:', 'мутанты и сталкеры обходят не все аномалии — часть попадает в них и гибнет; в погоне мутанты идут напролом');
      const ka = c.arts.filter(a => P.known[a]); h += '<h3>Артефакты в ней</h3><div class="stat">' + (ka.length ? ka.map(a => '<b>' + CFG.arts[a].name + '</b>').join(', ') : 'пока неизвестно') + '</div>';
    } else if (cat === 'r') {
      const a = CFG.arts[id], where = Object.keys(CFG.anoms).filter(k => CFG.anoms[k].arts.includes(id)).filter(k => this.open('a', k)).map(k => CFG.anoms[k].name);
      h += '<div class="note">' + a.desc + '</div>';
      for (const k in a.fx) if (Tip.FX[k]) h += '<div class="ti-r">▸ <b style="color:#c9c2a8;font-weight:normal">' + Tip.FX[k](Tip.FX_ROUND.includes(k) ? a.fx[k] : Math.round(a.fx[k] * 10) / 10) + '</b></div>';
      h += row('Фон:', a.rad ? a.rad.toFixed(2) : 'нет') + row('Вес:', a.w + ' кг') + row('Ценность:', a.val + ' ₽') + '<div class="stat" style="margin-top:6px">Значения — для качества «Обычный»; у каждого экземпляра сила эффектов своя (×0.70–1.35).</div>';
      h += row('Ищи в:', id === 'echo' ? 'награда за цепочку «Нижний ярус»' : where.length ? where.join(', ') : 'пока неизвестно');
    } else {
      const inh = Object.keys(CFG.mut).filter(k => CFG.mut[k].biomes.includes(id) && this.open('m', k)).map(k => CFG.mut[k].name), an = Object.keys(CFG.anoms).filter(k => (CFG.biomes[id].am[k] || 0) > 0 && this.open('a', k)).map(k => CFG.anoms[k].name);
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
    if (a === 'cxt') { u.tab = arg; u.sel = null; u.q = ''; return true; }
    if (a === 'cx') { u.tab = arg; u.sel = arg2; Codex.viewed(arg, arg2); return true; }
    return _click.call(this, a, arg, arg2, u);
  };
  // поиск: список фильтруется прямо в разметке (перерисовка сбила бы фокус и клавиатуру)
  if (typeof panel !== 'undefined' && panel && panel.addEventListener) panel.addEventListener('input', e => {
    if (!e.target || e.target.id !== 'cxq' || !G.ui || G.ui.k !== 'codex') return;
    const q = e.target.value.trim().toLowerCase(); G.ui.q = e.target.value; let n = 0;
    document.querySelectorAll('#cxlist .row').forEach(r => { const ok = !q || (r.dataset.n || '').includes(q); r.style.display = ok ? '' : 'none'; if (ok) n++; });
  });
  if (typeof addEventListener === 'function') addEventListener('keydown', e => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName || '')) return;   // печатаем в поиске
    if (e.code !== 'KeyB' || e.repeat || !G.started || G.dead) return;
    if (G.ui && G.ui.k === 'codex') closePanel(); else if (!G.ui || G.ui.k !== 'menu') { closePanel(); Codex.openPanel(); }
  });
})();

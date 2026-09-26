'use strict';
// Лагерь «Обочина» — отдельная сцена (не часть карты Зоны). Выход через ворота с вопросом о готовности.
// На карте Зоны остаётся только блокпост (вход в лагерь). Загружается после main.js/meta.js.
const Camp = {
  w: 1600, h: 1100, built: false, spawn: { x: 1360, y: 560 }, gate: { x: 1560, y: 560 },
  vend: {}, fire: { x: 800, y: 560 }, items: [], og: null, lights: [], npcs: [], decals: [], armed: true, barkT: 4, sitCd: 0,
  spots: {},

  build() {
    if (this.built) return; this.built = true; this.initSprites();
    this.og = new Grid(200); this.items = []; this.lights = []; this.npcs = []; this.decals = [];
    const add = (spr, x, y, sc, o = {}) => {
      const c = Spr.cache[spr], h = c.height * sc, w = c.width * sc;
      const it = { spr, x, y, sc, flip: !!o.flip, ys: y + h / 2 - (o.yoff == null ? 2 : o.yoff), w, h, k: o.k }; this.items.push(it);
      if (o.foot) { const n = Math.max(1, Math.round(o.foot / 20)); for (let i = 0; i < n; i++) this.og.add({ x: x - o.foot / 2 + (i + 0.5) * o.foot / n, y: y + h / 2 - (o.base || 10), r: o.foot / n / 2 + 3 }); }
      if (o.light) this.lights.push({ x: x + (o.lx || 0), y: y + (o.ly || 0), r: o.light, a: o.la || 0.8 });
      return it;
    };
    // здания: [ключ торговца, спрайт, x, y, масштаб, ширина основания]
    const B = [['bar', 'tavern', 420, 300, 2, 66], ['buyer', 'kiosk', 800, 235, 2, 46], ['gun', 'workshop', 1180, 280, 2, 56], ['gear', 'shopc', 1180, 830, 2, 52], ['sci', 'lab', 760, 880, 2, 50]];
    for (const [k, spr, x, y, sc, foot] of B) { const it = add(spr, x, y, sc, { k, foot, light: 130, ly: it_h(spr, sc) / 2 - 6, la: 0.7 }); this.vend[k] = { x, y: y + it.h / 2 + 18 }; }
    const bk = add('barracks', 330, 840, 2, { foot: 64, light: 100, la: 0.5, ly: 10 }); this.spots.bunk = { x: 330, y: 840 + bk.h / 2 + 18 };
    this.spots.locker = { x: 600, y: 500 }; add('locker', 600, 470, 2, { foot: 20 });
    this.spots.board = { x: 1400, y: 470 }; add('board', 1400, 440, 2, { foot: 24 });
    this.spots.mast = { x: 1010, y: 440 }; add('mast', 1010, 380, 2, { foot: 8, base: 6 });
    this.spots.fire = this.fire;
    add('generator', 1400, 740, 2, { foot: 30 }); this.spots.gen = { x: 1400, y: 740 };
    add('wtower', 190, 540, 2, { foot: 30, base: 8 });
    add('bus', 210, 1000, 1.6, { foot: 100, flip: true }); add('truck', 1040, 1010, 1.5, { foot: 100 }); add('wreck', 1450, 900, 1.5, { foot: 40, flip: true });
    [[1310, 470], [1310, 650], [1470, 470], [1470, 660]].forEach(([x, y]) => add('sandbags', x, y, 2, { foot: 28, base: 6 }));
    [[1290, 550, 1], [1290, 590, 1], [690, 700, 1], [520, 620, 1], [1010, 520, 1]].forEach(([x, y]) => { add('barrelfire', x, y, 2, { foot: 10, base: 6, light: 140, ly: -6, la: 0.8 }); this.decals.push({ k: 'fire', x, y: y - 14 }); });
    [[560, 400], [1000, 400], [700, 790], [1300, 380], [1300, 800], [240, 620]].forEach(([x, y]) => add('lamp', x, y, 2, { foot: 6, light: 170, ly: -18, la: 0.65 }));
    [[220, 420], [260, 720], [1450, 250]].forEach(([x, y]) => add('tent', x, y, 2.2, { foot: 40, base: 8 }));
    [[600, 990], [1400, 990], [1460, 300], [140, 900]].forEach(([x, y]) => add('pile', x, y, 2, { foot: 30, base: 6 }));
    [[1000, 240], [1050, 290], [560, 320]].forEach(([x, y]) => add('crates', x, y, 2, { foot: 24 }));
    [[900, 1000], [940, 1010], [130, 610]].forEach(([x, y]) => add('tires', x, y, 2, { foot: 14 }));
    add('toilet', 120, 850, 2, { foot: 14 }); add('flag', 1280, 280, 2, { foot: 6, base: 6 }); add('line', 520, 700, 2, {});
    add('hazard', 1500, 440, 2, {}); add('hazard', 1500, 680, 2, {}); add('dish', 900, 890, 2, { foot: 14 });
    add('bench', 730, 630, 2, {}); add('bench', 870, 630, 2, {}); add('bench', 800, 500, 2, {});
    add('gate', 1560, 560, 2, { yoff: -20 });
    // ограда и башни (только рисуются, коллизия — границы)
    for (let x = 100; x <= 1500; x += 44) { add('fence', x, 76, 2, { yoff: -6 }); add('fence', x, 1028, 2, { yoff: -6 }); }
    for (let y = 120; y <= 1000; y += 40) { if (Math.abs(y - 560) > 70) add('fence', 78, y, 2, { yoff: -6 }); if (Math.abs(y - 560) > 70) add('fence', 1544, y, 2, { yoff: -6 }); }
    [[90, 90], [1510, 90], [90, 1010], [1510, 1010]].forEach(([x, y]) => add('tower', x, y, 2.4, { light: 110, ly: -10, la: 0.5 }));
    this.lights.push({ x: this.fire.x, y: this.fire.y, r: 300, a: 0.95 }, { x: 1560, y: 560, r: 200, a: 0.8 });
    // жители
    const N = (name, spr, x, y, lines, flip, id) => this.npcs.push({ name, spr, x, y, lines, flip: !!flip, id, say: null, sayT: 0 });
    N('Гарик', 'st_loner', 745, 600, ['Слышал? На свалке видели Туманника. Кто отвернулся — уже не вернулся.', 'Береги болты. Пустой карман в поле — смерть.'], false, 'garik');
    N('Мосол', 'st_loner', 860, 605, ['Жестянка идёт на звон. Не бросай болты рядом с ней.', 'Пустышки? Я их коллекционирую. Красивые.'], true, 'mosol');
    N('Седой', 'st_loner', 800, 515, ['Выброс скоро. Я чувствую в зубах.', 'Привал у костра в Зоне — не роскошь. Привал — правило.'], false, 'sedoy');
    N('Часовой', 'st_patrol', 1480, 500, ['За воротами — Зона. Аптечки взял?', 'Без пропуска в четвёртый сектор не суйся.'], true, 'guard1');
    N('Часовой', 'st_patrol', 1480, 620, ['Слухачи слепые. Иди тихо — пройдёшь.', 'Возвращайся живым. Мы тут не любим хоронить.'], true, 'guard2');
    N('Лёха', 'st_loner', 610, 540, ['Замок на ящике — честное слово. Твоё в целости.', 'Складывай лишнее, тяжёлым в Зону не ходят.'], false, 'lyokha');
    this.spots.dogs = null;
    // пятна на земле
    for (let i = 0; i < 26; i++) this.decals.push({ k: i % 3 ? 'oil' : 'puddle', x: 130 + Math.random() * 1340, y: 130 + Math.random() * 840, r: 14 + Math.random() * 26 });
    this.items.sort((a, b) => a.ys - b.ys);
  },
  vendorPos(k) { return G.scene === 'camp' && this.vend[k] ? this.vend[k] : { x: -1e6, y: -1e6 }; },
  clampP() {
    P.x = U.clamp(P.x, 100, Math.abs(P.y - this.gate.y) < 55 ? this.w - 30 : this.w - 100);
    P.y = U.clamp(P.y, 100, this.h - 100);
  },
  enter(silent) {
    this.build(); G.scene = 'camp'; P.x = this.spawn.x; P.y = this.spawn.y; this.armed = false; if (!P.stash) P.stash = []; closePanel();
    if (!silent) { Mutants.refill(); Stalkers.refill(); save(); log('Ты вернулся в лагерь. Игра сохранена.', '#a8c890'); }
  },
  depart() {
    save(); G.scene = 'zone'; P.x = W.C.x + 85; P.y = W.C.y - 85; P.wasOut = false; closePanel();
    log('Ты вышел за периметр. Зона слушает.', '#e8c060'); Snd.pick();
  },
  gateAt() { return P.x > this.w - 110 && Math.abs(P.y - this.gate.y) < 55; },
  confirmChecks() {
    const c = [], w = weight(), cap = carryCap(), ok = (t) => c.push(['✔', t, '#8fbf7f']), bad = (t) => c.push(['⚠', t, '#e0a060']);
    w > cap ? bad('Перегруз: ' + w.toFixed(1) + '/' + cap + ' кг — будешь медленным и шумным') : ok('Вес в норме: ' + w.toFixed(1) + '/' + cap + ' кг');
    const ai = CFG.weapons[P.weapon].ammo || 'ammo', an = ai === 'ammo' ? 'патронов' : ai === 'bolt' ? 'болтов' : 'топлива';
    invCount(ai) < (ai === 'ammo' ? 6 : 2) ? bad('Мало ' + an + ': ' + invCount(ai)) : ok((ai === 'ammo' ? 'Патроны' : ai === 'bolt' ? 'Болты' : 'Топливо') + ': ' + invCount(ai));
    invCount('bolt') < 10 ? bad('Мало болтов: ' + invCount('bolt') + ' — в полях аномалий это гибель') : ok('Болты: ' + invCount('bolt'));
    invCount('medkit') < 1 ? bad('Нет аптечек') : ok('Аптечек: ' + invCount('medkit'));
    invCount('splint') < 1 ? bad('Нет шины — перелом на дороге хуже пули') : ok('Шина есть');
    invCount('food') < 1 && P.food < 50 ? bad('Нет еды') : ok('Еда есть');
    Meta.bestSuit() ? ok('Защитный костюм есть') : bad('Нет защитного костюма');
    P.cond[P.weapon] < 60 ? bad('Оружие изношено на ' + Math.round(100 - P.cond[P.weapon]) + '%') : ok('Оружие исправно');
    P.hp < 70 ? bad('Ты ранен: ' + Math.round(P.hp) + ' HP') : ok('Здоровье в порядке');
    G.night > 0.5 ? bad('Сейчас ночь: слухачи и туман опаснее') : ok('Время: ' + String(Math.floor(G.hour)).padStart(2, '0') + ':' + String(Math.floor((G.hour % 1) * 60)).padStart(2, '0'));
    return c;
  },
  render(u) {
    if (u.k === 'confirm') {
      const rows = this.confirmChecks().map(([i, t, col]) => '<div class="note" style="border-color:' + col + '"><b style="color:' + col + '">' + i + '</b> ' + t + '</div>').join('');
      panel.style.display = 'block';
      panel.innerHTML = '<h2 style="font-size:20px">Вы готовы отправиться на вылазку?</h2><div class="stat">За воротами — Зона. Вернуться можно только через блокпост, и никто не гарантирует, что вернёшься ты.</div>' + rows +
        '<div style="margin-top:12px">' + btn('cgo', '▶ Отправиться') + ' ' + btn('cstay', 'Остаться в лагере') + '</div>';
      return true;
    }
    if (u.k === 'storage') {
      panel.style.display = 'block';
      const inv = P.inv.map((s, i) => row(itemIcon(s), itemName(s) + (s.n > 1 ? ' ×' + s.n : ''), slotW(s).toFixed(1) + ' кг', btn('stash:' + i, 'В ящик →'))).join('') || '<div class="stat">Рюкзак пуст.</div>';
      const st = P.stash.map((s, i) => row(itemIcon(s), itemName(s) + (s.n > 1 ? ' ×' + s.n : ''), slotW(s).toFixed(1) + ' кг', btn('unstash:' + i, '← Забрать'))).join('') || '<div class="stat">Ящик пуст.</div>';
      panel.innerHTML = '<div class="x" data-a="close">✕ Esc</div><h2>Ящик хранения</h2><div class="stat">Вещи здесь в безопасности. Не забывай про вес: тяжёлым в Зону не ходят.</div><div class="cols"><div><h3>Рюкзак — ' + weight().toFixed(1) + ' / ' + carryCap() + ' кг</h3>' + inv + '</div><div><h3>Ящик (' + P.stash.length + ')</h3>' + st + '</div></div>';
      return true;
    }
    return false;
  },
  click(a, arg) {
    const i = +arg;
    if (a === 'cgo') { this.depart(); return true; }
    if (a === 'cstay') { closePanel(); return true; }
    if (a === 'stash') { const s = P.inv[i]; if (s) { const d = s.art ? null : P.stash.find(t => t.id === s.id && !t.art); if (d) d.n += s.n; else P.stash.push(s); P.inv.splice(i, 1); Snd.tick(); } return true; }
    if (a === 'unstash') { const s = P.stash[i]; if (s) { if (s.art) P.inv.push(s); else invAdd(s.id, s.n); P.stash.splice(i, 1); Snd.tick(); } return true; }
    return false;
  },
  near(c) {
    for (const k in CFG.vendors) { const p = this.vend[k]; c(k, Math.hypot(p.x - P.x, p.y - P.y), 70, 'Войти: ' + Camp.bName(k) + ' (ур. ' + Camp.lvl(k) + ')', () => Camp.enterRoom(k)); }
    // люди важнее мебели: жители вокруг костра иначе проигрывали ему «ближайшую цель» (смещение −18 при том же радиусе 62)
    for (const n of this.npcs) if (n.id) c(n, Math.hypot(n.x - P.x, n.y - P.y) - 18, 44, 'Поговорить: ' + n.name, () => Meta.openCampTalk(n));
    const s = this.spots;
    c('locker', Math.hypot(s.locker.x - P.x, s.locker.y - P.y), 64, 'Открыть ящик хранения', () => { G.ui = { k: 'storage' }; renderPanel(); });
    c('board', Math.hypot(s.board.x - P.x, s.board.y - P.y), 70, 'Доска объявлений (журнал заданий)', () => Meta.openJournal());
    c('bunk', Math.hypot(s.bunk.x - P.x, s.bunk.y - P.y), 70, 'Войти: Казарма (ур. ' + Camp.lvl('barracks') + ')', () => Camp.enterRoom('barracks'));
    c('mast', Math.hypot(s.mast.x - P.x, s.mast.y - P.y), 70, 'Послушать радио', () => { log('Радио шипит: «' + U.pick(CFG.rumors) + '»', '#9ab8d8'); });
    c('fire', Math.hypot(this.fire.x - P.x, this.fire.y - P.y), 90, 'Посидеть у костра', () => {
      if (G.t < this.sitCd) return log('Ты уже согрелся. Дай костру погореть.'); this.sitCd = G.t + 30;
      P.stress = 0; P.hp = Math.min(100, P.hp + 15); G.clock += 20 / 60 * CFG.time.dayLen / 24; log('Ты посидел у огня. Тихо потрескивают дрова.', '#e8c060'); Snd.pick();
    });
  },
  tick(dt) {
    P.food = Math.max(0, P.food - CFG.player.foodRate * 0.25 * dt); P.hp = Math.min(100, P.hp + 1.2 * dt);
    P.rad = Math.max(0, P.rad - 1.5 * dt); P.stress = Math.max(0, P.stress - 4 * dt); if (P.bleed > 0) P.bleed -= dt;
    G.near = G.ui ? null : (() => { let best = null, bd = 9999; this.near((o, d, lim, label, fn) => { if (d < lim && d < bd) { bd = d; best = { label, fn, o }; } }); return best; })();
    // ворота
    const at = this.gateAt();
    if (at && this.armed && !G.ui) { this.armed = false; G.ui = { k: 'confirm' }; renderPanel(); }
    if (!at) this.armed = true;
    // жизнь в лагере: реплики, звуки
    this.barkT -= dt;
    if (this.barkT <= 0) { this.barkT = 8 + Math.random() * 8; const near = this.npcs.filter(n => Math.hypot(n.x - P.x, n.y - P.y) < 320); if (near.length) { const n = U.pick(near); n.say = U.pick(n.lines); n.sayT = 6; } }
    for (const n of this.npcs) n.sayT = Math.max(0, n.sayT - dt);
    if (Math.random() < dt * 6) Snd.crackle();
    const gd = Math.hypot(this.spots.gen.x - P.x, this.spots.gen.y - P.y); Snd.setHum(46, Math.max(0.008, 0.05 * (1 - gd / 500)));
    G.amb -= dt; if (G.amb <= 0) { if (G.night > 0.5 && G.rain < 0.3) { G.amb = 0.5 + Math.random(); Snd.cricket(); } else if (G.night < 0.4 && G.rain < 0.3) { G.amb = 4 + Math.random() * 6; Snd.chirp(); } else G.amb = 2; }
    updateEmission(dt); Snd.siren(G.emi.s === 'warn');
    for (let i = tracers.length - 1; i >= 0; i--) if ((tracers[i].t -= dt) <= 0) tracers.splice(i, 1);
  },

  initSprites() {
    const M = (n, r, p) => Spr.make(n, r, p), rep = (s, n) => s.repeat(n);
    M('kiosk', ['rrwwrrwwrrwwrrwwrrwwrrwwrr', 'rrwwrrwwrrwwrrwwrrwwrrwwrr', '.p......................p.', '.pTTTTTTTTTTTTTTTTTTTTTTp.', '.pTkkkkkkTTTTTTTTgygTyTTp.', '.pTkkkkkkTTTTTTTTgygTyTTp.', '.pbbbbbbbbbbbbbbbbbbbbbbp.', '.pbbbbbbbbbbbbbbbbbbbbbbp.', '.pTTTTTTTTTTTTTTTTTTTTTTp.', '.pp....................pp.'],
      { r: '#a03a2a', w: '#d8d0c0', p: '#4a3a2a', T: '#6a6a62', k: '#15181a', g: '#8a7a3a', y: '#c0a040', b: '#6a4a2a' });
    M('workshop', ['..........cccc..............', '.........cCCCCc.............', 'tttttttttttttttttttttttttttttt', 'tTTTTTTTTTTTTTTTTTTTTTTTTTTTTt', 'tTTTTTTTTTTTTTTTTTTTTTTTTTTTTt', 'tttttttttttttttttttttttttttttt', 'wwwwwwwwwwwwwwwwwwwwwwwwwwwwww', 'wwkkkkkkkkkkkkkwwwwwWWwwwwwwww', 'wwkkkkkkkkkkkkkwwwwwWWwwwwwwww', 'wwkkAAkkkkkkkkkwwwrrrrwwwwwwww', 'wwkkAAkkkkkkkkkwwwrrrrwwwwwwww', 'wwkkkkkkkkkkkkkwwwwwwwwwwwwwww'],
      { t: '#4a3a30', T: '#6a4a3a', c: '#5a5a5a', C: '#3a3a3a', w: '#77705f', k: '#141210', A: '#8a8a8a', W: '#2a3a4a', r: '#a05030' });
    M('shopc', ['sssssssssssssssssssssssssss', 'sSSSSSSSSSSSSSSSSSSSSSSSSSs', '.f.......................f.', 'sbbbbbbbbbbbbbbbbbbbbbbbbbs', 'sbkkkkkkkkbbbbbbkkkkkkkkbbs', 'sbkgggggkkbbbbbbkyyyyykkbbs', 'sbkgggggkkbbbbbbkyyyyykkbbs', 'sbkkkkkkkkbbbbbbkkkkkkkkbbs', 'sbbbbbbbbbbbbbbbbbbbbbbbbbs'],
      { s: '#2a4a6a', S: '#3a6088', b: '#2f5578', k: '#101820', g: '#a05a3a', y: '#c8b050', f: '#c0c0c0' });
    M('lab', ['...........gg.......a..', '..........gGGg......a..', '.........gGGGGg.....a..', '..........gg........a..', 'wwwwwwwwwwwwwwwwwwwwwwww', 'wWWWWwwwwwwwwwwWWWWwwwww', 'wWkkWwwwddwwwwWkkkWwwwww', 'wWWWWwwwddwwwwWWWWWwwwww', 'wwwwwwwwddwwwwwwwwwwwwww', 'wcwwwwwwwwwwwwwwwwwwwwcw', '.kk..................kk.'],
      { w: '#c8ccc8', W: '#7a9aa8', k: '#1a2a30', d: '#4a5a5a', g: '#a0a8a8', G: '#d0d8d8', a: '#7a7a7a', c: '#8a9090' });
    M('tavern', ['.....................cc.........', '....................cCCc........', '..........nnnnnnnn..cCCc........', '..........nPPPPPPn..............', 'tttttttttttttttttttttttttttttttt', 'tTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTt', 'tTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTt', 'tttttttttttttttttttttttttttttttt', 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', 'BbbBBbbBBbbBBbbBBbbBBbbBBbbBBbbB', 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', 'BwwwBBBBBBBBddddBBBBBBBBwwwwBBBB', 'BwyyBBBBBBBBddddBBBBBBBBwyywBBBB', 'BwyyBBBBBBBBddddBBBBBBBBwyywBBBB', 'BwwwBBBBBBBBddddBBBBBBBBwwwwBBBB', 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'],
      { t: '#3a2a24', T: '#5a4438', c: '#6a6a6a', C: '#3a3a3a', n: '#222', P: '#e05080', B: '#7a4a3a', b: '#8a5a48', w: '#3a3a3a', y: '#e8c060', d: '#2a1a10' });
    M('barracks', ['tttttttttttttttttttttttttttttttttt', 'tTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTt', 'tttttttttttttttttttttttttttttttttt', 'gggggggggggggggggggggggggggggggggg', 'gGGGgggddgggggGGGgggddgggggGGGgggg', 'gGyGgggddgggggGyGgggddgggggGyGgggg', 'gGGGgggddgggggGGGgggddgggggGGGgggg', 'gggggggggggggggggggggggggggggggggg'],
      { t: '#3a3a2a', T: '#55563a', g: '#5a6448', G: '#2a3020', y: '#c8a840', d: '#2a2418' });
    M('locker', ['kkkkkkkk', 'kbbkbbbk', 'kbbkbbbk', 'kbbkbbbk', 'kylkylbk', 'kbbkbbbk', 'kbbkbbbk', 'kkkkkkkk', '.k....k.'], { k: '#3a3a3a', b: '#4a6a5a', y: '#c0a040', l: '#c0a040' });
    M('board', ['bbbbbbbbbbbb', 'bwwbppbwwwbb', 'bwwbppbwwwbb', 'bbbbbbbbbbbb', 'bpwwbwwbppbb', 'bpwwbwwbppbb', 'bbbbbbbbbbbb', '.k........k.', '.k........k.', '.k........k.'], { b: '#5a4a30', w: '#d8d0b0', p: '#c07060', k: '#3a2a1a' });
    const mast = []; for (let i = 0; i < 9; i++) mast.push('..kk..', '.k..k.', '.kkkk.', '.k..k.'); mast.unshift('..rr..', '..kk..');
    M('mast', mast, { k: '#5a5a5a', r: '#e04040' });
    M('generator', ['..cc............', '...cc...........', 'kkkkkkkkkkkkkk', 'kGGGGGGGGGGGGk', 'kGyyGGGGGrrrGk', 'kGyyGGGGGrrrGk', 'kGGGGGGGGGGGGk', 'kkkkkkkkkkkkkk', '.kk........kk.'], { c: '#666', k: '#2a2a2a', G: '#5a6a4a', y: '#c0b040', r: '#a04030' });
    const wt = ['..tttttttttt..', '.tTTTTTTTTTTt.', 'tTTTTTTTTTTTTt', 'tTTTtTTTTtTTTt', 'tTTTTTTTTTTTTt', '.tttttttttttt.']; for (let i = 0; i < 11; i++) wt.push(i % 3 === 2 ? '.kkkkkkkkkkkk.' : '.k..........k.');
    M('wtower', wt, { t: '#4a3a30', T: '#6a5a48', k: '#3a3a3a' });
    M('barrelfire', ['.bbbb.', 'bBBBBb', 'bbbbbb', 'bBBBBb', 'bbbbbb'], { b: '#5a3a1a', B: '#7a5028' });
    M('sandbags', ['..ssssss..ssss', '.sSsSssSssSsSs', 'ssssssssssssss', 'sSssSsssSssSss', 'ssssssssssssss'], { s: '#8a7a5a', S: '#6a5a3a' });
    const g = ['k'.repeat(34), 'kyykyykyykyykyykyykyykyykyykyykyyk', 'k'.repeat(34)]; for (let i = 0; i < 6; i++) g.push('kyk' + '.'.repeat(28) + 'kyk'); M('gate', g, { k: '#2a2a2a', y: '#d0a020' });
    M('bench', ['bbbbbbbbbbbb', 'bBBBBBBBBBBb', '.k........k.', '.k........k.'], { b: '#4a3a24', B: '#6a5438', k: '#2a2010' });
    M('pile', ['....rr..k.......', '..rrRRrkkk.rr...', '.rRRrrRkkrrRRr..', 'rRrrRRrrkRRrrRr.', 'rrkkRRrRrrrRRrrr'], { r: '#6a4a30', R: '#8a6a44', k: '#2a2a2a' });
    M('crates', ['cccccc......', 'cCCCCc......', 'cCcCCc.cccc.', 'cccccc.cCCc.', 'cccccccccCcc', 'cCCCCccCCCCc', 'cCcCCccCcCCc', 'cccccccccccc'], { c: '#5a4426', C: '#7a6034' });
    M('toilet', ['.kkkkk.', 'kbbbbbk', 'kbbbbbk', 'kbdddbk', 'kbdddbk', 'kbdhdbk', 'kbdddbk', 'kbdddbk', 'kbbbbbk', 'kkkkkkk'], { k: '#2a2a2a', b: '#4a5a6a', d: '#33404c', h: '#c0c0c0' });
    M('flag', ['kkkkkkk.', 'krrrrrrr', 'krrrrrrr', 'krrrrr..', 'k.......', 'k.......', 'k.......', 'k.......', 'k.......', 'k.......', 'k.......', 'k.......'], { k: '#4a3a24', r: '#8a2a20' });
    M('line', ['k....................k', 'kssssssssssssssssssssk', 'k.lll..ccc..bbbb..lll.k', 'k.lll..ccc..bbbb..lll.k', 'k.l.l..c.c..b..b..l.l.k', 'k....................k', 'k....................k'], { k: '#4a3a24', s: '#a0a0a0', l: '#c0b090', c: '#7a9ab0', b: '#a05a4a' });
    M('hazard', ['....y....', '...yyy...', '...yky...', '..yykyy..', '..yykyy..', '.yyyyyyy.', '.yykkkyy.', 'yyyyyyyyy', '....k....', '....k....'], { y: '#d8b020', k: '#1a1a1a' });
    M('dish', ['..gggggg..', '.gGGGGGGg.', 'gGgggggGgg', '.gGGGGGGg.', '...kkkk...', '..kk..kk..'], { g: '#8a9090', G: '#b8c0c0', k: '#3a3a3a' });
  },
};
function it_h(spr, sc) { const c = Spr.cache[spr]; return c ? c.height * sc : 40; }

// ---- сцена лагеря ----
function campTick(dt) { Camp.tick(dt); }
function drawCampScene() {
  Camp.build(); ctx.imageSmoothingEnabled = false;
  if (!groundPat) groundPat = ctx.createPattern(Spr.ground, 'repeat');
  const sh = G.shake, CW = Camp.w, CH = Camp.h;
  cam.x = (CW <= VW ? (CW - VW) / 2 : U.clamp(P.x - VW / 2, 0, CW - VW)) + (Math.random() - 0.5) * sh * 30;
  cam.y = (CH <= VH ? (CH - VH) / 2 : U.clamp(P.y - VH / 2, 0, CH - VH)) + (Math.random() - 0.5) * sh * 30;
  ctx.fillStyle = '#0d100b'; ctx.fillRect(0, 0, VW, VH);
  ctx.save(); ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
  const x0 = cam.x, y0 = cam.y, x1 = cam.x + VW, y1 = cam.y + VH;
  ctx.fillStyle = groundPat; ctx.fillRect(x0 - 2, y0 - 2, VW + 4, VH + 4); ctx.fillStyle = 'rgba(14,10,6,.55)'; ctx.fillRect(x0 - 2, y0 - 2, VW + 4, VH + 4);
  ctx.fillStyle = groundPat; ctx.fillRect(80, 80, CW - 160, CH - 160); ctx.fillStyle = 'rgba(80,66,40,.32)'; ctx.fillRect(80, 80, CW - 160, CH - 160);
  // бетонная площадь, дорожка к воротам, разметка
  ctx.fillStyle = '#3a3a37'; ctx.fillRect(620, 400, 360, 320); ctx.fillStyle = '#2f2f2d'; for (let i = 0; i < 9; i++) ctx.fillRect(620 + i * 40, 400, 2, 320);
  ctx.strokeStyle = '#6a6a3a'; ctx.lineWidth = 2; ctx.setLineDash([12, 10]); ctx.strokeRect(632, 412, 336, 296); ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(70,52,34,.75)'; ctx.fillRect(980, 522, 600, 76); ctx.fillStyle = 'rgba(40,30,20,.5)'; for (let x = 990; x < 1570; x += 34) ctx.fillRect(x, 555 + Math.sin(x) * 8, 14, 3);
  ctx.fillStyle = 'rgba(70,52,34,.5)'; ctx.fillRect(760, 250, 60, 150); ctx.fillRect(400, 340, 240, 70); ctx.fillRect(1120, 320, 90, 90); ctx.fillRect(1140, 700, 70, 130); ctx.fillRect(740, 720, 60, 130);
  for (const d of Camp.decals) {
    if (d.k === 'oil') { ctx.fillStyle = 'rgba(8,8,10,.6)'; ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * 0.6, 0.3, 0, 6.28); ctx.fill(); }
    else if (d.k === 'puddle') { ctx.fillStyle = 'rgba(30,50,58,.75)'; ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * 0.5, 0, 0, 6.28); ctx.fill(); ctx.fillStyle = 'rgba(160,200,210,.18)'; ctx.fillRect(d.x - d.r * 0.4, d.y - 2, d.r * 0.5, 2); }
  }
  // колючая проволока по периметру
  ctx.strokeStyle = 'rgba(160,160,150,.55)'; ctx.lineWidth = 1; ctx.beginPath();
  const wire = (ax, ay, bx, by) => { const n = Math.hypot(bx - ax, by - ay) / 8; for (let i = 0; i <= n; i++) { const t = i / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t + (i % 2 ? -4 : 4); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } };
  wire(90, 68, 1510, 68); wire(90, 1020, 1510, 1020); wire(70, 100, 70, 490); wire(70, 630, 70, 1000); wire(1536, 100, 1536, 490); wire(1536, 630, 1536, 1000); ctx.stroke();
  // предметы и жители по глубине
  const dl = [];
  for (const it of Camp.items) if (it.x + it.w > x0 - 40 && it.x - it.w < x1 + 40 && it.y + it.h > y0 - 40 && it.y - it.h < y1 + 40) dl.push({ y: it.ys, it });
  for (const n of Camp.npcs) dl.push({ y: n.y + 8, n });
  for (const k of ['bar', 'buyer', 'gun', 'gear', 'sci']) { const it = Camp.items.find(i => i.k === k); if (it && Camp.lvl(k) > 1) dl.push({ y: it.ys + 0.5, ov: it }); }
  if (!G.dead) dl.push({ y: P.y + 8, p: true });
  dl.sort((a, b) => a.y - b.y);
  ctx.font = 'bold 11px Consolas'; ctx.textAlign = 'center';
  for (const e of dl) {
    if (e.it) { const it = e.it; Spr.draw(ctx, it.spr, it.x, it.y, it.flip, null, it.sc); }
    else if (e.n) {
      const n = e.n; shadow(n.x, n.y + 10, 8); Spr.draw(ctx, n.spr, n.x, n.y - 2, n.flip); ctx.fillStyle = '#9a9480'; ctx.fillText(n.name, n.x, n.y - 22);
      if (n.sayT > 0 && n.say) drawBubble(n.x, n.y - 34, n.say);
    } else if (e.ov) {
      const it = e.ov, l = Camp.lvl(it.k); Spr.draw(ctx, 'solar', it.x - it.w * 0.28, it.y - it.h / 2 + 2, false, null, 1.6); if (l >= 3) Spr.draw(ctx, 'banner', it.x + it.w * 0.4, it.y - it.h / 2 - 8, false, null, 1.8);
    } else {
      const mv = keys.mx || keys.my, bob = mv ? (Math.floor(G.t * 10) % 2 ? -1 : 0) : 0;
      shadow(P.x, P.y + 10, 8); Spr.draw(ctx, P.sneak ? 'player_s' : 'player', P.x, P.y + bob - 2, Math.cos(P.ang) < 0);
    }
  }
  // огонь: костёр и бочки
  const f = Math.floor(G.t * 8) % 3;
  px(Camp.fire.x - 8, Camp.fire.y + 4, '#3a2010', 16); px(Camp.fire.x, Camp.fire.y - 2 - f, '#e08a30', 12); px(Camp.fire.x - 3, Camp.fire.y - 8 - f, '#f0b040', 6); px(Camp.fire.x + 1, Camp.fire.y - 13 - f * 2, '#ffd870', 3);
  for (const d of Camp.decals) if (d.k === 'fire') { const ff = Math.floor(G.t * 9 + d.x) % 3; px(d.x, d.y - ff, '#e08a30', 6); px(d.x, d.y - 5 - ff, '#ffd070', 3); }
  // вывески
  const glow = 0.7 + 0.3 * Math.sin(G.t * 5); ctx.font = 'bold 13px Consolas'; ctx.fillStyle = `rgba(255,110,160,${glow})`; ctx.fillText('БАР «ОБОЧИНА» ' + '★'.repeat(Camp.lvl('bar')), 420, 232);
  ctx.fillStyle = '#e8d8a0'; ctx.font = 'bold 11px Consolas'; const S = (k) => '★'.repeat(Camp.lvl(k)); ctx.fillText('СКУПКА ' + S('buyer'), 800, 172); ctx.fillText('МАСТЕРСКАЯ ' + S('gun'), 1180, 214); ctx.fillText('СНАБЖЕНИЕ ' + S('gear'), 1180, 764); ctx.fillText('ЛАБОРАТОРИЯ ' + S('sci'), 760, 812);
  ctx.fillText('СКЛАД ' + '★'.repeat(Camp.lvl('storage')), 600, 448); ctx.fillText('ОБЪЯВЛЕНИЯ', 1400, 412); ctx.fillText('КАЗАРМА ' + '★'.repeat(Camp.lvl('barracks')), 330, 782);
  ctx.fillStyle = '#e0a020'; ctx.font = 'bold 14px Consolas'; ctx.fillText('ВЫХОД В ЗОНУ →', 1470, 530);
  if (Math.floor(G.t * 1.5) % 2) px(1010, 322, '#ff4040', 4);
  ctx.restore();
  drawOverlays();
}
function drawBubble(x, y, text) {
  ctx.font = '11px Consolas'; const w = Math.min(230, ctx.measureText(text).width + 12), words = text.split(' '), lines = []; let cur = '';
  for (const wd of words) { if (ctx.measureText(cur + ' ' + wd).width > 218) { lines.push(cur); cur = wd; } else cur = cur ? cur + ' ' + wd : wd; } lines.push(cur);
  const h = lines.length * 13 + 8; ctx.fillStyle = 'rgba(12,12,10,.88)'; ctx.fillRect(x - w / 2, y - h, w, h); ctx.strokeStyle = '#6a6040'; ctx.strokeRect(x - w / 2, y - h, w, h);
  ctx.fillStyle = '#d8d0b0'; ctx.textAlign = 'left'; lines.forEach((l, i) => ctx.fillText(l, x - w / 2 + 6, y - h + 14 + i * 13)); ctx.textAlign = 'center';
}

// ---- блокпост на карте Зоны (вход в лагерь) ----
function drawCamp() {
  Camp.build(); const C = W.C;
  if (C.x + 300 < cam.x || C.x - 300 > cam.x + VW || C.y + 300 < cam.y || C.y - 300 > cam.y + VH) return;
  ctx.globalAlpha = 0.4; circle(C.x, C.y, C.r, '#3a3626'); ctx.globalAlpha = 1;
  ctx.strokeStyle = '#4a4634'; ctx.lineWidth = 2; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.arc(C.x, C.y, C.r, 0, 6.28); ctx.stroke(); ctx.setLineDash([]);
  [[-60, 40], [60, 40], [-90, 10], [90, 10]].forEach(([dx, dy]) => Spr.draw(ctx, 'sandbags', C.x + dx, C.y + dy, dx > 0, null, 1.6));
  Spr.draw(ctx, 'gate', C.x, C.y - 10, false, null, 1.6); Spr.draw(ctx, 'barrelfire', C.x - 56, C.y - 6, false, null, 1.6); Spr.draw(ctx, 'hazard', C.x + 60, C.y - 22, false, null, 1.6);
  const ff = Math.floor(G.t * 9) % 3; px(C.x - 56, C.y - 24 - ff, '#e08a30', 5); px(C.x - 56, C.y - 28 - ff, '#ffd070', 3);
  ctx.font = 'bold 12px Consolas'; ctx.textAlign = 'center'; ctx.fillStyle = '#e0a020'; ctx.fillText('ВХОД В ЛАГЕРЬ', C.x, C.y - 44);
}

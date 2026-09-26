'use strict';
// Интерьеры зданий лагеря и их улучшения (3 уровня). Торговцы теперь сидят внутри зданий.
// Расширяет объект Camp из camp.js. Загружается после camp.js.
Object.assign(Camp, {
  room: null, roomKey: null, rooms: {}, doorBack: null,
  DEFAULT_BLD: () => ({ buyer: 1, gun: 1, gear: 1, sci: 1, bar: 1, barracks: 1, storage: 1 }),
  lvl(k) { return (P.bld && P.bld[k]) || 1; },
  bName(k) { return (CFG.buildings[k] || {}).name || k; },
  roomName() { return this.room ? this.room.name : ''; },
  // ---- эффекты уровней ----
  stock(vk) {
    const base = CFG.vendors[vk].sells; if (vk !== 'gear') return base;
    return base.filter(id => (CFG.gearStock[id] || 1) <= this.lvl('gear'));
  },
  identCost() { return [20, 10, 0][this.lvl('sci') - 1]; },
  researchCost() { return [40, 25, 10][this.lvl('sci') - 1]; },
  sleepCost() { return [15, 8, 0][this.lvl('barracks') - 1]; },
  repairMul(vk) { return [1, 0.75, 0.5][this.lvl(vk) - 1]; },
  buyMul(id) { const l = Math.max(vendorLvl('gear'), CFG.vendors.gun.sells.includes(id) ? vendorLvl('gun') : 0); return 1 - 0.05 * (l - 1); },
  sellMul(vk) { return vk === 'buyer' || vk === 'sci' ? 1 + 0.08 * (this.lvl(vk) - 1) : 1; },
  stashLimit() { return [24, 48, 9999][this.lvl('storage') - 1]; },
  sleepBonus() {
    const l = this.lvl('barracks'); if (l >= 2) { P.infect = 0; P.fracture = false; }
    if (l >= 3) { P.food = Math.min(100, P.food + 20); P.rad = Math.max(0, P.rad - 40); }
  },
  bonusText(k) { return CFG.buildings[k].fx[this.lvl(k) - 1]; },

  // ---- улучшение ----
  canUp(k) {
    const l = this.lvl(k); if (l >= 3) return false; const u = CFG.buildings[k].ups[l - 1];
    return P.money >= u.money && Object.keys(u.mat).every(id => invCount(id) >= u.mat[id]);
  },
  upgrade(k) {
    if (!this.canUp(k)) return log('Не хватает денег или материалов.');
    const l = this.lvl(k), u = CFG.buildings[k].ups[l - 1]; P.money -= u.money; for (const id in u.mat) invTake(id, u.mat[id]);
    P.bld[k] = l + 1; addXp(40); Snd.zap(); log(this.bName(k) + ' улучшена до уровня ' + (l + 1) + '. ' + this.bonusText(k), '#e8c060');
  },
  upgradeHTML(k) {
    const b = CFG.buildings[k], l = this.lvl(k);
    const fx = b.fx.map((t, i) => '<div class="note" style="border-color:' + (i + 1 === l ? '#e8c060' : i + 1 < l ? '#8fbf7f' : '#4a4634') + '">' + (i + 1 === l ? '▶ ' : '') + 'Ур. ' + (i + 1) + ': ' + t + '</div>').join('');
    let up = '<div class="stat">Максимальный уровень.</div>';
    if (l < 3) { const u = b.ups[l - 1]; up = '<h3>До уровня ' + (l + 1) + '</h3>' + row('₽', 'Деньги', '', '<b style="color:' + (P.money >= u.money ? '#8fbf7f' : '#e06060') + '">' + P.money + ' / ' + u.money + '</b>') +
      Object.keys(u.mat).map(id => row(CFG.items[id].icon, CFG.items[id].name, '', '<b style="color:' + (invCount(id) >= u.mat[id] ? '#8fbf7f' : '#e06060') + '">' + invCount(id) + ' / ' + u.mat[id] + '</b>')).join('') + '<div style="margin-top:8px">' + btn('ubuild:' + k, 'Улучшить', !this.canUp(k)) + '</div>'; }
    return '<div class="x" data-a="close">✕ Esc</div><h2>' + b.name + ' — уровень ' + l + ' / 3</h2>' + fx + up + '<div class="stat" style="margin-top:8px">Материалы — хлам из Зоны: металлолом, платы, батареи.</div>';
  },
  have(id) { return id.startsWith('art:') ? P.inv.filter(s => s.art === id.slice(4)).length : invCount(id); },
  take(id, n) { if (!id.startsWith('art:')) return invTake(id, n); for (let i = P.inv.length - 1; i >= 0 && n > 0; i--) if (P.inv[i].art === id.slice(4)) { P.inv.splice(i, 1); n--; } },
  matName(id) { return id.startsWith('art:') ? CFG.arts[id.slice(4)].name : CFG.items[id].name; },
  canCraft(r) { return this.lvl(r.st) >= r.lvl && Object.keys(r.mat).every(id => this.have(id) >= r.mat[id]) && (!r.req || Object.keys(r.req).every(k => P.sk[k] >= r.req[k])); },
  craftHTML(st) {
    const l = this.lvl(st), nm = st === 'sci' ? 'Лабораторный синтез (лаборатория ур. ' + l + ')' : 'Верстак (мастерская ур. ' + l + ')';
    return '<div class="x" data-a="close">✕ Esc</div><h2>' + nm + '</h2><div class="stat">Хлам и трофеи — в дело. Сложные рецепты открываются с уровнем здания.</div>' + CFG.recipes.filter(r => r.st === st).map(r => {
      const mats = Object.keys(r.mat).map(id => this.matName(id) + ' ' + this.have(id) + '/' + r.mat[id]).join(', '), ic = r.out[0] === 'art' ? Icons.html('art') : CFG.items[r.out[0]].icon;
      const sub = l < r.lvl ? 'Нужен уровень здания ' + r.lvl : (r.req && !Object.keys(r.req).every(k => P.sk[k] >= r.req[k]) ? 'Нужен навык «' + CFG.skills[Object.keys(r.req)[0]].name + '» ' + Object.values(r.req)[0] : mats);
      return row(ic, r.name, sub, btn('craft:' + r.id, 'Сделать', !this.canCraft(r)));
    }).join('') + (st === 'gun' ? this.salvageHTML() : '');
  },
  // Разборка: оружие и снаряжение → материалы (два нажатия: второе подтверждает)
  salvageHTML() {
    const u = G.ui || {}, ask = key => (u.sc === key ? 'Точно?' : 'Разобрать');
    let h = '<h3>Разборка</h3><div class="stat">Лишнее оружие и снаряжение — в металлолом и детали. Деньгами выгоднее продать, материалами — чинить и тюнинговать.</div>', any = false;
    for (const id of P.weapons) { any = true; h += row(Icons.html('w_' + Wpn.base(id)), '<span style="color:' + Wpn.color(id) + '">' + Wpn.name(id) + '</span>', 'Даст: ' + Meta.matsPlain(Meta.salvageWeapon(id)) + (P.weapons.length <= 1 ? ' · последнее оружие не разобрать' : ''), btn('salv:w:' + id, ask('w' + id), P.weapons.length <= 1)); }
    P.inv.forEach((s, i) => { const m = Meta.salvageSlot(s); if (!m) return; any = true; h += row(itemIcon(s), Meta.itemLabel(s) + (s.n > 1 ? ' ×' + s.n : ''), 'Даст: ' + Meta.matsPlain(m), btn('salv:g:' + i, ask('g' + i))); });
    return h + (any ? '' : '<div class="stat">Разбирать нечего.</div>');
  },

  // ---- комнаты ----
  enterRoom(k) {
    this.buildRoom(k); this.doorBack = { x: this.vend[k] ? this.vend[k].x : P.x, y: this.vend[k] ? this.vend[k].y + 24 : P.y }; if (k === 'barracks') this.doorBack = { x: this.spots.bunk.x, y: this.spots.bunk.y + 24 };
    G.scene = 'interior'; this.room = this.rooms[k]; this.roomKey = k; P.x = this.room.door; P.y = this.room.h - 120; closePanel();
    if (this.room.greet) log(this.room.greet, '#c9c2a8');
  },
  exitRoom() { G.scene = 'camp'; this.room = null; P.x = this.doorBack.x; P.y = this.doorBack.y; closePanel(); Snd.tick(); },
  curLights() { return G.scene === 'interior' && this.room ? this.room.lights : this.lights; },
  grid() { return G.scene === 'interior' && this.room ? this.room.og : G.scene === 'camp' ? this.og : W.og; },
  buildRoom(k) {
    if (this.rooms[k]) return; this.initRoomSprites();
    const R = { key: k, w: 800, h: 520, door: 400, items: [], og: new Grid(200), lights: [{ x: 400, y: 200, r: 340, a: 0.75 }], spots: [], ...CFG.rooms[k] };
    const add = (spr, x, y, sc, o = {}) => {
      const c = Spr.cache[spr], h = c.height * sc, w = c.width * sc, it = { spr, x, y, sc, ys: y + h / 2 - 2, w, h, decor: !!o.decor, flip: !!o.flip }; R.items.push(it);
      if (o.foot) { const n = Math.max(1, Math.round(o.foot / 20)); for (let i = 0; i < n; i++) R.og.add({ x: x - o.foot / 2 + (i + 0.5) * o.foot / n, y: y + h / 2 - (o.base || 8), r: o.foot / n / 2 + 3 }); }
      return it;
    };
    const L = (x, y, r, a) => R.lights.push({ x, y, r, a });
    const talk = (x, y, label) => R.spots.push({ x, y, r: 70, label: () => label, fn: () => openTrade(k) });
    const upg = (x, y) => { add('blueprint', x, y - 20, 2, { decor: true }); R.spots.push({ x, y, r: 60, label: () => 'Чертежи: улучшить «' + this.bName(k) + '» (ур. ' + this.lvl(k) + ')', fn: () => { G.ui = { k: 'upgrade', b: k }; renderPanel(); } }); };
    if (k === 'bar') {
      add('shelf', 300, 150, 2, { foot: 24 }); add('shelf', 400, 150, 2, { foot: 24 }); add('shelf', 500, 150, 2, { foot: 24 }); add('counter', 400, 240, 2.6, { foot: 150, base: 10 });
      add('keg', 130, 180, 2.2, { foot: 20 }); add('keg', 170, 200, 2.2, { foot: 20 }); add('stove', 660, 170, 2.2, { foot: 20 }); add('rug', 400, 390, 2.6, { decor: true });
      [[180, 350], [620, 360]].forEach(([x, y]) => { add('table', x, y, 2.2, { foot: 40 }); add('stool', x - 34, y + 22, 2, { foot: 8 }); add('stool', x + 34, y + 22, 2, { foot: 8 }); L(x, y - 30, 150, 0.6); });
      talk(400, 300, 'Говорить: Бармен «Сидор»'); upg(680, 300); L(660, 190, 120, 0.7);
      R.vendor = { x: 400, y: 200 }; R.greet = 'Внутри тепло, пахнет табаком и жареным. «Сидор» кивает тебе.'; R.fire = true;
    } else if (k === 'buyer') {
      add('shelf', 190, 150, 2, { foot: 24 }); add('shelf', 290, 150, 2, { foot: 24 }); add('shelf', 510, 150, 2, { foot: 24 }); add('shelf', 610, 150, 2, { foot: 24 }); add('counter', 400, 240, 2.6, { foot: 150, base: 10 });
      add('scales', 340, 218, 2.4, { decor: true }); add('safe', 690, 190, 2.2, { foot: 20 }); add('crates', 120, 380, 2.4, { foot: 30 }); add('crates', 680, 400, 2.4, { foot: 30 }); add('rug', 400, 390, 2.6, { decor: true });
      talk(400, 300, 'Говорить: Скупщик «Борода»'); upg(120, 300); R.vendor = { x: 400, y: 200 }; R.greet = 'Скупщик щурится поверх весов: «Что принёс?»';
    } else if (k === 'gun') {
      add('rack', 220, 145, 2.2, { foot: 30 }); add('rack', 580, 145, 2.2, { foot: 30 }); add('counter', 300, 250, 2.2, { foot: 110, base: 10 }); add('benchw', 610, 250, 2.4, { foot: 80, base: 10 });
      add('anvil', 690, 340, 2.2, { foot: 24 }); add('dummy', 140, 380, 2.2, { foot: 14 }); add('crates', 400, 130, 2.2, { foot: 24 }); add('rug', 400, 400, 2.6, { decor: true });
      talk(300, 305, 'Говорить: Оружейник «Ржавый»'); upg(120, 250);
      R.spots.push({ x: 610, y: 305, r: 60, label: () => 'Верстак: мастерить', fn: () => { G.ui = { k: 'craft', st: 'gun' }; renderPanel(); } });
      R.vendor = { x: 300, y: 205 }; R.greet = 'Пахнет маслом и порохом. «Ржавый» не поднимает головы: «Показывай, что сломано».'; L(610, 200, 150, 0.7);
    } else if (k === 'gear') {
      add('shelf', 200, 150, 2, { foot: 24 }); add('shelf', 300, 150, 2, { foot: 24 }); add('shelf', 500, 150, 2, { foot: 24 }); add('rackc', 640, 170, 2.2, { foot: 30 }); add('counter', 400, 250, 2.6, { foot: 150, base: 10 });
      add('crates', 130, 380, 2.4, { foot: 30 }); add('barrel', 690, 400, 2.2, { foot: 14 }); add('rug', 400, 400, 2.6, { decor: true });
      talk(400, 305, 'Говорить: Снабженец «Кум»'); upg(120, 270); R.vendor = { x: 400, y: 205 }; R.greet = '«Кум» пересчитывает патронные ленты: «Всё, что нужно для выхода, — здесь».';
    } else if (k === 'sci') {
      add('labbench', 200, 190, 2.2, { foot: 90, base: 10 }); add('labbench', 600, 190, 2.2, { foot: 90, base: 10 }); add('cabinet', 90 + 70, 150, 2.2, { foot: 24 }); add('cabinet', 700, 150, 2.2, { foot: 24 });
      add('computer', 200, 165, 2.2, { decor: true }); add('table', 400, 330, 2.6, { foot: 50 }); add('stool', 360, 360, 2, { foot: 8 }); add('rug', 400, 400, 2.6, { decor: true });
      talk(400, 285, 'Говорить: Учёный «Лис»'); upg(110, 300); R.spots.push({ x: 600, y: 270, r: 60, label: () => 'Лабораторный стол: синтез', fn: () => { G.ui = { k: 'craft', st: 'sci' }; renderPanel(); } }); R.vendor = { x: 400, y: 245 }; R.greet = 'Гудят приборы. «Лис» не отрывается от микроскопа: «Тише. Оно реагирует на голос».'; L(200, 200, 140, 0.8); L(600, 200, 140, 0.8);
    } else if (k === 'barracks') {
      for (let i = 0; i < 3; i++) { add('bunk', 190 + i * 210, 190, 2.4, { foot: 60, base: 10 }); }
      add('locker', 90, 330, 2.2, { foot: 20 }); add('locker', 130, 330, 2.2, { foot: 20 }); add('stove', 700, 330, 2.2, { foot: 20 }); add('rug', 400, 380, 2.8, { decor: true });
      R.spots.push({ x: 400, y: 275, r: 70, label: () => 'Лечь спать (' + this.sleepCost() + ' ₽)', fn: () => { Meta.click('sleep', 0, 0, { v: 'bar' }); } });
      upg(700, 250); R.greet = 'В казарме тихо. Кто-то храпит, кто-то лежит и смотрит в потолок.'; R.fire = true; L(700, 340, 130, 0.7);
    }
    R.items.sort((a, b) => a.ys - b.ys); this.rooms[k] = R;
  },
  tickRoom(dt) {
    const R = this.room;
    P.food = Math.max(0, P.food - CFG.player.foodRate * 0.25 * dt); P.hp = Math.min(100, P.hp + 1.2 * dt); P.rad = Math.max(0, P.rad - 1.5 * dt); P.stress = Math.max(0, P.stress - 4 * dt); if (P.bleed > 0) P.bleed -= dt;
    G.near = null; if (!G.ui) { let bd = 9999; for (const s of R.spots) { const d = Math.hypot(s.x - P.x, s.y - P.y); if (d < s.r && d < bd) { bd = d; G.near = { label: s.label(), fn: s.fn, o: s }; } } }
    if (P.y > R.h - 62 && Math.abs(P.x - R.door) < 55) return this.exitRoom();
    if (R.fire && Math.random() < dt * 5) Snd.crackle(); Snd.setHum(50, 0.012);
    updateEmission(dt); Snd.siren(G.emi.s === 'warn');
    for (let i = tracers.length - 1; i >= 0; i--) if ((tracers[i].t -= dt) <= 0) tracers.splice(i, 1);
  },
  initRoomSprites() {
    if (this.roomSpr) return; this.roomSpr = true; const M = (n, r, p) => Spr.make(n, r, p);
    M('counter', ['kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk', 'kBBBBBBBBBBBBBBBBBBBBBBBBBBBBk', 'kbbbbbbbbbbbbbbbbbbbbbbbbbbbbk', 'kbdbbdbbdbbdbbdbbdbbdbbdbbdbbk', 'kbdbbdbbdbbdbbdbbdbbdbbdbbdbbk', 'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk'], { b: '#6a4a2a', B: '#8a6a3a', d: '#4a3018', k: '#2a1a0c' });
    M('shelf', ['kkkkkkkkkkkk', 'kzgzrrzbzyzk', 'kkkkkkkkkkkk', 'kzbzgzrrzgzk', 'kkkkkkkkkkkk', 'kzyzbzgzrrzk', 'kkkkkkkkkkkk'], { k: '#3a2a18', z: '#17120c', g: '#4a7a4a', r: '#a04030', b: '#3a5a8a', y: '#c0a040' });
    M('stool', ['bbbbb', '.bbb.', '.b.b.', '.b.b.'], { b: '#5a4024' });
    M('table', ['bbbbbbbbbbbb', 'bBBBBBBBBBBb', '.b........b.', '.b........b.', '.b........b.'], { b: '#5a4024', B: '#7a5a34' });
    M('keg', ['.bbbb.', 'bBBBBb', 'kkkkkk', 'bBBBBb', 'kkkkkk', 'bBBBBb', '.bbbb.'], { b: '#5a3a1a', B: '#7a5a2c', k: '#3a3a3a' });
    M('anvil', ['aaaaaaaaaa', '.aAAAAAAa.', '..aaaaaa..', '...aaaa...', '..aaaaaa..'], { a: '#5a5a5e', A: '#8a8a90' });
    M('rack', ['kkkkkkkkkkkkkk', 'kzrzzrzzrzzzrk', 'kzrzzrzzrzzzrk', 'kzrzzrzzrzzzrk', 'kkkkkkkkkkkkkk', 'kzzsszzzzsszzk', 'kzzsszzzzsszzk', 'kkkkkkkkkkkkkk'], { k: '#3a3020', z: '#17120c', r: '#7a7a80', s: '#a05a30' });
    M('benchw', ['tttttttttttttttttt', 'tTTTTTTTTTTTTTTTTt', 'tTttttTTTTaaTTTTTt', 'kTTTTTTTTTTTTTTTTk', '.k..............k.', '.k..............k.'], { t: '#4a3a24', T: '#6a5434', a: '#8a8a90', k: '#2a2010' });
    M('dummy', ['..kk..', '.kkkk.', '..kk..', 'kkkkkk', '.kkkk.', '..kk..', '..kk..', '.kkkk.'], { k: '#7a6a3a' });
    M('labbench', ['wwwwwwwwwwwwwwwwwwwwww', 'wWWWWWWWWWWWWWWWWWWWWw', 'wWmmWWgWWWggWWWWmmWWWw', 'wWmmWWgWWWggWWWWmmWWWw', 'kwwwwwwwwwwwwwwwwwwwwk', '.k..................k.', '.k..................k.'], { w: '#a8b0b0', W: '#c8d0d0', m: '#3a5a6a', g: '#6ad0a0', k: '#3a4a4a' });
    M('computer', ['kkkkkkkk', 'kbbbbbbk', 'kbggggbk', 'kbggggbk', 'kbbbbbbk', '.kkkkkk.'], { k: '#2a2e30', b: '#3a4448', g: '#5ae080' });
    M('cabinet', ['kkkkkkkkkkkk', 'kgggkgggkggk', 'kgjgkgjgkgjk', 'kgggkgggkggk', 'kkkkkkkkkkkk', 'kbbbkbbbkbbk', 'kbbbkbbbkbbk', 'kkkkkkkkkkkk'], { k: '#2a3438', g: '#4a5a60', j: '#7ad0a0', b: '#3a4448' });
    M('bunk', ['kkkkkkkkkkkkkkkkkkkk', 'kpppppkbbbbbbbbbbbbk', 'kpppppkbbbbbbbbbbbbk', 'kkkkkkkkkkkkkkkkkkkk', 'kpppppkbbbbbbbbbbbbk', 'kpppppkbbbbbbbbbbbbk', 'kkkkkkkkkkkkkkkkkkkk', 'k..................k', 'k..................k'], { k: '#3a3a2a', p: '#8a8a70', b: '#5a6448' });
    M('stove', ['..k...', '..k...', 'kkkkkk', 'kbbbbk', 'kbrrbk', 'kbrrbk', 'kbbbbk', 'kkkkkk'], { k: '#2a2a2a', b: '#4a4a4a', r: '#e08a30' });
    M('rug', ['rrrrrrrrrrrrrrrr', 'rccccccccccccccr', 'rcrrrrrrrrrrrrcr', 'rccccccccccccccr', 'rrrrrrrrrrrrrrrr'], { r: '#6a2a2a', c: '#8a5a3a' });
    M('blueprint', ['kkkkkkkkkkkk', 'kbbbbbbbbbbk', 'kbwbwwwbwwbk', 'kbwbbbwbwbbk', 'kbwwwbwbwwbk', 'kbbbbbbbbbbk', 'kkkkkkkkkkkk'], { k: '#3a3a2a', b: '#2a4a6a', w: '#a0c8e0' });
    M('safe', ['kkkkkkkkk', 'kbbbbbbbk', 'kbbyybbbk', 'kbbyybbbk', 'kbbbbbbbk', 'kkkkkkkkk'], { k: '#2a2a2a', b: '#4a4a52', y: '#c0a040' });
    M('scales', ['..kkkk..', '.k....k.', '.kkkkkk.', 'kkbbbbkk', '..kkkk..'], { k: '#4a4a4a', b: '#a0a060' });
    M('rackc', ['kkkkkkkkkkkkkkkk', 'kbbbbgggrrrrbbbk', 'kbbbbgggrrrrbbbk', 'kbbbbgggrrrrbbbk', 'k..............k', 'k..............k'], { k: '#3a3a30', b: '#5a6a4a', g: '#6a6a70', r: '#8a4a3a' });
    M('solar', ['kkkkkkkk', 'kbbkbbkk', 'kbbkbbkk', 'kkkkkkkk'], { k: '#2a2a3a', b: '#3a5a9a' });
    M('banner', ['kkkkkk', 'kyyyyy', 'kyrryy', 'kyyyyy', 'k.....', 'k.....', 'k.....'], { k: '#3a2a1a', y: '#c8a030', r: '#a03020' });
    M('door', ['kkkkkkkkkk', 'kbbbbbbbbk', 'kbbbbbbbbk', 'kbbbbbbyyk', 'kbbbbbbbbk', 'kbbbbbbbbk', 'kbbbbbbbbk', 'kbbbbbbbbk'], { k: '#2a1a0c', b: '#4a3018', y: '#c0a040' });
  },
});
function vendorLvl(k) { return Camp.lvl(k); }

// ---- отрисовка интерьера ----
function drawInterior() {
  const R = Camp.room; ctx.imageSmoothingEnabled = false; const sh = G.shake;
  cam.x = (R.w <= VW ? (R.w - VW) / 2 : U.clamp(P.x - VW / 2, 0, R.w - VW)) + (Math.random() - 0.5) * sh * 20;
  cam.y = (R.h <= VH ? (R.h - VH) / 2 : U.clamp(P.y - VH / 2, 0, R.h - VH)) + (Math.random() - 0.5) * sh * 20;
  ctx.fillStyle = '#07080a'; ctx.fillRect(0, 0, VW, VH);
  ctx.save(); ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
  for (let y = 100; y < R.h - 50; y += 40) for (let x = 70; x < R.w - 70; x += 40) { ctx.fillStyle = ((x + y) / 40) % 2 ? R.floor : R.floor2; ctx.fillRect(x, y, 40, 40); }
  ctx.fillStyle = R.wall; ctx.fillRect(50, 30, R.w - 100, 70); ctx.fillStyle = 'rgba(0,0,0,.18)'; for (let x = 54; x < R.w - 54; x += 24) ctx.fillRect(x, 30, 2, 70);
  ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(50, 96, R.w - 100, 6);
  ctx.fillStyle = R.wall; ctx.fillRect(50, 30, 20, R.h - 60); ctx.fillRect(R.w - 70, 30, 20, R.h - 60);
  ctx.fillStyle = R.wall; ctx.fillRect(50, R.h - 50, R.door - 40 - 50, 20); ctx.fillRect(R.door + 40, R.h - 50, R.w - 50 - R.door - 40, 20);
  Spr.draw(ctx, 'door', R.door, R.h - 44, false, null, 3);
  const dl = []; for (const it of R.items) if (it.decor) Spr.draw(ctx, it.spr, it.x, it.y, it.flip, null, it.sc); else dl.push({ y: it.ys, it });
  if (R.vendor) dl.push({ y: R.vendor.y + 8, v: 1 });
  if (!G.dead) dl.push({ y: P.y + 8, p: true });
  dl.sort((a, b) => a.y - b.y);
  for (const e of dl) {
    if (e.it) Spr.draw(ctx, e.it.spr, e.it.x, e.it.y, e.it.flip, null, e.it.sc);
    else if (e.v) { const v = R.vendor; shadow(v.x, v.y + 10, 8); Spr.draw(ctx, 'npc_' + R.key, v.x, v.y - 2, false); }
    else { const mv = keys.mx || keys.my, bob = mv ? (Math.floor(G.t * 10) % 2 ? -1 : 0) : 0; shadow(P.x, P.y + 10, 8); Spr.draw(ctx, P.sneak ? 'player_s' : 'player', P.x, P.y + bob - 2, Math.cos(P.ang) < 0); }
  }
  for (const s of R.spots) { const a = 0.4 + 0.4 * Math.sin(G.t * 3 + s.x); ctx.strokeStyle = `rgba(232,192,96,${a})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.x, s.y + 6, 12, 0, 6.28); ctx.stroke(); }
  if (R.fire) { const f = Math.floor(G.t * 8) % 3, fx0 = R.key === 'bar' ? 660 : 700, fy0 = R.key === 'bar' ? 176 : 336; px(fx0, fy0 - f, '#f0a030', 5); px(fx0, fy0 - 4 - f, '#ffd070', 3); }
  ctx.font = 'bold 13px Consolas'; ctx.textAlign = 'center'; ctx.fillStyle = '#e8d8a0'; ctx.fillText(R.name + '  ' + '★'.repeat(Camp.lvl(R.key)) + '☆'.repeat(3 - Camp.lvl(R.key)), R.w / 2, 60);
  ctx.font = '11px Consolas'; ctx.fillStyle = '#8a8470'; ctx.fillText('выход ↓', R.door, R.h - 20);
  ctx.restore(); drawOverlays();
}

// ---- обёртки методов Camp ----
(() => {
  const _enter = Camp.enter.bind(Camp), _clamp = Camp.clampP.bind(Camp), _tick = Camp.tick.bind(Camp), _render = Camp.render.bind(Camp), _click = Camp.click.bind(Camp);
  Camp.enter = function (s) { if (!P.bld) P.bld = this.DEFAULT_BLD(); this.room = null; P.burn = 0; P.grab = 0; _enter(s); };
  Camp.clampP = function () {
    if (G.scene !== 'interior' || !this.room) return _clamp(); const R = this.room;
    P.x = U.clamp(P.x, 96, R.w - 96); P.y = U.clamp(P.y, 130, Math.abs(P.x - R.door) < 45 ? R.h - 30 : R.h - 90);
  };
  Camp.tick = function (dt) { if (G.scene === 'interior') return this.tickRoom(dt); return _tick(dt); };
  Camp.render = function (u) {
    if (u.k === 'upgrade') { panel.style.display = 'block'; panel.innerHTML = this.upgradeHTML(u.b); return true; }
    if (u.k === 'craft') { panel.style.display = 'block'; panel.innerHTML = this.craftHTML(u.st || 'gun'); return true; }
    const r = _render(u);
    if (r && u.k === 'storage') panel.insertAdjacentHTML('beforeend', '<div class="stat" style="margin-top:8px">Вместимость: ' + P.stash.length + ' / ' + (this.stashLimit() > 999 ? '∞' : this.stashLimit()) + ' · ' + this.bonusText('storage') + ' ' + btn('ubuild:storage', 'Улучшить ящик', !this.canUp('storage') || this.lvl('storage') >= 3) + '</div>');
    return r;
  };
  Camp.click = function (a, arg, arg2, u) {
    if (a !== 'salv' && G.ui) G.ui.sc = null;
    if (a === 'salv') { const key = arg + arg2; if (G.ui.sc !== key) G.ui.sc = key; else { G.ui.sc = null; Meta.salvage(arg, arg2); } return true; }
    if (a === 'ubuild') { this.upgrade(arg); return true; }
    if (a === 'craft') {
      const r = CFG.recipes.find(x => x.id === arg); if (!r || !this.canCraft(r)) return true;
      for (const id in r.mat) this.take(id, r.mat[id]);
      if (r.out[0] === 'art') { const t = U.pick(r.out[1]); invAdd('art', 1, t); log('Из переплавки вышло: ' + (P.known[t] ? CFG.arts[t].name : 'неопознанный артефакт'), '#e8c060'); } else invAdd(r.out[0], r.out[1]);
      Snd.pick(); Snd.tick(); addXp(6); log('Сделано: ' + r.name, '#a8c890'); return true;
    }
    if (a === 'stash' && P.stash.length >= this.stashLimit() && !P.stash.find(t => P.inv[+arg] && !P.inv[+arg].g && t.id === P.inv[+arg].id && !t.art && !t.g)) { log('Ящик полон. Улучши его.'); return true; }
    return _click.call(this, a, arg, arg2, u);
  };
})();

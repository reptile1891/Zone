'use strict';
// События Зоны: раз в несколько минут на вылазке что-нибудь случается неподалёку от игрока.
//   Сброшенный груз   — ящик с добром, у которого уже дежурят бандиты (метка на карте, красный дым);
//   Засада            — впереди по ходу бандиты (сектор 2+), предупреждение голосами;
//   Аномальный всплеск — несколько временных светящихся аномалий с артефактами повышенного качества;
//   Коробейник        — странствующий торговец: редкая вещь, расходники, крюк.
// События не сохраняются (при загрузке игры пропадают); счётчик выполненных — P.st.events (достижение «Случай в Зоне»).
const Events = {
  act: [], next: 170,
  DEF: {
    cargo: { name: 'Сброшенный груз', w: 3, min: 1, ttl: 330, col: '#f08a3c', letter: 'Г' },
    ambush: { name: 'Засада', w: 2, min: 2, ttl: 100, col: '#e05050', letter: '' },
    surge: { name: 'Аномальный всплеск', w: 2, min: 1, ttl: 190, col: '#6fb8ff', letter: 'В' },
    peddler: { name: 'Коробейник', w: 2, min: 1, ttl: 300, col: '#c8d878', letter: 'К' },
  },
  gap() { return 190 + Math.random() * 200; },
  reset() { this.clear(true); this.next = 120 + Math.random() * 120; },
  clear(all) {
    for (const e of this.act) this.finish(e, true);
    this.act = [];
    if (all) Stalkers.list = Stalkers.list.filter(s => !s.ev);
  },
  dir(x, y) { const a = Math.atan2(y - P.y, x - P.x); return Meta.DIRS[(Math.round(a / (Math.PI / 4)) + 8) % 8]; },
  where(x, y) { return 'на ' + this.dir(x, y) + ', ~' + Math.round(Math.hypot(x - P.x, y - P.y) / 10) + ' м'; },
  // свободное место на расстоянии [min, max] от игрока: не лагерь, не вода, не среди построек и аномалий
  place(min, max, ang, spread) {
    for (let i = 0; i < 50; i++) {
      const a = ang == null ? Math.random() * 6.2832 : ang + (Math.random() - 0.5) * spread, d = min + Math.random() * (max - min), x = P.x + Math.cos(a) * d, y = P.y + Math.sin(a) * d;
      if (x < 200 || y < 200 || x > W.S - 200 || y > W.S - 200 || Math.hypot(x - W.C.x, y - W.C.y) < W.C.r + 260 || W.inWater(x, y)) continue;
      let bad = false; W.og.query(x, y, 80, o => { if (Math.hypot(o.x - x, o.y - y) < o.r + 34) bad = true; }); if (bad || W.anoms.some(an => Math.hypot(an.x - x, an.y - y) < an.r + 70)) continue;
      return { x, y };
    }
    return null;
  },
  pick() {
    const sec = W.danger(P.x, P.y), ks = Object.keys(this.DEF).filter(k => this.DEF[k].min <= sec && !this.act.some(e => e.k === k));
    return ks.length ? U.wpick(ks, ks.map(k => this.DEF[k].w)) : null;
  },
  update(dt) {
    if (G.scene !== 'zone' || G.dead || inCamp()) return;
    for (let i = this.act.length - 1; i >= 0; i--) { const e = this.act[i]; e.ttl -= dt; this.tickOne(e); if (e.ttl <= 0 || e.done) { this.finish(e); this.act.splice(i, 1); } }
    if (G.emi.s !== 'calm') return;
    this.next -= dt;
    if (this.next <= 0) { this.next = this.gap(); if (this.act.length < 2) { const k = this.pick(); if (k) this.spawn(k); } }
  },
  spawn(k) {
    const def = this.DEF[k], sec = W.danger(P.x, P.y); let e = { k, ttl: def.ttl, done: false, x: 0, y: 0, sec };
    if (k === 'cargo') {
      const p = this.place(450, 850); if (!p) return; Object.assign(e, p, { sec: W.danger(p.x, p.y), opened: false, guards: [] });
      for (let i = 0, n = 2 + (e.sec >= 3 ? 1 : 0); i < n; i++) { const s = new Stalker('bandit', p.x + (Math.random() - 0.5) * 90, p.y + (Math.random() - 0.5) * 90); s.hx = p.x; s.hy = p.y; s.ev = true; s.hostile = true; Stalkers.list.push(s); e.guards.push(s); }
      log('Рация: сброшен груз — ' + this.where(p.x, p.y) + '. У ящика уже кто-то дежурит.', def.col); Snd.evCargo();
    } else if (k === 'ambush') {
      const mv = Math.hypot(keys.mx || 0, keys.my || 0) > 0, ang = mv ? Math.atan2(keys.my || 0, keys.mx || 0) : P.ang, p = this.place(330, 430, ang, 1.0); if (!p) return;
      Object.assign(e, p); e.guards = [];
      for (let i = 0, n = 3 + (sec >= 3 ? 1 : 0); i < n; i++) { const s = new Stalker('bandit', p.x + (Math.random() - 0.5) * 110, p.y + (Math.random() - 0.5) * 110); s.hx = p.x; s.hy = p.y; s.ev = true; s.hostile = true; s.st = 8; Stalkers.list.push(s); e.guards.push(s); }
      log('Впереди приглушённые голоса и звон металла. Похоже, тебя ждут.', def.col); Snd.evAmbush();
    } else if (k === 'surge') {
      const p = this.place(350, 650); if (!p) return; Object.assign(e, p, { sec: W.danger(p.x, p.y), anoms: [], got: false });
      for (let i = 0; i < 12 && e.anoms.length < 3; i++) {
        const a = W.tryPlace(p.x + (Math.random() - 0.5) * 230, p.y + (Math.random() - 0.5) * 230, Math.random); if (!a) continue;
        a.tmp = true; a.known = true; e.anoms.push(a); W.addArtifact(a, e.sec, Math.random);
        const art = W.arts[W.arts.length - 1]; art.q = Gear.rollQ(Math.random, findLuck() + 3); art.surge = true;
      }
      if (!e.anoms.length) return;
      log('Прибор фонит: аномальный всплеск — ' + this.where(p.x, p.y) + '. Аномалии светятся, в них артефакты. Ненадолго.', def.col); Snd.evSurge();
    } else if (k === 'peddler') {
      const p = this.place(400, 800); if (!p) return; Object.assign(e, p, { sec: W.danger(p.x, p.y) });
      const s = new Stalker('loner', p.x, p.y); s.name = 'Коробейник'; s.peddler = true; s.ev = true; s.hx = p.x; s.hy = p.y; s.offers = this.offers(e.sec); Stalkers.list.push(s); e.s = s;
      log('Слух: по Зоне ходит коробейник — ' + this.where(p.x, p.y) + '.', def.col); Snd.evPeddler();
    }
    this.act.push(e);
  },
  tickOne(e) {
    if (e.k === 'cargo' || e.k === 'ambush') {
      if (e.k === 'ambush' && !e.done && e.guards.every(s => s.dead)) { e.done = true; Stats.on('events'); log('Засада разбита.', '#9ad0a0'); }
      if (e.k === 'ambush' && e.guards.every(s => s.dead || Math.hypot(s.x - P.x, s.y - P.y) > 1300)) e.done = true;
    } else if (e.k === 'surge') {
      if (!e.got && !W.arts.some(a => a.surge) && e.anoms.length) { e.got = true; e.done = true; }
    } else if (e.k === 'peddler') { if (e.s.dead) e.done = true; }
  },
  finish(e, silent) {
    if (e.finished) return; e.finished = true;
    if (e.k === 'surge') {
      const ids = new Set(e.anoms.map(a => a.id)); W.anoms = W.anoms.filter(a => !ids.has(a.id)); W.arts = W.arts.filter(a => !ids.has(a.anom));
      if (!silent && G.scene === 'zone') log('Всплеск угас: аномалии исчезли.', '#8aa0b0');
    } else if (e.k === 'cargo' && !e.opened && !silent && G.scene === 'zone') log('Груз забрали другие.', '#8aa0b0');
    else if (e.k === 'peddler' && e.s) { e.s.dead = true; if (!silent && G.scene === 'zone') log('Коробейник ушёл дальше.', '#8aa0b0'); }
  },
  // ---- груз ----
  openCargo(e) {
    if (e.opened) return; e.opened = true; e.done = true; const rw = W.rw(e.sec), got = [];
    const money = Math.round((70 + Math.random() * 90) * rw); P.money += money; got.push(money + ' ₽');
    const ammo = 6 + Math.floor(Math.random() * 7); invAdd('ammo', ammo); got.push('патроны ×' + ammo);
    const mk = 1 + Math.floor(Math.random() * 2); invAdd('medkit', mk); got.push('аптечка ×' + mk);
    if (Math.random() < 0.55) { invAdd('antirad', 1); got.push('антирад'); }
    if (Math.random() < 0.35) { const g = Gear.loot(Math.random, e.sec); P.inv.push(g); got.push(Meta.itemName(g)); }
    if (e.sec >= 2 && Math.random() < 0.4) { const ids = Object.keys(CFG.arts).filter(k => k !== 'echo'); invAdd('art', 1, ids[Math.floor(Math.random() * ids.length)]); got.push('артефакт'); }
    log('Груз вскрыт: ' + got.join(', '), '#e8c060'); Snd.pick(); Stats.on('events');
  },
  // ---- коробейник: та же витрина, что в Торговом доме (Inv 'shop' — взял в руку, «Купить» подтверждает) ----
  offers(sec) {
    const o = [], tm = 1 - 0.04 * P.sk.trade, add = (id, n, mul) => { const d = CFG.items[id]; o.push({ id, kind: 'item', icon: d.icon, name: d.name + (n > 1 ? ' ×' + n : ''), sub: d.desc, price: Math.max(1, Math.round(d.buy * n * mul * tm)), buyLabel: 'Купить', qty: n }); };
    const g = Gear.loot(Math.random, sec); o.push({ id: 'g0', kind: 'gear', gear: g, icon: itemIcon(g), name: Meta.itemLabel(g).replace(/<[^>]+>/g, ''), sub: 'Редкая вещь: свои случайные характеристики', price: Math.round(CFG.items[g.id].buy * (1.1 + 0.45 * ((g.g && g.g.rar) || 0)) * tm), buyLabel: 'Купить' });
    add('medkit', 2, 0.95); add('antirad', 2, 0.95); add('bolt', 10, 0.9);
    if (!hasItem('hook')) add('hook', 1, 0.85); else add('ammo', 20, 0.9);
    return o;
  },
  openPeddler(s) { G.ui = { k: 'peddler', s }; renderPanel(); },
  peddlerHtml(u) {
    Inv.shopList = (u.s.offers || []).filter(o => !o.sold);
    let h = '<div class="x" data-a="close">✕ Esc</div><h2>Коробейник</h2><div class="stat">«Что тут у меня… Только без торга — я сам рискую шкурой.» · Деньги: <b style="color:#e8c060">' + P.money + ' ₽</b> · Вес ' + weight().toFixed(1) + '/' + carryCap() + '</div>';
    return h + Inv.shopGrid(u) + Inv.handBar(u);
  },
  // ---- рисование ----
  draw() {
    for (const e of this.act) if (e.k === 'cargo' && !e.opened) {
      if (e.x < cam.x - 60 || e.x > cam.x + VW + 60 || e.y < cam.y - 140 || e.y > cam.y + VH + 60) continue;
      shadow(e.x, e.y + 8, 12); ctx.fillStyle = '#6e5230'; ctx.fillRect(e.x - 9, e.y - 6, 18, 13); ctx.fillStyle = '#8c6a3c'; ctx.fillRect(e.x - 9, e.y - 6, 18, 3); ctx.fillStyle = '#3a2a14'; ctx.fillRect(e.x - 1, e.y - 6, 2, 13);
      const f = 0.5 + 0.5 * Math.sin(G.t * 5); ctx.fillStyle = 'rgba(255,110,50,' + (0.22 + 0.12 * f) + ')'; ctx.fillRect(e.x - 1, e.y - 110, 3, 104); px(e.x, e.y - 112, f > 0.5 ? '#ff8a40' : '#ffc070', 5);
      if (Math.hypot(e.x - P.x, e.y - P.y) < 150) { ctx.font = 'bold 11px Consolas'; ctx.textAlign = 'center'; ctx.fillStyle = '#e8c060'; ctx.fillText('Груз', e.x, e.y - 12); }
    }
  },
  // указатель у края экрана на события, которые сейчас за кадром (груз, всплеск, коробейник)
  drawArrows() {
    if (G.scene !== 'zone' || G.dead) return;
    for (const e of this.act) {
      if (!this.DEF[e.k].letter || e.done || (e.k === 'cargo' && e.opened)) continue;
      const sx = e.x - cam.x, sy = e.y - cam.y; if (sx > 30 && sx < VW - 30 && sy > 30 && sy < VH - 30) continue;
      const a = Math.atan2(e.y - P.y, e.x - P.x), cx = VW / 2, cy = VH / 2, k = Math.min((VW / 2 - 36) / Math.max(0.01, Math.abs(Math.cos(a))), (VH / 2 - 36) / Math.max(0.01, Math.abs(Math.sin(a))));
      const x = cx + Math.cos(a) * k, y = cy + Math.sin(a) * k, d = this.DEF[e.k]; ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.globalAlpha = 0.85; ctx.fillStyle = d.col;
      ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.restore(); ctx.globalAlpha = 0.9;
      ctx.font = 'bold 11px Consolas'; ctx.textAlign = 'center'; ctx.fillStyle = d.col; ctx.fillText(d.letter + ' ' + Math.round(Math.hypot(e.x - P.x, e.y - P.y) / 10) + ' м', x - Math.cos(a) * 24, y - Math.sin(a) * 24 + 4); ctx.globalAlpha = 1;
    }
  },
  drawMap(m, k) {
    for (const e of this.act) { const d = this.DEF[e.k]; if (!d.letter || e.done || (e.k === 'cargo' && e.opened)) continue; m.fillStyle = d.col; m.beginPath(); m.arc(e.x * k, e.y * k, 6, 0, 6.28); m.fill(); m.fillStyle = '#0b0d0a'; m.font = 'bold 10px Consolas'; m.textAlign = 'center'; m.fillText(d.letter, e.x * k, e.y * k + 3); }
  },
};

(function () {
  const _upd = update; update = function (dt) { _upd(dt); Events.update(dt); };
  const _near = Meta.nearExtra; Meta.nearExtra = function (c) { _near.call(this, c); for (const e of Events.act) if (e.k === 'cargo' && !e.opened) c(e, Math.hypot(e.x - P.x, e.y - P.y), 40, 'Вскрыть груз', () => Events.openCargo(e)); };
  const _on = Meta.openNpc; Meta.openNpc = function (s) { return s.peddler ? Events.openPeddler(s) : _on.call(this, s); };
  const _dw = Meta.drawWorld; Meta.drawWorld = function () { _dw.call(this); Events.draw(); };
  const _dm = Meta.drawMap; Meta.drawMap = function (m, k) { _dm.call(this, m, k); Events.drawMap(m, k); };
  const _do = drawOverlays; drawOverlays = function () { _do(); Events.drawArrows(); };
  const _dep = Camp.depart; Camp.depart = function () { _dep.call(this); Events.reset(); };
  const _ent = Camp.enter; Camp.enter = function (silent) { _ent.call(this, silent); Events.clear(true); };
  const _render = Camp.render; Camp.render = function (u) { if (u.k === 'peddler') { panel.style.display = 'block'; panel.innerHTML = Events.peddlerHtml(u); Inv.syncHand(u); return true; } return _render.call(this, u); };
  // первая успешная покупка у коробейника засчитывается в статистику событий
  const _ib = Inv.buy; Inv.buy = function (o, n) {
    const before = o.sold; _ib.call(this, o, n);
    if (!before && o.sold && G.ui && G.ui.k === 'peddler') { const e = Events.act.find(x => x.s === G.ui.s); if (e && !e.paid) { e.paid = true; Stats.on('events'); } }
  };
})();

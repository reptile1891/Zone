'use strict';
// Ближний бой. Под цифрой 1 всегда холодное оружие (у игрока с начала есть нож): ЛКМ — удар дугой перед собой, бьёт всех в радиусе и секторе.
// Тихо (шум 35–140 против 750 у пистолета), но нужно подойти вплотную; по не заметившим — «удар в спину» с множителем. Ножи разные (CFG.melee), продаются
// в Торговом доме (вкладка «Оружие»); в руках — P.knife, купленные — P.knives. Второе нажатие 1 меняет нож.
const Melee = {
  DEF: CFG.melee,
  cur() { return this.DEF[P.knife && (P.knives || []).includes(P.knife) ? P.knife : 'knife']; },
  cycle() { const k = P.knives || ['knife'], i = k.indexOf(P.knife); P.knife = k[(i + 1) % k.length]; log('В руках: ' + this.cur().name, '#c8c090'); Snd.tick(); },
  stats(d) { return 'урон ' + d.dmg + ' · ' + (1 / d.cd).toFixed(1) + ' уд./с · дальн. ' + d.reach + ' · шум ' + d.noise + (d.back > 1 ? ' · в спину ×' + d.back : '') + (d.pierce ? ' · пробивает броню' : ''); },
  fx: null,
  // не заметил игрока: спящий, бродит, насторожен (мутанты и подземные враги), сталкер не в бою
  unaware(m) { return m.kind ? m.state !== 'combat' && m.state !== 'wounded' : ['idle', 'wander', 'sleep', 'investigate'].includes(m.state); },
  swing(id) {   // id — нож с отдельной кнопки быстрой панели; без него — нож в руках (кнопка 1)
    if (P.cd > 0 || G.dead) return; const d = id && this.DEF[id] ? this.DEF[id] : this.cur(), dun = G.scene === 'dungeon';
    P.cd = d.cd; this.fx = { life: 0.18, t: 0.18, a: P.ang, r: d.reach, arc: d.arc }; Snd.whoosh();
    let hit = 0, back = false;
    for (const list of dun ? [Dungeon.enemies] : [Mutants.list, Stalkers.list]) for (const m of list) {
      if (m.dead || (!dun && Mutants.hidden(m))) continue;
      const dx = m.x - P.x, dy = m.y - P.y, dist = Math.hypot(dx, dy), mr = m.r || 9;
      if (dist > d.reach + mr) continue;
      if (dist > mr + 10 && U.angDiff(P.ang, Math.atan2(dy, dx)) > d.arc / 2) continue;
      if (dun && !Dungeon.los(P.x, P.y, m.x, m.y)) continue;
      const un = this.unaware(m), dmg = d.dmg * (un ? d.back : 1) * (P.sneak ? 1.25 : 1);
      m.hurt(dmg, P, d.pierce); hit++; if (un) back = true;
      if (!dun && !m.dead && dist > 0) { m.x += dx / dist * 5; m.y += dy / dist * 5; }   // лёгкая отдача
      for (let i = 0; i < 4; i++) parts.push({ x: m.x, y: m.y, vx: (Math.random() - 0.5) * 90, vy: (Math.random() - 0.5) * 90, life: 0.4, col: '#7a1a1a' });
    }
    if (hit) { Snd.hit(); G.shake = Math.max(G.shake, 0.05); if (back) log('Удар в спину!', '#c8b0e8'); }
    Mutants.hear(P.x, P.y, d.noise);
  },
  tick(dt) { if (this.fx) { this.fx.t -= dt; if (this.fx.t <= 0) this.fx = null; } },
  draw() {
    const h = heldNames[P.sel], kn = Quick.knife(h), held = h === 'melee' || kn; if (!held || G.dead || (G.scene !== 'zone' && G.scene !== 'dungeon')) return;
    const d = kn ? this.DEF[kn] : this.cur(), f = this.fx, a = f ? P.ang + (0.5 - f.t / f.life) * d.arc * 0.9 : P.ang + 0.6;
    ctx.strokeStyle = '#c8ccd0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(P.x + Math.cos(a) * 6, P.y + 2 + Math.sin(a) * 6); ctx.lineTo(P.x + Math.cos(a) * (10 + d.reach * 0.35), P.y + 2 + Math.sin(a) * (10 + d.reach * 0.35)); ctx.stroke();
    if (f) { ctx.globalAlpha = 0.55 * f.t / f.life; ctx.lineWidth = 3; ctx.strokeStyle = '#e8ecf0'; ctx.beginPath(); ctx.arc(P.x, P.y, d.reach * 0.85, f.a - d.arc / 2, f.a + d.arc / 2); ctx.stroke(); ctx.globalAlpha = 1; }
  },
  // подсказка для ячейки быстрой панели
  tip(id) { const d = id ? this.DEF[id] : this.cur(); return Tip.head(d.name, 'ближний бой') + '<div class="ti-d">' + d.note + '</div>' + Tip.row('▸', this.stats(d)) + (!id && (P.knives || []).length > 1 ? Tip.row('Сменить:', 'нажми 1 ещё раз') : ''); },
  // ---- продажа (вкладка «Оружие» Торгового дома) ----
  shopHTML() {
    let h = '<h3>Холодное оружие</h3>';
    for (const k in this.DEF) {
      const d = this.DEF[k], own = (P.knives || []).includes(k); if (!own && (d.lvl || 1) > Camp.lvl('gun')) continue;
      const btns = own ? '<div style="display:flex;flex-direction:column;gap:3px;min-width:104px">' + btn('mequip:' + k, P.knife === k ? 'В руках' : 'В руки', P.knife === k) + (k === 'knife' || P.knife === k ? '' : btn('msell:' + k, 'Продать ' + Math.floor(d.price / 2) + ' ₽')) + '</div>' : btn('mbuy:' + k, d.price + ' ₽', P.money < d.price);
      h += row(d.icon, d.name + (P.knife === k ? ' ★' : ''), this.stats(d) + '<br>' + d.note, btns);
    }
    return h;
  },
};

(function () {
  const _rp = resetPlayer; resetPlayer = function () { _rp(); P.knives = ['knife']; P.knife = 'knife'; };
  const _al = Meta.afterLoad; Meta.afterLoad = function () { _al.call(this); if (!Array.isArray(P.knives) || !P.knives.length) P.knives = ['knife']; if (!P.knives.includes(P.knife)) P.knife = P.knives[0]; };
  P.knives = ['knife']; P.knife = 'knife';
  const _upd = update; update = function (dt) { _upd(dt); Melee.tick(dt); };
  const _dw = Meta.drawWorld; Meta.drawWorld = function () { _dw.call(this); Melee.draw(); };
  const _gs = Meta.gunShopHTML; Meta.gunShopHTML = function () { return _gs.call(this) + Melee.shopHTML(); };
  const _tq = Tip.quick; Tip.quick = function (i) { return heldNames[i] === 'melee' ? Melee.tip() : _tq.call(this, i); };
  const _fa = Tip.fromAttr; Tip.fromAttr = function (attr) { const [a, k] = String(attr).split(':'); if ((a === 'mbuy' || a === 'mequip' || a === 'msell') && Melee.DEF[k]) { const d = Melee.DEF[k]; return Tip.head(d.name, 'ближний бой') + '<div class="ti-d">' + d.note + '</div>' + Tip.row('▸', Melee.stats(d)); } return _fa.call(this, attr); };
  const _click = Meta.click; Meta.click = function (a, arg, arg2, u) {
    const d = Melee.DEF[arg];
    if (a === 'mbuy' && d) { if (!(P.knives || []).includes(arg) && P.money >= d.price) { P.money -= d.price; P.knives.push(arg); P.knife = arg; Snd.pick(); log('Куплено: ' + d.name, '#c8c090'); } return true; }
    if (a === 'mequip' && d) { if ((P.knives || []).includes(arg)) P.knife = arg; return true; }
    if (a === 'msell' && d) { if (arg !== 'knife' && P.knives.length > 1 && P.knives.includes(arg)) { const p = Math.floor(d.price / 2); P.knives.splice(P.knives.indexOf(arg), 1); P.money += p; if (P.knife === arg) P.knife = P.knives[0]; Snd.pick(); log('Продано: ' + d.name + ' за ' + p + ' ₽'); } return true; }
    return _click.call(this, a, arg, arg2, u);
  };
})();

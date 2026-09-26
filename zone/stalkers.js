'use strict';
// Другие люди в Зоне: одиночки (нейтральны, можно поговорить), бандиты (стреляют), оцепление (закрытый сектор), раненые (можно помочь).
const STALKER_NAMES = ['Гарик', 'Мосол', 'Крот', 'Седой', 'Пашка-Ржавый', 'Лёха-Кривой', 'Зуб', 'Тихон', 'Барсук', 'Копчёный', 'Митя', 'Шнур'];

class Stalker {
  constructor(kind, x, y) {
    const c = CFG.stalkers[kind];
    Object.assign(this, { kind, c, x, y, hx: x, hy: y, tx: x, ty: y, hp: c.hp, r: 9, state: kind === 'wounded' ? 'wounded' : 'wander', st: 0,
      cd: 1 + Math.random(), hostile: !!c.hostile, dead: false, slow: 1, face: 1, name: U.pick(STALKER_NAMES), perc: Math.random() * 0.3, lost: 0, gave: false, warned: false });
  }
  hurt(d, src) {
    if (this.dead) return;
    this.hp -= d;
    if (src === P && !this.hostile && this.state !== 'wounded') { this.hostile = true; P.rep -= 5; log('Ты выстрелил в своего. Репутация падает.', '#e06060'); }
    if (this.hp <= 0) this.die(src);
  }
  die(src) {
    this.dead = true; const items = [];
    if (this.kind === 'bandit' || this.kind === 'patrol') { items.push(['money', 15 + Math.floor(Math.random() * 55)], ['ammo', 3 + Math.floor(Math.random() * 6)]); if (Math.random() < 0.3) items.push(['medkit', 1]); }
    else { items.push(['money', 5 + Math.floor(Math.random() * 25)]); if (Math.random() < 0.5) items.push(['food', 1]); }
    W.corpses.push({ x: this.x, y: this.y, items, looted: false, art: null, note: null });
    Snd.at('die', this.x, this.y);
    if (src === P) {
      if (this.kind === 'bandit' || this.kind === 'patrol') { P.rep += 2; P.kills++; addXp(12); }
      else { P.rep -= 15; P.karma.cruelty += this.kind === 'wounded' ? 3 : 2; log('Убийство своего. В лагере это запомнят.', '#e06060'); }
      Meta.onKill(this.kind); if (this.bounty) Meta.onKill('bounty');
    }
  }
  update(dt) {
    this.cd -= dt; this.st -= dt; this.perc -= dt; this.recoil = Math.max(0, (this.recoil || 0) - dt * 7);
    if (this.state === 'wounded') return;
    const pd = Math.hypot(P.x - this.x, P.y - this.y), c = this.c;
    if (this.perc <= 0) { this.perc = 0.25; this.perceive(pd); }
    let tx = this.tx, ty = this.ty, speed = 0;
    if (this.state === 'combat') {
      if (G.dead || inCamp()) this.state = 'wander';
      else {
        tx = P.x; ty = P.y; const ang = Math.atan2(P.y - this.y, P.x - this.x); this.face = Math.cos(ang) < 0 ? -1 : 1;
        if (pd > c.range + 30) speed = c.run;
        else if (pd < c.range - 60) { tx = this.x - (P.x - this.x); ty = this.y - (P.y - this.y); speed = c.walk; }
        else { const s = Math.floor(G.t / 2 + this.x) % 2 ? 1 : -1; tx = this.x - Math.sin(ang) * 40 * s; ty = this.y + Math.cos(ang) * 40 * s; speed = c.walk * 0.8; }
        if (pd < c.range + 80 && this.cd <= 0) this.shoot(pd);
        if (pd > c.sight * 1.8) { this.lost += dt; if (this.lost > 6) this.state = 'wander'; } else this.lost = 0;
      }
    } else {
      speed = c.walk;
      if (Math.hypot(tx - this.x, ty - this.y) < 14 || this.st <= 0) {
        if (Math.random() < 0.5) { speed = 0; this.st = 2 + Math.random() * 5; this.tx = this.x; this.ty = this.y; }
        else { const a = Math.random() * 6.28, d = Math.random() * c.roam; this.tx = U.clamp(this.hx + Math.cos(a) * d, 60, W.S - 60); this.ty = U.clamp(this.hy + Math.sin(a) * d, 60, W.S - 60); this.st = 6 + Math.random() * 6; }
      }
      if (speed) this.face = tx > this.x ? 1 : -1;
    }
    this.move(dt, tx, ty, speed);
  }
  perceive(pd) {
    if (!this.hostile || this.state === 'combat' || G.dead || inCamp()) return;
    const c = this.c, sight = c.sight * (P.sneak ? 0.6 : 1) * (W.inGrass(P.x, P.y) ? 0.6 : 1) * (1 - G.fog * 0.3) * (1 - G.rain * 0.2) * (1 - 0.45 * G.night);
    if (pd < sight) { this.state = 'combat'; this.lost = 0; if (!this.warned) { this.warned = true; log(c.name + ' заметил тебя!', '#e06060'); } }
  }
  shoot(pd) {
    const c = this.c; this.cd = c.cd * (0.8 + Math.random() * 0.5); this.recoil = 1;
    const moving = Math.hypot(keys.mx || 0, keys.my || 0) > 0;
    const acc = c.acc * (moving ? 0.75 : 1) * (P.sneak ? 0.75 : 1) * U.clamp(1 - pd / (c.range * 2.4), 0.25, 1);
    tracers.push({ x1: this.x, y1: this.y, x2: P.x + (Math.random() - 0.5) * 40 * (1 - acc), y2: P.y + (Math.random() - 0.5) * 40 * (1 - acc), t: 0.06 });
    Snd.at('shot', this.x, this.y); Mutants.hear(this.x, this.y, 550);
    if (Math.random() < acc) P.hurt(c.dmg, 'gun');
  }
  move(dt, tx, ty, speed) {
    speed *= this.slow;
    let dx = tx - this.x, dy = ty - this.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    for (const a of W.anoms) {
      const ax = this.x - a.x, ay = this.y - a.y, ad = Math.hypot(ax, ay), lim = a.r + 32;
      if (ad < lim && ad > 0) { const k = (1 - ad / lim) * 2.5; dx += ax / ad * k; dy += ay / ad * k; }
    }
    W.og.query(this.x, this.y, 70, o => {
      const ox = this.x - o.x, oy = this.y - o.y, od = Math.hypot(ox, oy), lim = o.r + this.r + 26;
      if (od < lim && od > 0) { const k = (1 - od / lim) * 2; dx += ox / od * k - oy / od * k * 0.8; dy += oy / od * k + ox / od * k * 0.8; }
    });
    const cx = this.x - W.C.x, cy = this.y - W.C.y, cd = Math.hypot(cx, cy);
    if (cd < W.C.r + 30) { dx += cx / cd * 3; dy += cy / cd * 3; }
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    this.x += dx * speed * dt; this.y += dy * speed * dt;
    W.og.query(this.x, this.y, this.r + 40, o => {
      const ox = this.x - o.x, oy = this.y - o.y, od = Math.hypot(ox, oy), m = o.r + this.r;
      if (od < m && od > 0) { this.x = o.x + ox / od * m; this.y = o.y + oy / od * m; }
    });
    this.x = U.clamp(this.x, 20, W.S - 20); this.y = U.clamp(this.y, 20, W.S - 20);
  }
}

const Stalkers = {
  list: [],
  spawn() { this.list = []; for (const k in CFG.stalkers) for (let i = 0; i < CFG.stalkers[k].count; i++) this.add(k, false); },
  add(kind, far) {
    const c = CFG.stalkers[kind]; let p = null;
    for (let i = 0; i < 40 && !p; i++) { const q = W.spot(500), d = W.danger(q.x, q.y); if (d >= c.dmin && d <= c.dmax && (!far || Math.hypot(q.x - P.x, q.y - P.y) > 800)) p = q; }
    if (p) this.list.push(new Stalker(kind, p.x, p.y));
  },
  spawnPatrol() {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * 6.28, s = new Stalker('patrol', U.clamp(P.x + Math.cos(a) * 380, 60, W.S - 60), U.clamp(P.y + Math.sin(a) * 380, 60, W.S - 60));
      s.state = 'combat'; this.list.push(s);
    }
  },
  update(dt) {
    for (const s of this.list) if (!s.dead && Math.abs(s.x - P.x) < 1500 && Math.abs(s.y - P.y) < 1500) s.update(dt);
    this.list = this.list.filter(s => !s.dead && !(s.kind === 'patrol' && Math.hypot(s.x - P.x, s.y - P.y) > 1600));
  },
  refill() { for (const k in CFG.stalkers) { const c = CFG.stalkers[k]; if (!c.count) continue; let have = this.list.filter(s => s.kind === k).length; while (have < c.count * 0.7) { this.add(k, true); have++; } } },
};

function drawStalker(s) {
  const pd = Math.hypot(s.x - P.x, s.y - P.y), spr = { loner: 'st_loner', bandit: 'st_bandit', patrol: 'st_patrol', wounded: 'lying' }[s.kind];
  shadow(s.x, s.y + 10, 8); Spr.draw(ctx, spr, s.x, s.y - (s.kind === 'wounded' ? 0 : 2), s.face < 0);
  if (s.kind !== 'wounded') Gun.draw(ctx, s.x, s.y + 2, s.state === 'combat' ? Math.atan2(P.y - s.y, P.x - s.x) : (s.face < 0 ? Math.PI : 0), s.kind === 'patrol' ? 'rifle' : 'pistol', s.recoil || 0);
  ctx.font = 'bold 12px Consolas'; ctx.textAlign = 'center';
  if (s.state === 'combat') { ctx.fillStyle = '#e05050'; ctx.fillText('!', s.x, s.y - 20); }
  else if (s.kind === 'wounded') { ctx.fillStyle = '#e8d060'; ctx.fillText('+', s.x, s.y - 12); }
  if (pd < 130 && !s.hostile) { ctx.fillStyle = '#c9c2a8'; ctx.fillText(s.name, s.x, s.y - 24); }
  if (s.hp < s.c.hp) { ctx.fillStyle = '#000'; ctx.fillRect(s.x - 10, s.y - 20, 20, 3); ctx.fillStyle = '#a33'; ctx.fillRect(s.x - 10, s.y - 20, 20 * s.hp / s.c.hp, 3); }
}

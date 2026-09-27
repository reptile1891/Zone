'use strict';
// Оригинальные обитатели Зоны. Общий каркас состояний + особые правила по видам (см. CFG.mut):
//  Слухач    — слепая стая, охотится на звук; тихий шаг спасает.
//  Стеклоед  — пугливое стадо, добыча для остальных.
//  Жестянка  — броня, территория, тянется к звону металла, ест брошенные болты.
//  Туманник  — выходит в туман/дождь, замирает, пока на него смотришь.
//  Топляк    — прячется в воде, хватает у кромки и держит (P.grab); из пруда не выходит.
//  Углеглот  — днём спит в золе (не виден), ночью бросается из засады; огнеупорен, оставляет угли и поджигает.
class Mutant {
  constructor(sp, x, y, pack) {
    const c = CFG.mut[sp];
    Object.assign(this, { sp, c, x, y, pack, hp: c.hp, ang: Math.random() * 6.28, hunger: Math.random() * 0.4, fear: 0,
      state: sp === 'fogger' || sp === 'cinder' || c.aquatic ? 'sleep' : 'wander', st: 0, burn: 0, burner: null, trailT: 0, tx: x, ty: y, hx: x, hy: y, cd: 0, chargeCd: 0, target: null,
      perc: Math.random() * 0.25, slow: 1, dead: false, reckless: 0, lost: 0, r: c.r, eatT: 0, idx: 0, sndT: Math.random() * 3, watched: false, face: 1 });
  }
  hurt(d, src, pierce) {
    if (this.dead) return;
    this.hp -= d * (pierce ? 1 : 1 - (this.c.armor || 0));
    if (this.c.aquatic && src === P && P.grab > 0) P.grab = Math.max(0, P.grab - 0.6);   // раненый Топляк ослабляет хватку
    if (this.hp <= 0) return this.die(src);
    if (src && src !== 'anom') {
      if (this.c.timid) this.flee(src.x, src.y, 5);
      else if (this.c.pack && this.hp < this.c.hp * (0.3 + Mutants.ad(this.sp).player * 0.04)) this.flee(src.x, src.y, 5);
      else { this.target = src; this.state = 'hunt'; this.lost = 0; if (this.pack) Mutants.rally(this, src); }
    }
  }
  die(src) {
    this.dead = true; if (this.c.aquatic && this.state === 'hunt') P.grab = 0; Mutants.corpses.push({ x: this.x, y: this.y, sp: this.sp, meat: this.c.meat, age: 0 });
    if (src === P) { addXp(this.c.xp); Meta.onKill(this.sp); Mutants.learn(this.sp, 'player'); } else if (src === 'anom') Mutants.learn(this.sp, 'anom');
    Snd.at('die', this.x, this.y);
    Mutants.onDeath(this);
  }
  flee(x, y, t) {
    if (this.state !== 'flee') Snd.at(this.c.timid ? 'chime' : 'yelp', this.x, this.y);
    this.state = 'flee'; this.tx = x; this.ty = y; this.st = t; this.target = null;
    if (this.c.timid && this.pack) for (const o of this.pack.members) if (o !== this && !o.dead && o.state !== 'flee') { o.state = 'flee'; o.tx = x; o.ty = y; o.st = t; o.target = null; }
  }
  wake() { this.state = 'wander'; this.st = 0; }
  isActive() {
    const a = this.c.active;
    return a === 'night' ? G.night > 0.5 : a === 'day' ? G.night < 0.5 : G.fog > 0.55 || G.rain > 0.5;
  }
  nearestHostile(list, lim) {
    let best = null, bd = lim;
    for (const m of Mutants.list) if (!m.dead && list.includes(m.sp)) { const d = Math.hypot(m.x - this.x, m.y - this.y); if (d < bd) { bd = d; best = m; } }
    return best;
  }
  perceive() {
    const c = this.c, pd = Math.hypot(P.x - this.x, P.y - this.y), act = this.isActive();
    if (this.state === 'sleep') {
      if (c.active === 'weather') { if (act) this.wake(); return; }
      const wr = c.wakeR || 130;
      if (pd < wr || (act && Math.random() < 0.06)) { this.wake(); if (c.ambush && pd < wr && !inCamp() && !G.dead) this.startHunt(P); }
      return;
    }
    if (!act) {
      if (c.active === 'weather') { this.state = 'sleep'; this.target = null; return; }
      if (this.state === 'wander' && pd > (c.hideR || 450) && Math.random() < 0.02) { this.state = 'sleep'; return; }
    }
    const inC = inCamp();
    const sight = c.sight * (act ? 1 : 0.6) * (P.sneak ? 0.5 : 1) * (1 - G.fog * 0.3) * (1 - G.rain * 0.25) * (W.inGrass(P.x, P.y) ? 0.55 : 1);
    const seen = !inC && !G.dead && (pd < 45 || pd < sight * 0.6 || (pd < sight && U.angDiff(this.ang, Math.atan2(P.y - this.y, P.x - this.x)) < 1.1));
    const busy = this.state === 'hunt' || this.state === 'flee';
    // стадные бегут от хищников
    if (c.timid && this.state !== 'flee') { const h = this.nearestHostile(['listener', 'fogger'], 140); if (h) this.flee(h.x, h.y, 4); }
    if (seen && !busy) {
      if (c.timid) this.flee(P.x, P.y, 4);
      else if (c.territory) {
        if ((Math.hypot(P.x - this.hx, P.y - this.hy) < c.territory || pd < sight * 0.7) && (act || pd < 120)) this.startHunt(P);
        else if (this.state !== 'investigate') { this.state = 'investigate'; this.tx = P.x; this.ty = P.y; this.st = 3; }
      } else if (c.stalker) this.startHunt(P);
      else {
        const n = this.pack ? this.pack.members.length : 1;
        if ((this.hunger > 0.35 || n >= 3 + Math.floor(Mutants.ad(this.sp).player / 2)) && this.fear < 0.5) this.startHunt(P); else { this.state = 'investigate'; this.tx = P.x; this.ty = P.y; this.st = 3; }
      }
    }
    if (c.hostile && !busy) { for (const m of Mutants.list) if (!m.dead && c.hostile.includes(m.sp) && Math.hypot(m.x - this.hx, m.y - this.hy) < c.territory) { this.startHunt(m); break; } }
    if (c.prey && this.hunger > 0.6 && !busy && this.pack && this.pack.members.length >= 3) { const p = this.nearestHostile(c.prey, 220); if (p) this.startHunt(p); }
    // ведомые копируют вожака
    if (this.pack && this.pack.leader && this.pack.leader !== this && !this.pack.leader.dead && !c.timid) {
      const L = this.pack.leader;
      if (L.state === 'hunt' && L.target && !L.target.dead && !busy) { this.target = L.target; this.state = 'hunt'; this.lost = 0; }
      if (L.state === 'flee' && this.state !== 'flee') this.flee(L.tx, L.ty, 3);
    }
    if (this.hunger > 0.5 && this.state === 'wander' && !c.timid && !c.stalker) {
      let best = null, bd = 300;
      for (const cp of Mutants.corpses) { const d = Math.hypot(cp.x - this.x, cp.y - this.y); if (d < bd && cp.meat > 0) { bd = d; best = cp; } }
      if (best) { this.state = 'eat'; this.tx = best.x; this.ty = best.y; this.eatT = 0; this.corpse = best; }
    }
  }
  startHunt(t) {
    this.state = 'hunt'; this.target = t; this.lost = 0;
    if (t !== P) { if (t.c.timid) t.flee(this.x, this.y, 4); else if (t.state !== 'hunt') { t.target = this; t.state = 'hunt'; } }
    if (this.pack && !this.c.timid) Mutants.rally(this, t);
    if (t === P) Snd.at({ listener: 'click', tin: 'clank', fogger: 'whisper' }[this.sp] || 'yelp', this.x, this.y);
  }
  update(dt) {
    const c = this.c;
    this.cd -= dt; this.st -= dt; this.chargeCd -= dt; this.sndT -= dt; this.reckless = Math.max(0, this.reckless - dt);
    this.fear = Math.max(0, this.fear - dt * 0.08); this.hunger = Math.min(1, this.hunger + dt * 0.004);
    if (c.aquatic) return this.aquatic(dt);
    this.perc -= dt; if (this.perc <= 0) { this.perc = 0.2 + Math.random() * 0.1; this.perceive(); }
    if (this.burn > 0) { this.burn -= dt; this.hp -= 6 * dt; if (this.hp <= 0) return this.die(this.burner); }
    if (this.state === 'sleep') return;
    if (this.sndT <= 0) {
      if (this.sp === 'listener') { this.sndT = 0.6 + Math.random() * 0.5; if (this.state === 'hunt' || this.state === 'investigate') Snd.at('click', this.x, this.y); else this.sndT = 4; }
      else if (this.sp === 'fogger') { this.sndT = 3 + Math.random() * 3; Snd.at('whisper', this.x, this.y); }
      else if (this.sp === 'tin') { this.sndT = 6 + Math.random() * 4; Snd.at('rumble', this.x, this.y); }
      else this.sndT = 8 + Math.random() * 6;
    }
    let speed = 0, tx = this.tx, ty = this.ty;
    switch (this.state) {
      case 'wander': {
        speed = c.walk; const near = Math.hypot(tx - this.x, ty - this.y) < 14;
        if (this.st <= 0 || near) {
          if (this.pack && this.pack.leader !== this && this.pack.leader && !this.pack.leader.dead) {
            const L = this.pack.leader, a = this.idx * 1.9; this.tx = L.x + Math.cos(a) * 34; this.ty = L.y + Math.sin(a) * 34; this.st = 1;
          } else if (near && Math.random() < 0.5) { this.st = 2 + Math.random() * 4; this.tx = this.x; this.ty = this.y; speed = 0; }
          else {
            const rr = c.roam, a = Math.random() * 6.28, d = Math.random() * rr;
            this.tx = U.clamp(this.hx + Math.cos(a) * d, 60, W.S - 60); this.ty = U.clamp(this.hy + Math.sin(a) * d, 60, W.S - 60); this.st = 6 + Math.random() * 6;
          }
        }
        break;
      }
      case 'investigate':
        speed = c.pack && !c.timid ? c.run * 0.65 : c.walk * 1.4;
        if (Math.hypot(tx - this.x, ty - this.y) < 18) {
          speed = 0; this.ang += dt * 1.5;
          if (Meta.lureAt(this)) { this.state = 'eat'; this.corpse = { meat: 1 }; this.eatT = 0; this.tx = this.x; this.ty = this.y; break; }
          if (c.metal) for (let i = W.loot.length - 1; i >= 0; i--) { const l = W.loot[i]; if (l.id === 'bolt' && Math.hypot(l.x - this.x, l.y - this.y) < 40) { W.loot.splice(i, 1); Snd.at('crunch', this.x, this.y); } }
          if (this.st <= 0) this.state = 'wander';
        } else if (this.st < -8) this.state = 'wander';
        break;
      case 'flee':
        speed = c.run; { const a = Math.atan2(this.y - ty, this.x - tx); tx = this.x + Math.cos(a) * 200; ty = this.y + Math.sin(a) * 200; }
        if (this.st <= 0) { this.state = 'wander'; this.fear = 0.3; }
        break;
      case 'eat': {
        const d = Math.hypot(tx - this.x, ty - this.y);
        if (d > 16) speed = c.walk * 1.3;
        else { speed = 0; this.eatT += dt; this.hunger = Math.max(0, this.hunger - dt * 0.1);
          if (this.eatT > 6 || !this.corpse || this.corpse.meat <= 0) { if (this.corpse && this.eatT > 6) this.corpse.meat--; this.state = 'wander'; } }
        break;
      }
      case 'hunt': {
        const t = this.target;
        if (!t || t.dead || (t === P && G.dead)) { this.state = 'wander'; break; }
        tx = t.x; ty = t.y; const d = Math.hypot(tx - this.x, ty - this.y); this.tx = tx; this.ty = ty;
        speed = c.run;
        if (this.pack && !c.timid && d > 70) { const fa = this.idx * 1.3; tx += Math.cos(fa) * 55; ty += Math.sin(fa) * 55; }
        if (this.back > 0) { this.back -= dt; tx = this.x + (this.x - t.x); ty = this.y + (this.y - t.y); speed = c.run * 0.7; }
        else if (c.lunge && d < 90 && d > 25 && this.chargeCd <= 0) { this.chargeCd = 3; this.lunge = 0.35; Snd.at('yelp', this.x, this.y); }
        if (this.lunge > 0) { this.lunge -= dt; speed = c.run * 1.9; }
        if (c.charge) {
          if (d < 240 && this.chargeCd <= 0 && this.reckless <= 0) { this.reckless = 1.6; this.chargeCd = 4.5; Snd.at('clank', this.x, this.y); }
          speed = this.reckless > 0 ? c.charge : c.run * 0.8;
        }
        if (c.stalker && t === P) {                       // замирает под взглядом
          this.watched = d < 420 && U.angDiff(P.ang, Math.atan2(this.y - P.y, this.x - P.x)) < 0.9;
          if (this.watched && d > 34) speed = 0; else speed = c.run;
        }
        if (t === P && inCamp()) { this.state = 'wander'; this.fear = 0.4; break; }
        if (d < this.r + (t.r || 9) + 5) {
          speed *= 0.3;
          if (this.cd <= 0 && !(c.stalker && this.watched && d > 20)) {
            this.cd = c.cd; t.hurt(c.dmg, this); if (c.pack && !c.timid) this.back = 0.7;
            if (t === P && c.bleed && Math.random() < c.bleed) P.bleed = 8;
            if (t === P && c.burn && Math.random() < c.burn) Meta.ignite(P, 5);
            if (t === P && c.fracture && Math.random() < c.fracture) Meta.breakLeg('Удар сломал тебе ногу. Нужна шина.');
            if (t === P && c.infect && P.infect <= 0 && Math.random() < c.infect) { P.infect = 0.01; log('Укус загноился. Нужен антибиотик.', '#c0e060'); }
            Snd.hit();
          }
        }
        if (d > c.sight * 2.2) { this.lost += dt; if (this.lost > 5) { this.state = 'investigate'; this.st = 3; } } else this.lost = 0;
        break;
      }
    }
    if (c.trail && this.state === 'hunt') { this.trailT -= dt; if (this.trailT <= 0) { this.trailT = 0.3; Mutants.embers.push({ x: this.x, y: this.y, t: 3.5 }); if (Mutants.embers.length > 80) Mutants.embers.shift(); } }
    this.move(dt, tx, ty, speed);
  }
  // Топляк: под водой (state sleep) дрейфует по пруду, невидим и неуязвим; проснувшись, гонится по воде и хватает
  aquatic(dt) {
    const c = this.c, p = this.pond, pd = Math.hypot(P.x - this.x, P.y - this.y);
    const inPond = ((P.x - p.x) / (p.rx * 1.2 + 34)) ** 2 + ((P.y - p.y) / (p.ry * 1.2 + 34)) ** 2 < 1;
    if (this.state !== 'hunt') {
      this.state = 'sleep';
      if (this.st <= 0) { const a = Math.random() * 6.28, d = Math.sqrt(Math.random()); this.tx = p.x + Math.cos(a) * p.rx * d * 0.9; this.ty = p.y + Math.sin(a) * p.ry * d * 0.9; this.st = 4 + Math.random() * 5; }
      this.stepTo(this.tx, this.ty, c.walk, dt);
      if (!G.dead && !inCamp() && inPond && pd < c.wakeR) { this.state = 'hunt'; this.lost = 0; Snd.at('whisper', this.x, this.y); }
      return;
    }
    if (G.dead || !inPond) { if ((this.lost += dt) > 3) { this.state = 'sleep'; return; } } else this.lost = 0;
    if (pd < this.r + P.r + 6) {
      if (this.cd <= 0) { this.cd = c.cd; P.hurt(c.dmg, this); if (!(P.grab > 0)) log('Что-то схватило тебя за ногу! Рвись (беги) или стреляй.', '#60c0a0'); P.grab = Math.max(P.grab || 0, c.grab); Snd.hit(); }
    } else this.stepTo(P.x, P.y, c.run, dt);
  }
  stepTo(tx, ty, speed, dt) {
    const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy) || 1, s = Math.min(speed * dt, d), p = this.pond;
    this.x += dx / d * s; this.y += dy / d * s; this.face = dx < 0 ? -1 : 1;
    const kx = p.rx * 1.2, ky = p.ry * 1.2, nx = (this.x - p.x) / kx, ny = (this.y - p.y) / ky, r = Math.hypot(nx, ny);
    if (r > 1) { this.x = p.x + nx / r * kx; this.y = p.y + ny / r * ky; }     // из пруда не выходит
  }
  move(dt, tx, ty, speed) {
    speed *= this.slow;
    let dx = tx - this.x, dy = ty - this.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    if (this.reckless <= 0) {
      for (const a of W.anoms) {   // обходит только те, о которых знает; в погоне (охота) идёт напролом — так мутантов можно заманить в аномалию
        const ax = this.x - a.x, ay = this.y - a.y, ad = Math.hypot(ax, ay), lim = AShape.R(a, ax, ay) + 38 + Mutants.ad(this.sp).anom * 25;
        if (ad < lim && ad > 0 && W.knows(this, a)) { const k = (1 - ad / lim) * 2.5 * (this.state === 'hunt' ? 0.35 : 1); dx += ax / ad * k; dy += ay / ad * k; }
      }
    }
    W.og.query(this.x, this.y, 70, o => {
      const ox = this.x - o.x, oy = this.y - o.y, od = Math.hypot(ox, oy), lim = o.r + this.r + 26;
      if (od < lim && od > 0) { const k = (1 - od / lim) * 2; dx += ox / od * k - oy / od * k * 0.8; dy += oy / od * k + ox / od * k * 0.8; }
    });
    const cx = this.x - W.C.x, cy = this.y - W.C.y, cd = Math.hypot(cx, cy);
    if (cd < W.C.r + 30) { dx += cx / cd * 3; dy += cy / cd * 3; }
    for (const r of W.rest) { const rx = this.x - r.x, ry = this.y - r.y, rd = Math.hypot(rx, ry); if (rd < 110 && rd > 0) { dx += rx / rd * 3; dy += ry / rd * 3; } }
    for (const m of Mutants.list) {
      if (m === this || m.dead) continue;
      const sx = this.x - m.x, sy = this.y - m.y, sd = Math.hypot(sx, sy);
      if (sd < 18 && sd > 0) { dx += sx / sd * 0.6; dy += sy / sd * 0.6; }
    }
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    if (speed > 0) { const na = Math.atan2(dy, dx); let da = na - this.ang; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283; this.ang += da * Math.min(1, dt * 8); this.face = Math.cos(this.ang) < 0 ? -1 : 1; }
    this.x += dx * speed * dt; this.y += dy * speed * dt;
    W.og.query(this.x, this.y, this.r + 40, o => {
      const ox = this.x - o.x, oy = this.y - o.y, od = Math.hypot(ox, oy), m = o.r + this.r;
      if (od < m && od > 0) { this.x = o.x + ox / od * m; this.y = o.y + oy / od * m; }
    });
    this.x = U.clamp(this.x, 20, W.S - 20); this.y = U.clamp(this.y, 20, W.S - 20);
  }
}

const Mutants = {
  list: [], corpses: [], packs: [], adapt: {}, embers: [],
  ad(sp) { return this.adapt[sp] || (this.adapt[sp] = { anom: 0, player: 0 }); },
  learn(sp, k) { const a = this.ad(sp); a[k] = Math.min(k === 'anom' ? 3 : 5, a[k] + 0.5); },
  spawn() {
    this.list = []; this.corpses = []; this.packs = []; this.embers = [];
    for (const sp in CFG.mut) for (let i = 0; i < CFG.mut[sp].count; i++) this.spawnGroup(sp, false);
    // хозяева Пепельного тракта: три углеглота спят вокруг каждой линии остовов
    for (const r of W.roads || []) for (let i = 0; i < 3; i++) { const a = Math.random() * 6.28, d = 40 + Math.random() * 120, m = new Mutant('cinder', r.x + Math.cos(a) * d, r.y + Math.sin(a) * d, null); m.hx = r.x; m.hy = r.y; this.list.push(m); }
  },
  farSpot(minD, c) {
    for (let i = 0; i < 40; i++) {
      const p = W.spot(380), d = W.danger(p.x, p.y);
      if (d >= c.dmin && d <= c.dmax && (i > 25 || !c.biomes || c.biomes.includes(W.biomeAt(p.x, p.y))) && (!minD || Math.hypot(p.x - P.x, p.y - P.y) > minD)) return p;
    }
    return W.spot(500);
  },
  // Топляк живёт в конкретном пруду: берём пруд подходящего биома, не рядом с игроком (при пополнении)
  spawnAquatic(sp, far) {
    const c = CFG.mut[sp]; let ponds = W.water.filter(w => c.biomes.includes(W.biomeAt(w.x, w.y)) && (!far || Math.hypot(w.x - P.x, w.y - P.y) > 700));
    if (!ponds.length) ponds = W.water.filter(w => !far || Math.hypot(w.x - P.x, w.y - P.y) > 700); if (!ponds.length) return;
    const w = ponds[Math.floor(Math.random() * ponds.length)], m = new Mutant(sp, w.x + (Math.random() - 0.5) * w.rx, w.y + (Math.random() - 0.5) * w.ry, null);
    m.pond = w; m.hx = w.x; m.hy = w.y; this.list.push(m);
  },
  hidden(m) { return !!(m.c && m.c.aquatic && m.state === 'sleep'); },   // Топляк под водой — не цель
  spawnGroup(sp, far) {
    if (CFG.mut[sp].aquatic) return this.spawnAquatic(sp, far);
    const c = CFG.mut[sp], p = this.farSpot(far ? 700 : 0, c);
    if (!c.pack) { const m = new Mutant(sp, p.x, p.y, null); m.hx = p.x; m.hy = p.y; this.list.push(m); return; }
    const n = c.pack[0] + Math.floor(Math.random() * (c.pack[1] - c.pack[0] + 1)), pack = { members: [], leader: null };
    this.packs.push(pack);
    for (let i = 0; i < n; i++) {
      const m = new Mutant(sp, p.x + (Math.random() - 0.5) * 50, p.y + (Math.random() - 0.5) * 50, pack);
      m.hx = p.x; m.hy = p.y; m.idx = i; pack.members.push(m); this.list.push(m);
    }
    pack.leader = pack.members[0];
  },
  rally(m, t) { for (const o of m.pack.members) if (!o.dead && o !== m && o.state !== 'flee' && o.fear < 0.6) { o.target = t; o.state = 'hunt'; o.lost = 0; } },
  onDeath(m) {
    if (!m.pack) return;
    const alive = m.pack.members.filter(o => !o.dead);
    if (m.pack.leader === m) {
      m.pack.leader = alive[0] || null;
      for (const o of alive) o.fear = 0.6;
      if (alive[0]) alive[0].flee(m.x, m.y, 4);
    }
    if (alive.length === 1) alive[0].fear = 0.8;
  },
  // kind: 'metal' — звон металла (тянет Жестянок)
  hear(x, y, r, kind) {
    if (Math.hypot(x - W.C.x, y - W.C.y) < W.C.r) return;
    const fromP = Math.hypot(x - P.x, y - P.y) < 2;
    r *= 1 - 0.4 * G.rain;                                // дождь глушит звуки
    for (const m of this.list) {
      if (m.dead || m.state === 'hunt' || m.state === 'flee') continue;
      const d = Math.hypot(m.x - x, m.y - y);
      if (kind === 'lure') { if (!m.c.timid && m.state !== 'sleep' && d < r) { m.state = 'investigate'; m.tx = x; m.ty = y; m.st = 8; } continue; }
      if (kind === 'metal' && m.c.metal && d < 280 && m.state !== 'sleep') { m.state = 'investigate'; m.tx = x; m.ty = y; m.st = 4; continue; }
      const rr = r * m.c.hear;
      if (m.state === 'sleep') { if (d < rr * 0.8 && m.c.active !== 'weather') m.wake(); continue; }
      if (d < rr) {
        if (m.c.timid) m.flee(x, y, 3);
        else if (fromP && !m.c.stalker && !m.c.territory && d < Math.min(rr * 0.5, 260)) m.startHunt(P);
        else { m.state = 'investigate'; m.tx = x; m.ty = y; m.st = 3; }
      }
    }
  },
  update(dt) {
    for (const m of this.list) if (!m.dead && Math.abs(m.x - P.x) < 1500 && Math.abs(m.y - P.y) < 1500) m.update(dt);
    this.list = this.list.filter(m => !m.dead);
    for (const p of this.packs) p.members = p.members.filter(m => !m.dead);
    this.packs = this.packs.filter(p => p.members.length);
    for (const c of this.corpses) c.age += dt;
    this.corpses = this.corpses.filter(c => c.age < 600);
    for (const e of this.embers) e.t -= dt;
    this.embers = this.embers.filter(e => e.t > 0);
    if (!G.dead && !inCamp()) for (const e of this.embers) if (Math.hypot(e.x - P.x, e.y - P.y) < 12 && Math.random() < dt * 3) Meta.ignite(P, 4);
  },
  migrate() {
    for (const p of this.packs) { const s = this.farSpot(900, CFG.mut[p.members[0].sp]); for (const m of p.members) { m.hx = s.x; m.hy = s.y; if (Math.hypot(m.x - P.x, m.y - P.y) > 1500) { m.x = s.x + (Math.random() - 0.5) * 50; m.y = s.y + (Math.random() - 0.5) * 50; } } }
    for (const m of this.list) if (m.sp === 'fogger') { const s = this.farSpot(0, m.c); m.hx = s.x; m.hy = s.y; }
    this.refill();
  },
  refill() {
    for (const sp in CFG.mut) {
      const c = CFG.mut[sp], avg = c.pack ? (c.pack[0] + c.pack[1]) / 2 : 1, want = c.count * avg;
      let have = this.list.filter(m => m.sp === sp).length;
      while (have < want * 0.7) { this.spawnGroup(sp, true); have += avg; }
    }
  },
};

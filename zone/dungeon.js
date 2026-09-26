'use strict';
// Подземелья: под каждым бункером — лабиринт (по сиду мира), шкафчики в тупиках, сейф в самой дальней точке,
// подземники, очаги радиации и тьма. Отдельная сцена G.scene === 'dungeon' со своими координатами (тайлы CFG.dungeon.tile),
// поэтому зональные списки (Mutants, Stalkers, W.og) здесь не участвуют. Загружается после rooms.js и вешается на Camp/Meta/Mutants.
const Dungeon = {
  cur: null, lvl: null, enemies: [], shots: [], slowT: 0, lights: [], og: new Grid(200), levels: {}, fieldT: 0, field: null, calm: 0,
  get T() { return CFG.dungeon.tile; },

  // ---------- генерация (чистая, детерминированная по seed) ----------
  build(seed, danger) {
    const cfg = CFG.dungeon, C = cfg.cols, Rr = cfg.rows, w = 2 * C + 1, h = 2 * Rr + 1, R = U.rng(seed >>> 0), at = (x, y) => y * w + x;
    const t = new Uint8Array(w * h).fill(1);                              // 1 — стена, 0 — пол
    const seen = new Uint8Array(C * Rr), st = [[0, Rr - 1]]; seen[(Rr - 1) * C] = 1; t[at(1, 2 * (Rr - 1) + 1)] = 0;
    while (st.length) {                                                   // лабиринт «поиском в глубину»
      const [x, y] = st[st.length - 1];
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy, dx, dy]).filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < C && ny < Rr && !seen[ny * C + nx]);
      if (!nb.length) { st.pop(); continue; }
      const [nx, ny, dx, dy] = nb[Math.floor(R() * nb.length)]; seen[ny * C + nx] = 1;
      t[at(2 * x + 1 + dx, 2 * y + 1 + dy)] = 0; t[at(2 * nx + 1, 2 * ny + 1)] = 0; st.push([nx, ny]);
    }
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {     // петли: часть стен между клетками убираем
      if (!t[at(x, y)] || (x % 2 === y % 2)) continue;
      const a = x % 2 ? [x, y - 1, x, y + 1] : [x - 1, y, x + 1, y];
      if (!t[at(a[0], a[1])] && !t[at(a[2], a[3])] && R() < cfg.loops) t[at(x, y)] = 0;
    }
    const start = { tx: 1, ty: 2 * (Rr - 1) + 1 };
    for (let k = 0; k < cfg.rooms; k++) {                                 // залы 3×3
      const cx = 2 * (1 + Math.floor(R() * (C - 2))) + 1, cy = 2 * Math.floor(R() * Rr) + 1;
      if (Math.abs(cx - start.tx) < 5 && Math.abs(cy - start.ty) < 5) continue;
      for (let yy = cy - 1; yy <= cy + 1; yy++) for (let xx = cx - 1; xx <= cx + 1; xx++) if (xx > 0 && yy > 0 && xx < w - 1 && yy < h - 1) t[at(xx, yy)] = 0;
    }
    const dist = new Uint16Array(w * h).fill(65535), q = [at(start.tx, start.ty)]; dist[q[0]] = 0;
    for (let i = 0; i < q.length; i++) {                                  // расстояния от входа
      const p = q[i], px = p % w, py = (p - px) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = at(px + dx, py + dy); if (!t[n] && dist[n] === 65535) { dist[n] = dist[p] + 1; q.push(n); } }
    }
    const cells = []; for (let cy = 0; cy < Rr; cy++) for (let cx = 0; cx < C; cx++) { const tx = 2 * cx + 1, ty = 2 * cy + 1; cells.push({ tx, ty, d: dist[at(tx, ty)] }); }
    const open = (tx, ty) => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !t[at(tx + dx, ty + dy)]).length;
    const far = cells.slice().sort((a, b) => b.d - a.d), vault = far[0];
    const used = new Set([at(start.tx, start.ty), at(vault.tx, vault.ty)]);
    const dead = far.filter(c => !used.has(at(c.tx, c.ty)) && open(c.tx, c.ty) === 1), lockers = [];
    for (const c of dead.concat(far)) { if (lockers.length >= cfg.lockers) break; if (used.has(at(c.tx, c.ty))) continue; used.add(at(c.tx, c.ty)); lockers.push({ tx: c.tx, ty: c.ty }); }
    const rad = new Set(), spots = far.filter(c => !used.has(at(c.tx, c.ty)) && c.d > 6);
    for (let k = 0; k < cfg.radSpots && spots.length; k++) {              // очаги радиации: клетка и её открытые соседи
      const c = spots.splice(Math.floor(R() * spots.length), 1)[0]; used.add(at(c.tx, c.ty)); rad.add(at(c.tx, c.ty));
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!t[at(c.tx + dx, c.ty + dy)]) rad.add(at(c.tx + dx, c.ty + dy));
    }
    const pool = cells.filter(c => c.d >= 7 && !rad.has(at(c.tx, c.ty)) && at(c.tx, c.ty) !== at(vault.tx, vault.ty)), spawns = [], n = cfg.base + danger;
    const kinds = Object.keys(cfg.enemies), wts = kinds.map(k => cfg.enemies[k].w[Math.min(3, danger - 1)]);
    for (let i = 0; i < n && pool.length; i++) { const c = pool[Math.floor(R() * pool.length)]; spawns.push({ tx: c.tx, ty: c.ty, type: U.wpick(kinds, wts, R) }); }
    if (danger >= 3) {                                                    // с сектора 3 сейф охраняет Панцирник: он стоит на подходе к нему
      const near = cells.filter(c => Math.abs(c.tx - vault.tx) + Math.abs(c.ty - vault.ty) === 2 && !t[at((c.tx + vault.tx) / 2, (c.ty + vault.ty) / 2)] && c.d < vault.d).sort((a, b) => a.d - b.d)[0];
      if (near) spawns.push({ tx: near.tx, ty: near.ty, type: 'carapace', guard: true });
    }
    return { w, h, t, start, vault: { tx: vault.tx, ty: vault.ty }, lockers, rad, spawns, dist, seed };
  },
  level(b) {
    if (!this.levels[b.i]) this.levels[b.i] = this.build(Math.imul(W.seed | 0, 2654435761) ^ Math.imul(b.i + 1, 0x9E3779B1), W.danger(b.x, b.y));
    return this.levels[b.i];
  },
  // Цель цепочки «Нижний ярус» в этом бункере? (сейф помечается на полу знаком)
  storyTarget(b) { b = b || this.cur; return !!(b && P.quests.some(q => q.type === 'deep' && q.stage < 3 && q.bunks[q.stage] === b.i) && !b.opened.includes(99)); },
  title() { return 'Бункер ' + (this.cur ? this.cur.i + 1 : '') + ' · сектор ' + (this.cur ? W.danger(this.cur.x, this.cur.y) : 1); },

  // ---------- геометрия ----------
  wall(tx, ty) { const L = this.lvl; return tx < 0 || ty < 0 || tx >= L.w || ty >= L.h || !!L.t[ty * L.w + tx]; },
  center(tx, ty) { return { x: (tx + 0.5) * this.T, y: (ty + 0.5) * this.T }; },
  los(x1, y1, x2, y2) {
    const d = Math.hypot(x2 - x1, y2 - y1), n = Math.ceil(d / (this.T / 4));
    for (let i = 1; i < n; i++) { const k = i / n; if (this.wall(Math.floor((x1 + (x2 - x1) * k) / this.T), Math.floor((y1 + (y2 - y1) * k) / this.T))) return false; }
    return true;
  },
  rayLen(x, y, dx, dy, max) { for (let d = 4; d < max; d += 4) if (this.wall(Math.floor((x + dx * d) / this.T), Math.floor((y + dy * d) / this.T))) return d; return max; },
  // выталкивает круг радиуса r из соседних стен (по осям порознь, чтобы скользить вдоль стены)
  push(o, r) {
    const T = this.T, tx = Math.floor(o.x / T), ty = Math.floor(o.y / T);
    for (let it = 0; it < 2; it++) for (let yy = ty - 1; yy <= ty + 1; yy++) for (let xx = tx - 1; xx <= tx + 1; xx++) {
      if (!this.wall(xx, yy)) continue;
      const nx = Math.max(xx * T, Math.min(o.x, (xx + 1) * T)), ny = Math.max(yy * T, Math.min(o.y, (yy + 1) * T)), dx = o.x - nx, dy = o.y - ny, d = Math.hypot(dx, dy);
      if (d < r) { if (d > 0.001) { o.x = nx + dx / d * r; o.y = ny + dy / d * r; } else { o.x = (xx + 0.5) * T; o.y = (yy + 1.5) * T; } }
    }
  },
  clampP() { this.push(P, P.r); },
  computeField() {
    const L = this.lvl, f = new Uint16Array(L.w * L.h).fill(65535), px = Math.floor(P.x / this.T), py = Math.floor(P.y / this.T), q = [py * L.w + px];
    if (this.wall(px, py)) { this.field = f; return; }
    f[q[0]] = 0;
    for (let i = 0; i < q.length; i++) {
      const p = q[i], x = p % L.w, y = (p - x) / L.w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = (y + dy) * L.w + x + dx; if (!L.t[n] && f[n] === 65535) { f[n] = f[p] + 1; q.push(n); } }
    }
    this.field = f;
  },

  // ---------- вход и выход ----------
  reset() { this.cur = null; this.lvl = null; this.enemies = []; this.shots = []; this.slowT = 0; this.lights = []; this.field = null; },
  nearZone(c) { for (const b of W.bunkers) c(b, Math.hypot(b.x - P.x, b.y - P.y), 50, 'Спуститься в бункер', () => this.enter(b)); },
  enter(b) {
    this.cur = b; this.lvl = this.level(b); const L = this.lvl, s = this.center(L.start.tx, L.start.ty);
    G.scene = 'dungeon'; P.x = s.x + 8; P.y = s.y; P.inAnom = null; P.slow = 1; closePanel(); P.burn = 0;
    const d = W.danger(b.x, b.y); this.shots = []; this.slowT = 0;
    this.enemies = b.cleared ? [] : L.spawns.map(sp => { const p = this.center(sp.tx, sp.ty); return new DEnemy(p.x, p.y, CFG.dungeon.enemies[sp.type], 1 + 0.15 * (d - 1), sp.type); });
    this.lights = [{ x: s.x, y: s.y, r: 190, a: 0.85 }];   // светло только у входа: остальное лабиринт скрывает, пока не подойдёшь
    this.fieldT = 0; this.computeField(); this.calm = 0; Snd.tick();
    log('Ты спустился в бункер. Здесь темно и тихо. Выход — там, где ты вошёл.', '#a8c890');
    if (this.storyTarget()) log('На стене у входа — старая метка экспедиции Штейна. Их сейф где-то в глубине.', '#c8b0e8');
  },
  leave() {
    const b = this.cur; G.scene = 'zone'; P.x = b.x; P.y = b.y + 42; this.reset(); closePanel(); Snd.tick();
    log('Ты выбрался наверх.', '#a8c890');
  },
  // ---------- добыча ----------
  rng(b, i) { return U.rng(((Math.imul(this.lvl.seed | 0, 31) ^ Math.imul(i + 1, 104729) ^ Math.imul((b.gen || 0) + 1, 7919)) >>> 0)); },
  lockerLoot(b, i) {
    const R = this.rng(b, i), d = W.danger(b.x, b.y), L = [];
    L.push([['scrap', 'circuit', 'battery'][Math.floor(R() * 3)], 2 + Math.floor(R() * 3)]);
    L.push(['ammo', 3 + Math.floor(R() * 6)]);
    if (R() < 0.45) L.push(['medkit', 1]); if (R() < 0.3) L.push(['antirad', 1]); if (R() < 0.2) L.push(['antibiotic', 1]); if (R() < 0.35) L.push(['canister', 1]);
    L.push(['money', Math.round((20 + R() * 40) * (0.8 + d * 0.2))]);
    return L;
  },
  vaultLoot(b) {
    const R = this.rng(b, 99), d = W.danger(b.x, b.y), arts = Meta.wildArts();
    const L = [['money', Math.round((150 + R() * 150) * (0.8 + d * 0.2))], ['medkit', 1 + Math.floor(R() * 2)], ['ammo', 8 + Math.floor(R() * 8)], ['circuit', 2 + Math.floor(R() * 3)], ['art', arts[Math.floor(R() * arts.length)]]];
    if (R() < 0.6) L.push(['reagent', 1]);
    return L;
  },
  give(loot) {
    const got = [];
    for (const [id, n] of loot) {
      if (id === 'money') { P.money += n; got.push(n + ' ₽'); }
      else if (id === 'art') { invAdd('art', 1, n); got.push(P.known[n] ? CFG.arts[n].name : 'неопознанный артефакт'); }
      else { invAdd(id, n); got.push(CFG.items[id].name + ' ×' + n); }
    }
    return got.join(', ');
  },
  openLocker(i) {
    const b = this.cur; if (b.opened.includes(i)) return;
    b.opened.push(i); log('Найдено: ' + this.give(this.lockerLoot(b, i)), '#c8c090'); Snd.pick(); this.hear(P.x, P.y, 160);
  },
  openVault() {
    const b = this.cur; if (b.opened.includes(99)) return;
    b.opened.push(99); log('Сейф вскрыт: ' + this.give(this.vaultLoot(b)), '#e8c060'); Snd.pick(); Meta.onVault(b); addXp(30); Meta.gainLore(); this.hear(P.x, P.y, 260);
  },
  // ---------- ход ----------
  hear(x, y, r) { for (const e of this.enemies) if (!e.dead && Math.hypot(e.x - x, e.y - y) < r * 1.6) e.alert(); },
  near(c) {
    const b = this.cur, L = this.lvl, T = this.T, s = this.center(L.start.tx, L.start.ty);
    c('exit', Math.hypot(s.x - P.x, s.y - P.y), 40, 'Подняться наверх', () => this.leave());
    L.lockers.forEach((k, i) => { const p = this.center(k.tx, k.ty); if (!b.opened.includes(i)) c(k, Math.hypot(p.x - P.x, p.y - P.y), 40, 'Вскрыть шкафчик', () => this.openLocker(i)); });
    const v = this.center(L.vault.tx, L.vault.ty); if (!b.opened.includes(99)) c('vault', Math.hypot(v.x - P.x, v.y - P.y), 44, 'Вскрыть сейф', () => this.openVault());
  },
  tick(dt) {
    const b = this.cur, L = this.lvl; if (!b) return;
    P.food = Math.max(0, P.food - CFG.player.foodRate * dt * (P.running ? 1.5 : 1)); if (P.food <= 0) P.hp -= 0.5 * dt;
    if (P.bleed > 0) { P.bleed -= dt; P.hp -= 1.5 * dt; }
    else if (P.food > 20 && P.rad < 40) P.hp = Math.min(100, P.hp + (0.4 + fx('hpRegen')) * dt);
    else if (fx('hpRegen')) P.hp = Math.min(100, P.hp + fx('hpRegen') * 0.5 * dt);
    let rad = L.rad.has(Math.floor(P.y / this.T) * L.w + Math.floor(P.x / this.T)) ? CFG.dungeon.radRate : 0;
    for (const s of P.inv) if (s.art) rad += CFG.arts[s.art].rad * 0.5;
    for (const a of P.equip) if (a) rad += CFG.arts[a].rad * 0.5;
    rad *= 1 - radRes(); P.geigerRate = rad;
    if (rad > 0) P.rad = Math.min(100, P.rad + rad * dt); else P.rad = Math.max(0, P.rad - CFG.player.radDecay * 0.1 * dt);
    if (P.rad > 60) P.hp -= (P.rad - 60) / 40 * dt; if (P.rad >= 100) P.hp -= 3 * dt;
    if (P.hp <= 0) return die();
    P.stress = U.clamp(P.stress + (0.3 * (1 - 0.05 * P.sk.resist) - 0.08) * dt, 0, 100);
    if (Math.random() < P.geigerRate * dt * 8) Snd.geiger();
    Meta.update(dt);
    this.fieldT -= dt; if (this.fieldT <= 0) { this.fieldT = 0.3; this.computeField(); }
    for (const e of this.enemies) e.update(dt);
    this.enemies = this.enemies.filter(e => !e.dead);
    for (let i = this.shots.length - 1; i >= 0; i--) {                    // сгустки кислоты
      const q = this.shots[i]; q.x += q.vx * dt; q.y += q.vy * dt; q.t -= dt;
      if (q.t <= 0 || this.wall(Math.floor(q.x / this.T), Math.floor(q.y / this.T))) { this.shots.splice(i, 1); continue; }
      if (!G.dead && Math.hypot(q.x - P.x, q.y - P.y) < P.r + 5) { this.shots.splice(i, 1); P.hurt(q.dmg, 'acid'); if (this.slowT <= 0) log('Кислота липнет к ногам — идёшь медленнее.', '#9ad060'); this.slowT = 2; Snd.hit(); }
    }
    this.slowT = Math.max(0, this.slowT - dt); P.slow = this.slowT > 0 ? 0.6 : 1;
    if (!this.enemies.length && !b.cleared && L.spawns.length) { b.cleared = true; log('Бункер зачищен. До выброса сюда никто не вернётся.', '#a8c890'); }
    G.near = G.ui ? null : (() => { let best = null, bd = 9999; this.near((o, d, lim, label, fn) => { if (d < lim && d < bd) { bd = d; best = { label, fn, o }; } }); return best; })();
    G.beat -= dt; if (G.beat <= 0 && (P.hp < 35 || P.stress > 75)) { G.beat = 0.9; Snd.beat(); }
    updateEmission(dt); Snd.siren(G.emi.s === 'warn'); Snd.setHum(45, 0.02);
    if (Math.floor(G.t) % 30 === 0 && Math.floor(G.t - dt) % 30 !== 0) save(true);
    for (let i = tracers.length - 1; i >= 0; i--) if ((tracers[i].t -= dt) <= 0) tracers.splice(i, 1);
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.x += p.vx * dt; p.y += p.vy * dt; if ((p.life -= dt) <= 0) parts.splice(i, 1); }
  },

  // ---------- отрисовка ----------
  initSprites() {
    if (this.sprReady) return; this.sprReady = true;
    Spr.make('spitter', ['..gggg..', '.gGGGGg.', 'gGGyyGGg', 'gGGyyGGg', '.gGGGGg.', '..g..g..', '..g..g..'], { g: '#5a7a3a', G: '#7aa050', y: '#c8e060' });
    Spr.make('shade', ['...kk...', '..kKKk..', '.kKeeKk.', 'kKKKKKKk', '.kKKKKk.', '..k..k..', '.k....k.'], { k: '#0e1014', K: '#20242c', e: '#a0d0ff' });
    Spr.make('carapace', ['..kkkkkk..', '.kBBBBBBk.', 'kBbBBBBbBk', 'kBBbBBbBBk', 'kBBBBBBBBk', '.kBBBBBBk.', '.kk.kk.kk.', '.kk.kk.kk.'], { k: '#1a1a1e', B: '#6a707a', b: '#8a909a' });
    Spr.make('dweller', ['....pp....', '..ppPPpp..', '.pppPPppp.', 'ppeppppepp', '.pppppppp.', 'p.p.pp.p.p', 'p..p..p..p'], { p: '#7a807a', P: '#b0b6b0', e: '#d03030' });
  },
  draw() {
    this.initSprites(); const L = this.lvl, T = this.T, mw = L.w * T, mh = L.h * T; ctx.imageSmoothingEnabled = false;
    cam.x = (mw <= VW ? (mw - VW) / 2 : U.clamp(P.x - VW / 2, 0, mw - VW)) + (Math.random() - 0.5) * G.shake * 20;
    cam.y = (mh <= VH ? (mh - VH) / 2 : U.clamp(P.y - VH / 2, 0, mh - VH)) + (Math.random() - 0.5) * G.shake * 20;
    ctx.fillStyle = '#050607'; ctx.fillRect(0, 0, VW, VH); ctx.save(); ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
    const x0 = Math.max(0, Math.floor(cam.x / T)), x1 = Math.min(L.w - 1, Math.floor((cam.x + VW) / T)), y0 = Math.max(0, Math.floor(cam.y / T)), y1 = Math.min(L.h - 1, Math.floor((cam.y + VH) / T));
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const x = tx * T, y = ty * T;
      if (L.t[ty * L.w + tx]) {
        ctx.fillStyle = '#2b2e35'; ctx.fillRect(x, y, T, T);
        if (!this.wall(tx, ty + 1)) { ctx.fillStyle = '#4a4f59'; ctx.fillRect(x, y + T - 8, T, 8); }
        if (!this.wall(tx, ty - 1)) { ctx.fillStyle = '#3a3f48'; ctx.fillRect(x, y, T, 4); }
      } else {
        ctx.fillStyle = (tx + ty) & 1 ? '#1c1f23' : '#20242a'; ctx.fillRect(x, y, T, T);
        if (L.rad.has(ty * L.w + tx)) { ctx.fillStyle = `rgba(120,200,60,${0.16 + 0.06 * Math.sin(G.t * 3 + tx)})`; ctx.fillRect(x, y, T, T); }
      }
    }
    const b = this.cur, st = this.center(L.start.tx, L.start.ty);
    ctx.fillStyle = '#5a4a2a'; ctx.fillRect(st.x - 14, st.y - 18, 4, 36); ctx.fillRect(st.x + 10, st.y - 18, 4, 36); for (let i = 0; i < 5; i++) ctx.fillRect(st.x - 12, st.y - 14 + i * 8, 24, 3);
    ctx.font = 'bold 10px Consolas'; ctx.textAlign = 'center'; ctx.fillStyle = '#e0a020'; ctx.fillText('ВЫХОД', st.x, st.y - 24);
    L.lockers.forEach((k, i) => { const p = this.center(k.tx, k.ty), op = b.opened.includes(i); Spr.draw(ctx, op ? 'crate_o' : 'crate', p.x, p.y, false, null, 1.8); if (!op && Math.hypot(p.x - P.x, p.y - P.y) < 160) Spr.draw(ctx, 'star', p.x, p.y - 18, false, 0.4 + 0.5 * Math.abs(Math.sin(G.t * 4 + i))); });
    const v = this.center(L.vault.tx, L.vault.ty), vo = b.opened.includes(99);
    ctx.fillStyle = '#20242a'; ctx.fillRect(v.x - 16, v.y - 16, 32, 32); ctx.fillStyle = vo ? '#3a3f47' : '#5a616c'; ctx.fillRect(v.x - 14, v.y - 14, 28, 28);
    if (this.storyTarget(b)) { ctx.strokeStyle = `rgba(200,176,232,${0.5 + 0.3 * Math.sin(G.t * 4)})`; ctx.lineWidth = 2; ctx.strokeRect(v.x - 20, v.y - 20, 40, 40); }
    ctx.fillStyle = vo ? '#20242a' : '#c8a030'; ctx.beginPath(); ctx.arc(v.x, v.y, 6, 0, 6.28); ctx.fill(); if (!vo) { ctx.fillStyle = '#3a2a10'; ctx.fillRect(v.x - 1, v.y - 5, 2, 5); }
    const dl = this.enemies.map(e => ({ y: e.y + 6, e }));
    if (!G.dead) dl.push({ y: P.y + 8, p: true });
    dl.sort((a, c) => a.y - c.y);
    for (const o of dl) {
      if (o.e) { const e = o.e, al = e.alpha(); if (al > 0.02) { shadow(e.x, e.y + 6, e.r); Spr.draw(ctx, e.c.spr, e.x, e.y - 2, e.face < 0, al, e.c.kind === 'charge' ? 1.3 : 1); }
        if (e.burn > 0) px(e.x, e.y - 12 - (G.t * 30) % 6, '#ff8a30', 4);
        if (e.mode === 'wind') { const a = e.axis(); ctx.globalAlpha = 0.25 + 0.2 * Math.sin(G.t * 20); ctx.fillStyle = '#e03030'; ctx.fillRect(Math.min(e.x, e.x + Math.cos(a) * 300), Math.min(e.y, e.y + Math.sin(a) * 300) - 8 * Math.abs(Math.cos(a)), Math.abs(Math.cos(a)) * 300 + 16 * Math.abs(Math.sin(a)), Math.abs(Math.sin(a)) * 300 + 16 * Math.abs(Math.cos(a))); ctx.globalAlpha = 1; }
        if (e.wind > 0) { ctx.fillStyle = '#b8f060'; ctx.beginPath(); ctx.arc(e.x, e.y - 14, 2 + 4 * (1 - e.wind / e.c.wind), 0, 6.28); ctx.fill(); }
        ctx.font = 'bold 13px Consolas'; ctx.textAlign = 'center';
        if (e.mode === 'stun') { ctx.fillStyle = '#f0d060'; ctx.fillText('✦', e.x, e.y - 18); }
        else if (e.state === 'hunt' && al > 0.3) { ctx.fillStyle = '#e05050'; ctx.fillText('!', e.x, e.y - 16); }
        if (e.hp < e.max && al > 0.3) { ctx.fillStyle = '#000'; ctx.fillRect(e.x - 10, e.y - 22, 20, 3); ctx.fillStyle = '#a33'; ctx.fillRect(e.x - 10, e.y - 22, 20 * e.hp / e.max, 3); } }
      else { const mv = keys.mx || keys.my, bob = mv ? (Math.floor(G.t * 10) % 2 ? -1 : 0) : 0; shadow(P.x, P.y + 10, 8); Spr.draw(ctx, P.sneak ? 'player_s' : 'player', P.x, P.y + bob - 2, Math.cos(P.ang) < 0); if (P.sel === 0) Gun.draw(ctx, P.x, P.y + 2, P.ang, P.weapon, P.recoil || 0); }
    }
    for (const q of this.shots) { ctx.fillStyle = '#9ad040'; ctx.beginPath(); ctx.arc(q.x, q.y, 4, 0, 6.28); ctx.fill(); ctx.fillStyle = '#d8f890'; ctx.fillRect(q.x - 1, q.y - 1, 2, 2); }
    for (const t of tracers) { ctx.strokeStyle = 'rgba(255,230,150,.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke(); }
    for (const p of parts) { ctx.globalAlpha = Math.max(0, p.life * 2); px(p.x, p.y, p.col); } ctx.globalAlpha = 1;
    ctx.restore(); drawOverlays();
  },
};

// Враги подземелья. Общий каркас: восприятие → погоня по полю расстояний → поведение вида (c.kind):
//  crawl  — кусает вплотную;  spit — держит дистанцию и плюёт;  shade — слепая, идёт на шум, видна вблизи;
//  charge — замах, разбег по прямой, оглушение о стену.
class DEnemy {
  constructor(x, y, c, k, type) {
    const hp = Math.round(c.hp * k);
    Object.assign(this, { x, y, c, type: type || 'crawler', r: c.r, hp, max: hp, state: 'idle', cd: 1, lost: 0, dead: false, face: 1, burn: 0, burner: null, goal: null, prev: null, slow: 1,
      mode: 'chase', mt: 0, hit: false, stun: 0, wind: 0, flash: 0, snd: 0, dir: 0 });
  }
  alert() {
    if (this.state === 'hunt') return;
    this.state = 'hunt'; this.lost = 0; Snd.at(this.c.kind === 'shade' ? 'whisper' : this.c.kind === 'charge' ? 'clank' : 'yelp', this.x, this.y);
  }
  // Видимость для отрисовки: тень различима только вблизи, горящая или только что раненая — всегда
  alpha() {
    if (this.c.kind !== 'shade' || this.burn > 0 || this.flash > 0) return 1;
    return U.clamp(1 - (Math.hypot(P.x - this.x, P.y - this.y) - (70 + (hasItem('headlamp') ? 60 : 0))) / 60, 0, 1);   // фонарь расширяет круг, где тень видна
  }
  hurt(d, src, pierce) {
    if (this.dead) return;
    this.hp -= d * (pierce ? 1 : 1 - (this.c.armor || 0)) * (this.mode === 'stun' ? 1.5 : 1); this.flash = 0.6;
    if (this.hp <= 0) return this.die(src);
    if (src === P) this.alert();
  }
  die(src) {
    this.dead = true; Snd.at('die', this.x, this.y);
    if (src !== P) return;
    addXp(this.c.xp); P.kills++; Meta.onKill('dweller');
    const dr = this.c.drop; if (dr && Math.random() < dr.p) { invAdd(dr.id, 1); log('Трофей: ' + CFG.items[dr.id].name, '#c8c090'); }
  }
  step(tx, ty, speed, dt) {
    const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy); if (d < 0.5) return true;
    const s = Math.min(speed * dt, d); this.x += dx / d * s; this.y += dy / d * s; this.face = dx < 0 ? -1 : 1; return d - s < 1;
  }
  // Направление разбега: по оси коридора в сторону игрока
  axis() { const dx = P.x - this.x, dy = P.y - this.y; return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 0 : Math.PI) : (dy > 0 ? Math.PI / 2 : -Math.PI / 2); }
  update(dt) {
    const D = Dungeon, c = this.c, kind = c.kind;
    if (this.burn > 0) { this.burn -= dt; this.hp -= 6 * dt; if (this.hp <= 0) return this.die(this.burner); }
    this.cd -= dt; this.flash = Math.max(0, this.flash - dt);
    const pd = Math.hypot(P.x - this.x, P.y - this.y), los = pd < 420 && D.los(this.x, this.y, P.x, P.y);
    if (!G.dead) {
      if (kind === 'shade') { const mv = keys.mx || keys.my, r = P.running ? c.hear.run : mv ? (P.sneak ? c.hear.sneak : c.hear.walk) : c.hear.idle; if (pd < r) this.alert(); }
      else if (los && pd < c.sight * (P.sneak ? 0.5 : 1)) this.alert();
    }
    if (this.state === 'hunt') { if (kind === 'shade' ? pd < 220 : los) this.lost = 0; else if ((this.lost += dt) > (kind === 'shade' ? 5 : 7)) { this.state = 'idle'; this.goal = null; this.mode = 'chase'; this.wind = 0; } }
    if (this.state !== 'hunt' || G.dead) return this.wander(dt);
    if (kind === 'shade') { this.snd -= dt; if (this.snd <= 0 && pd < 420) { this.snd = 2.5; Snd.at('whisper', this.x, this.y); } }
    if (kind === 'spit') return this.spit(dt, pd, los);
    if (kind === 'charge') return this.charge(dt, pd, los);
    this.chase(dt, pd, los, c.run);
  }
  wander(dt) {
    const D = Dungeon, T = D.T, c = this.c, tx = Math.floor(this.x / T), ty = Math.floor(this.y / T);
    if (this.mode === 'stun') { if ((this.stun -= dt) <= 0) this.mode = 'chase'; return; }
    if (!this.goal || this.step(this.goal.x, this.goal.y, c.walk, dt)) {
      const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !D.wall(tx + dx, ty + dy) && !(this.prev && this.prev[0] === tx + dx && this.prev[1] === ty + dy));
      const all = opts.length ? opts : [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !D.wall(tx + dx, ty + dy));
      const n = all.length ? all[Math.floor(Math.random() * all.length)] : [0, 0]; this.prev = [tx, ty]; this.goal = D.center(tx + n[0], ty + n[1]);
    }
  }
  // Ближайший шаг к игроку по полю расстояний (или прямо, если он рядом и виден)
  chase(dt, pd, los, speed) {
    const D = Dungeon, T = D.T, L = D.lvl, c = this.c, tx = Math.floor(this.x / T), ty = Math.floor(this.y / T); let goal;
    if (los && pd < T * 1.6) goal = { x: P.x, y: P.y };
    else {
      const f = D.field; let best = null, bd = f[ty * L.w + tx];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const v = f[(ty + dy) * L.w + tx + dx]; if (v < bd) { bd = v; best = [dx, dy]; } }
      goal = best ? D.center(tx + best[0], ty + best[1]) : { x: this.x, y: this.y };
    }
    if (pd < this.r + P.r + 4) {
      if (this.cd <= 0) { this.cd = c.cd; P.hurt(c.dmg, this); if (c.bleed && Math.random() < c.bleed) P.bleed = 8; Snd.hit(); }
    } else this.step(goal.x, goal.y, speed, dt);
  }
  // Кислотник: в зоне видимости стоит и плюёт (замах виден по зелёной точке); слишком близко — отступает; вне видимости — подходит
  spit(dt, pd, los) {
    const D = Dungeon, T = D.T, L = D.lvl, c = this.c;
    if (!(los && pd < c.range)) { this.wind = 0; return this.chase(dt, pd, los, c.run); }
    this.face = P.x < this.x ? -1 : 1;
    if (pd < c.keep) {
      const tx = Math.floor(this.x / T), ty = Math.floor(this.y / T), f = D.field; let best = null, bd = f[ty * L.w + tx];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const v = f[(ty + dy) * L.w + tx + dx]; if (v !== 65535 && v > bd) { bd = v; best = [dx, dy]; } }
      if (best) { const g = D.center(tx + best[0], ty + best[1]); this.step(g.x, g.y, c.walk * 1.4, dt); }
    }
    if (this.wind > 0) {
      if ((this.wind -= dt) <= 0) { const a = Math.atan2(P.y - this.y, P.x - this.x); D.shots.push({ x: this.x, y: this.y, vx: Math.cos(a) * c.shot, vy: Math.sin(a) * c.shot, t: 2.5, dmg: c.dmg }); this.cd = c.cd; Snd.at('crunch', this.x, this.y); }
    } else if (this.cd <= 0) this.wind = c.wind;
  }
  // Панцирник: ползёт к игроку; увидев его в прямом коридоре — замах, разбег, при ударе о стену — оглушение
  charge(dt, pd, los) {
    const D = Dungeon, T = D.T, c = this.c;
    if (this.mode === 'stun') { if ((this.stun -= dt) <= 0) this.mode = 'chase'; return; }
    if (this.mode === 'wind') { this.face = P.x < this.x ? -1 : 1; if ((this.mt -= dt) <= 0) { this.mode = 'dash'; this.mt = c.dashT; this.hit = false; this.dir = this.axis(); Snd.at('clank', this.x, this.y); } return; }
    if (this.mode === 'dash') {
      const s = c.dash * dt, nx = Math.cos(this.dir), ny = Math.sin(this.dir);
      if (D.wall(Math.floor((this.x + nx * (this.r + s + 2)) / T), Math.floor((this.y + ny * (this.r + s + 2)) / T))) { this.mode = 'stun'; this.stun = c.stun; this.cd = c.chargeCd; Snd.hit(); G.shake = Math.max(G.shake, 0.15); return; }
      this.x += nx * s; this.y += ny * s; this.face = nx < 0 ? -1 : 1;
      if (!this.hit && pd < this.r + P.r + 3) { this.hit = true; P.hurt(c.dashDmg, this); Snd.hit(); }
      if ((this.mt -= dt) <= 0) { this.mode = 'chase'; this.cd = c.chargeCd; }
      return;
    }
    const dx = P.x - this.x, dy = P.y - this.y;
    if (los && this.cd <= 0 && pd > 70 && pd < c.reach && (Math.abs(dx) < T * 0.5 || Math.abs(dy) < T * 0.5)) { this.mode = 'wind'; this.mt = c.wind; return; }
    this.chase(dt, pd, los, c.run);
  }
}

// ---- подключение к остальной игре ----
(() => {
  const _enter = Camp.enter.bind(Camp), _clamp = Camp.clampP.bind(Camp), _tick = Camp.tick.bind(Camp), _lights = Camp.curLights.bind(Camp), _grid = Camp.grid.bind(Camp), _hear = Mutants.hear.bind(Mutants), _near = Meta.nearExtra.bind(Meta), _draw = draw;
  Camp.enter = function (s) { Dungeon.reset(); _enter(s); };
  Camp.clampP = function () { return G.scene === 'dungeon' ? Dungeon.clampP() : _clamp(); };
  Camp.tick = function (dt) { return G.scene === 'dungeon' ? Dungeon.tick(dt) : _tick(dt); };
  Camp.curLights = function () { return G.scene === 'dungeon' ? Dungeon.lights : _lights(); };
  Camp.grid = function () { return G.scene === 'dungeon' ? Dungeon.og : _grid(); };
  Mutants.hear = function (x, y, r, k) { return G.scene === 'dungeon' ? Dungeon.hear(x, y, r) : _hear(x, y, r, k); };
  Meta.nearExtra = function (c) { _near(c); Dungeon.nearZone(c); };
  draw = function () { return G.scene === 'dungeon' ? Dungeon.draw() : _draw(); };
})();

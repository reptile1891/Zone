'use strict';
// Мир: биомы, реквизит, поля аномалий, вода, привалы, артефакты, радиация, бункеры, трупы сталкеров.
const BIOME_KEYS = Object.keys(CFG.biomes);
// col: [dx, dy, r] — круги коллизии относительно центра спрайта (умножаются на масштаб)
const PROPS = {
  tree:     { spr: 'tree', sc: [1.1, 1.5], col: [[0, 5, 7]] },
  pine:     { spr: 'pine', sc: [1, 1.4], col: [[0, 11, 5]] },
  deadtree: { spr: 'deadtree', sc: [1, 1.3], col: [[0, 9, 4]] },
  bush:     { spr: 'bush', sc: [1, 1.5], decor: true },
  tuft:     { spr: 'tuft', sc: [1, 1.6], decor: true },
  dtuft:    { spr: 'tuft_d', sc: [1, 1.6], decor: true },
  reed:     { spr: 'reed', sc: [1, 1.6], decor: true },
  rock:     { spr: 'rock', sc: [1, 2], col: [[0, 1, 9]] },
  boulder:  { spr: 'boulder', sc: [1.2, 2.2], col: [[0, 3, 13]] },
  car:      { spr: 'wreck', sc: [1, 1.1], col: [[-9, 3, 9], [9, 3, 9]], cont: 'wreck' },
  car_b:    { spr: 'car_b', sc: [1, 1.1], col: [[-9, 3, 9], [9, 3, 9]], cont: 'wreck' },
  truck:    { spr: 'truck', sc: [1, 1], col: [[-22, 4, 9], [-8, 4, 9], [6, 4, 9], [20, 4, 9]], cont: 'wreck' },
  bus:      { spr: 'bus', sc: [1, 1], col: [[-24, 4, 9], [-10, 4, 9], [4, 4, 9], [18, 4, 9]], cont: 'wreck' },
  container: { spr: 'cont_r', sc: [1, 1], col: [[-12, 3, 8], [0, 3, 8], [12, 3, 8]], cont: 'wreck' },
  barrel:   { spr: 'barrel', sc: [1, 1.3], col: [[0, 3, 6]] },
  tires:    { spr: 'tires', sc: [1, 1.4], col: [[0, 2, 7]] },
  pylon:    { spr: 'pylon', sc: [1, 1.3], col: [[0, 20, 5]] },
  lamp:     { spr: 'lamp', sc: [1, 1.2], col: [[0, 11, 3]] },
  fence:    { spr: 'fence', sc: [1, 1.3], col: [[-10, 3, 5], [0, 3, 5], [10, 3, 5]] },
  wall:     { spr: 'wall', sc: [1, 1.5], col: [[0, 2, 9]] },
  house:    { spr: 'house', sc: [1, 1.15], col: [[-30, 9, 10], [-18, 9, 10], [-6, 9, 10], [6, 9, 10], [18, 9, 10], [30, 9, 10]], cont: 'house' },
  ruin:     { spr: 'ruin', sc: [1, 1.15], col: [[-24, 8, 10], [-12, 8, 10], [0, 8, 10], [12, 8, 10], [24, 8, 10]], cont: 'house' },
  tank:     { spr: 'tank', sc: [1.1, 1.5], col: [[-8, 6, 12], [8, 6, 12]] },
  pipe:     { spr: 'pipe', sc: [1, 1.4], col: [[-14, 2, 5], [0, 2, 5], [14, 2, 5]] },
  billboard: { spr: 'billboard', sc: [1, 1.3], col: [[0, 10, 6]], noflip: true },
  well:     { spr: 'well', sc: [1, 1.3], col: [[0, 2, 9]] },
  hay:      { spr: 'hay', sc: [1, 1.4], col: [[0, 1, 8]] },
  grave:    { spr: 'grave', sc: [1, 1.3], col: [[0, 2, 5]] },
  bones:    { spr: 'bones', sc: [1, 1.4], decor: true },
  tower:    { spr: 'tower', sc: [1, 1.2], col: [[0, 20, 8]] },
  rail:     { spr: 'rail', sc: [1, 1.3], decor: true },
  crater:   { spr: 'crater', sc: [1, 2.4], decor: true, noflip: true },
};

class World {
  constructor(seed) {
    this.seed = seed; this.R = U.rng(seed);
    this.S = CFG.world.size; this.C = CFG.world.camp; this.uid = 1; this.CELL = 160; this.N = Math.ceil(this.S / this.CELL);
    this.og = new Grid(200); this.dg = new Grid(200);
    this.anoms = []; this.arts = []; this.loot = []; this.corpses = []; this.bunkers = []; this.rad = []; this.caches = [];
    this.conts = []; this.water = []; this.grass = []; this.rest = []; this.labs = [];
    this.genBiomes(); this.genProps(); this.genAnoms(); this.genRad(); this.genBunkers(); this.genCorpses(); this.genStashes(); this.genRest(); this.genLabs();
  }
  danger(x, y) {
    const d = Math.hypot(x - this.C.x, y - this.C.y) / (this.S * 1.1);
    return d < 0.2 ? 1 : d < 0.42 ? 2 : d < 0.68 ? 3 : 4;
  }
  biomeAt(x, y) {
    const c = (v) => U.clamp(Math.floor(v / this.CELL), 0, this.N - 1);
    return BIOME_KEYS[this.bg[c(y) * this.N + c(x)]];
  }
  spot(minCamp, rnd) {
    const R = rnd || this.R;
    for (let i = 0; i < 60; i++) {
      const x = 120 + R() * (this.S - 240), y = 120 + R() * (this.S - 240);
      if (Math.hypot(x - this.C.x, y - this.C.y) > minCamp) return { x, y };
    }
    return { x: this.S / 2, y: this.S / 2 };
  }

  // ---- биомы: ячейки 160×160 по ближайшему «семени» с рваным краем ----
  genBiomes() {
    const S = this.S, sites = [];
    BIOME_KEYS.forEach((k, i) => { const p = this.spot(700); sites.push({ x: p.x, y: p.y, t: i }); });
    const ti = BIOME_KEYS.indexOf('town'); sites[ti] = { x: S * 0.45, y: S * 0.5, t: ti };
    for (let i = 0; i < 26; i++) {
      const p = this.spot(0), d = this.danger(p.x, p.y);
      sites.push({ x: p.x, y: p.y, t: BIOME_KEYS.indexOf(U.wpick(BIOME_KEYS, BIOME_KEYS.map(k => CFG.biomes[k].w[d - 1]), this.R)) });
    }
    this.bg = new Uint8Array(this.N * this.N);
    for (let cy = 0; cy < this.N; cy++) for (let cx = 0; cx < this.N; cx++) {
      const x = (cx + 0.5) * this.CELL, y = (cy + 0.5) * this.CELL;
      if (Math.hypot(x - this.C.x, y - this.C.y) < 750) { this.bg[cy * this.N + cx] = 0; continue; }
      let best = 0, bd = 1e9; const j = (U.hash(cx, cy) - 0.5) * 220;
      for (const s of sites) { const d = Math.hypot(s.x - x, s.y - y) + j * ((s.t * 7) % 3 - 1); if (d < bd) { bd = d; best = s.t; } }
      this.bg[cy * this.N + cx] = best;
    }
  }
  isRoad(cx, cy) { return BIOME_KEYS[this.bg[cy * this.N + cx]] === 'town' && (cx % 3 === 0 || cy % 3 === 0); }
  addProp(name, x, y, R) {
    const d0 = PROPS[name]; if (!d0) return;
    const sc = d0.sc ? U.lerp(d0.sc[0], d0.sc[1], R()) : 1;
    if (!d0.decor) {
      let ok = true; this.og.query(x, y, 70, o => { if (Math.hypot(o.x - x, o.y - y) < o.r + 14) ok = false; }); if (!ok) return;
      for (const [dx, dy, r] of d0.col) this.og.add({ x: x + dx * sc, y: y + dy * sc, r: r * sc });
    }
    const c = Spr.cache[d0.spr], h = c ? c.height : 16;
    this.dg.add({ x, y, spr: d0.spr, sc, flip: !d0.noflip && R() < 0.5, ys: y + h / 2 * sc - 2, decor: !!d0.decor });
    if (d0.cont && R() < (d0.cont === 'house' ? 0.3 : 0.35)) this.conts.push({ x, y, kind: d0.cont, opened: false, loot: this.rollLoot(this.danger(x, y), d0.cont === 'house', R) });
  }
  genProps() {
    const R = this.R, CELL = this.CELL;
    for (let cy = 0; cy < this.N; cy++) for (let cx = 0; cx < this.N; cx++) {
      const key = BIOME_KEYS[this.bg[cy * this.N + cx]], b = CFG.biomes[key], road = this.isRoad(cx, cy);
      const wx = cx * CELL, wy = cy * CELL;
      if (Math.hypot(wx + 80 - this.C.x, wy + 80 - this.C.y) < this.C.r + 90) continue;
      const list = road ? b.roadProps : b.props;
      for (const name in list) {
        const dens = list[name]; let n = Math.floor(dens) + (R() < dens % 1 ? 1 : 0);
        for (; n > 0; n--) {
          const x = wx + R() * CELL, y = wy + R() * CELL;
          if (Math.hypot(x - this.C.x, y - this.C.y) < this.C.r + 40) continue;
          this.addProp(name, x, y, R);
        }
      }
      if (b.water && R() < b.water) {
        const w = { x: wx + R() * CELL, y: wy + R() * CELL, rx: 55 + R() * 70, ry: 35 + R() * 45 };
        this.water.push(w);
        for (let i = 0; i < 10; i++) { const a = R() * 6.28; this.addProp('reed', w.x + Math.cos(a) * w.rx * 0.95, w.y + Math.sin(a) * w.ry * 0.95, R); }
      }
      if (b.grass && R() < b.grass) {
        const g = { x: wx + R() * CELL, y: wy + R() * CELL, r: 55 + R() * 40 }; this.grass.push(g);
        for (let i = 0; i < 14; i++) { const a = R() * 6.28, d = Math.sqrt(R()) * g.r; this.addProp(key === 'deadfield' ? 'dtuft' : 'tuft', g.x + Math.cos(a) * d, g.y + Math.sin(a) * d, R); }
      }
    }
  }
  inGrass(x, y) { for (const g of this.grass) if (Math.abs(g.x - x) < g.r && Math.abs(g.y - y) < g.r && Math.hypot(g.x - x, g.y - y) < g.r) return true; return false; }
  inWater(x, y) { for (const w of this.water) if (((x - w.x) / w.rx) ** 2 + ((y - w.y) / w.ry) ** 2 < 1) return true; return false; }

  // ---- аномалии: поля (плотные, между ними тропы) + одиночки ----
  // force — принудительный тип аномалии (для лабораторий); иначе тип выбирается по сектору и биому
  tryPlace(x, y, R, force) {
    const d = this.danger(x, y), bm = CFG.biomes[this.biomeAt(x, y)], types = Object.keys(CFG.anoms);
    if (Math.hypot(x - this.C.x, y - this.C.y) < this.C.r + 160) return null;
    let type = force;
    if (!type) {
      const w = types.map(k => CFG.anoms[k].w[d - 1] * (bm.am[k] == null ? 1 : bm.am[k]));
      if (!w.some(v => v > 0)) return null;
      type = U.wpick(types, w, R);
    }
    const c = CFG.anoms[type], r = c.r * (0.85 + R() * 0.3);
    if (this.anoms.some(a => Math.hypot(a.x - x, a.y - y) < a.r + r + 42)) return null;
    const a = { id: this.uid++, type, x, y, r, t: R() * (c.period || c.cycle || 1), state: 0, known: false, flash: 0, revealed: 0, vx: 0, vy: 0, ph: R() * 6.28, act: false };
    if (type === 'fluff') { const ang = R() * 6.28; a.vx = Math.cos(ang) * c.drift; a.vy = Math.sin(ang) * c.drift; }
    this.anoms.push(a);
    return a;
  }
  addAnom(rnd) {
    const R = rnd || this.R;
    for (let t = 0; t < 40; t++) { const p = this.spot(this.C.r + 160, R), a = this.tryPlace(p.x, p.y, R); if (a) { if (R() < 0.4 + 0.06 * this.danger(a.x, a.y)) this.addArtifact(a, this.danger(a.x, a.y), R); return a; } }
  }
  addArtifact(a, d, R) {
    const list = CFG.anoms[a.type].arts;
    const idx = Math.floor(Math.min(0.999, R() * (0.4 + d * 0.2)) * list.length);
    const ang = R() * 6.28, rr = R() * a.r * 0.6;
    this.arts.push({ id: this.uid++, type: list[idx], x: a.x + Math.cos(ang) * rr, y: a.y + Math.sin(ang) * rr, anom: a.id });
  }
  genAnoms() {
    const R = this.R;
    for (let f = 0; f < CFG.counts.fields; f++) {
      const p = this.spot(this.C.r + 300), d = this.danger(p.x, p.y), want = 5 + Math.floor(R() * 5), rad = 170 + R() * 100;
      let placed = 0;
      for (let t = 0; t < want * 6 && placed < want; t++) {
        const ang = R() * 6.28, dd = Math.sqrt(R()) * rad, a = this.tryPlace(p.x + Math.cos(ang) * dd, p.y + Math.sin(ang) * dd, R);
        if (a) { placed++; if (R() < 0.5 + 0.06 * d) this.addArtifact(a, d, R); }
      }
    }
    for (let i = 0; i < CFG.counts.anoms; i++) this.addAnom();
  }

  genRad() {
    for (let i = 0; i < CFG.counts.radZones; i++) {
      for (let t = 0; t < 30; t++) {
        const p = this.spot(this.C.r + 500);
        if (this.danger(p.x, p.y) < 3) continue;
        this.rad.push({ x: p.x, y: p.y, r: 120 + this.R() * 90, i: 0.6 + this.R() * 1.6 }); break;
      }
    }
  }
  genBunkers() { for (let i = 0; i < CFG.counts.bunkers; i++) { const p = this.spot(this.C.r + 350); this.bunkers.push({ x: p.x, y: p.y, known: false }); } }
  genRest() {
    for (let i = 0; i < CFG.counts.rest; i++) for (let t = 0; t < 20; t++) {
      const p = this.spot(this.C.r + 400);
      if (this.anoms.some(a => Math.hypot(a.x - p.x, a.y - p.y) < a.r + 110)) continue;
      let ok = true; this.og.query(p.x, p.y, 80, o => { if (Math.hypot(o.x - p.x, o.y - p.y) < o.r + 30) ok = false; });
      if (ok) { this.rest.push({ x: p.x, y: p.y }); break; }
    }
  }
  // ---- лаборатории: обнесённые площадки в опасных секторах; вокруг — пружины и магнитные ямы, внутри — шкафы с хорошей добычей ----
  genLabs() {
    const R = this.R;
    for (let i = 0; i < (CFG.counts.labs || 0); i++) {
      let p = null;
      for (let t = 0; t < 60 && !p; t++) {
        const q = this.spot(this.C.r + 900);
        if (this.danger(q.x, q.y) >= 3 && !this.labs.some(l => Math.hypot(l.x - q.x, l.y - q.y) < 1200)) p = q;
      }
      if (!p) continue;
      const lab = { x: p.x, y: p.y, r: 170, known: false }; this.labs.push(lab);
      this.rad.push({ x: p.x, y: p.y, r: 210, i: 1.3 });
      // ограда с двумя проёмами
      const N = 12, gap1 = Math.floor(R() * N), gap2 = (gap1 + 5 + Math.floor(R() * 3)) % N;
      for (let k = 0; k < N; k++) {
        if (k === gap1 || k === gap2) continue;
        const a = k / N * 6.28, name = k % 4 === 0 ? 'pylon' : 'wall';
        this.addProp(name, p.x + Math.cos(a) * 120, p.y + Math.sin(a) * 120, R);
      }
      for (let k = 0; k < 3; k++) { const a = R() * 6.28, r = 30 + R() * 40; this.addProp('tank', p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, R); }
      // шкафы: три штуки внутри кольца
      for (let k = 0; k < 3; k++) {
        const a = (k + R() * 0.5) / 3 * 6.28, r = 55 + R() * 20, x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
        this.og.add({ x: x - 12, y: y + 3, r: 8 }); this.og.add({ x, y: y + 3, r: 8 }); this.og.add({ x: x + 12, y: y + 3, r: 8 });
        this.dg.add({ x, y, spr: 'cont_b', sc: 1, flip: false, ys: y + 6, decor: false });
        this.conts.push({ x, y, kind: 'lab', opened: false, loot: this.rollLab(R) });
      }
      // охрана: пружины на подходах, магнитные ямы у ограды
      const guard = [['spring', 200], ['spring', 215], ['magnet', 240], ['magnet', 260]];
      for (const [type, dist] of guard) for (let t = 0; t < 12; t++) { const a = R() * 6.28; if (this.tryPlace(p.x + Math.cos(a) * dist, p.y + Math.sin(a) * dist, R, type)) break; }
    }
  }
  rollLab(rnd) {
    const R = rnd || this.R, L = [['circuit', 3 + Math.floor(R() * 3)], ['battery', 2 + Math.floor(R() * 3)]];
    if (R() < 0.6) L.push(['reagent', 1]); if (R() < 0.5) L.push(['medkit', 1 + Math.floor(R() * 2)]); if (R() < 0.35) L.push(['antibiotic', 1]);
    L.push(['ammo', 6 + Math.floor(R() * 8)]); L.push(['money', 90 + Math.floor(R() * 90)]);
    return L;
  }
  rollLoot(d, rich, rnd) {
    const R = rnd || this.R, L = [], m = rich ? 2 : 1, junk = ['scrap', 'circuit', 'battery'];
    for (let i = 0, n = 1 + Math.floor(R() * 2 * m); i < n; i++) L.push([junk[Math.floor(R() * junk.length)], 1 + Math.floor(R() * 2 * m)]);
    if (R() < 0.35) L.push(['ammo', 2 + Math.floor(R() * 5)]);
    if (R() < 0.12 * m) L.push(['medkit', 1]);
    if (R() < 0.08) L.push(['antirad', 1]);
    if (R() < 0.3 * m) L.push(['money', Math.round((8 + R() * 22) * (0.7 + d * 0.3) * m)]);
    return L;
  }
  genStashes() {
    for (let i = 0; i < CFG.counts.stashes; i++) { const p = this.spot(this.C.r + 120), d = this.danger(p.x, p.y); this.conts.push({ x: p.x, y: p.y, kind: 'stash', opened: false, loot: this.rollLoot(d, true) }); }
  }
  genCorpses() {
    for (let i = 0; i < CFG.counts.corpses; i++) {
      const p = this.spot(this.C.r + 200), d = this.danger(p.x, p.y);
      const items = [];
      if (this.R() < 0.7) items.push(['ammo', 2 + Math.floor(this.R() * 5)]);
      if (this.R() < 0.4) items.push(['medkit', 1]);
      if (this.R() < 0.3) items.push(['food', 1]);
      if (this.R() < 0.55) items.push(['money', 8 + Math.floor(this.R() * 35)]);
      if (this.R() < 0.6) items.push(['bolt', 3 + Math.floor(this.R() * 6)]);
      const c = { x: p.x, y: p.y, items, looted: false, art: null, note: null };
      if (this.R() < 0.18 + d * 0.06) c.art = U.pick(['medusa', 'soul', 'thorn', 'stoneflower', 'dud'], this.R);
      const near = this.anoms.filter(a => Math.hypot(a.x - p.x, a.y - p.y) < 500);
      if (this.R() < 0.5 && near.length) {
        const a = U.pick(near, this.R);
        c.note = { txt: 'Пометил на карте: «' + CFG.anoms[a.type].name + '». Обойди.', anom: a };
      } else c.note = { txt: CFG.notes[Math.floor(this.R() * CFG.notes.length)], anom: null };
      this.corpses.push(c);
    }
  }

  // ---- динамика ----
  update(dt, ents) {
    for (const a of this.anoms) {
      const c = CFG.anoms[a.type];
      a.flash = Math.max(0, a.flash - dt); a.revealed = Math.max(0, a.revealed - dt);
      if (a.type === 'fluff') {
        a.x += a.vx * dt; a.y += a.vy * dt;
        if (a.x < 100 || a.x > this.S - 100) a.vx *= -1;
        if (a.y < 100 || a.y > this.S - 100) a.vy *= -1;
        if (Math.random() < dt * 0.05) { const ang = Math.random() * 6.28; a.vx = Math.cos(ang) * c.drift; a.vy = Math.sin(ang) * c.drift; }
      } else if (a.type === 'electra') {
        a.t += dt * (G.wx === 'storm' ? 1.6 : 1);
        if (a.state === 0 && a.t >= c.period) { a.state = 1; a.t = 0; }
        else if (a.state === 1 && a.t >= c.charge) this.discharge(a, ents);
      } else if (a.type === 'grinder') {
        a.t += dt; const act = (a.t % c.cycle) > c.cycle - c.act;
        if (act && !a.act && Math.hypot(a.x - P.x, a.y - P.y) < 500) Snd.grind();
        a.act = act;
      } else if (a.type === 'spring') {
        a.t += dt;
        if (a.state === 0 && a.t >= c.period) { a.state = 1; a.t = 0; }
        else if (a.state === 1 && a.t >= c.charge) this.launch(a, ents);
      }
    }
    for (const e of ents) if (!e.dead) this.applyAnoms(e, dt);
  }
  discharge(a, ents) {
    const c = CFG.anoms.electra; a.state = 0; a.t = 0; a.flash = 0.4;
    for (const e of ents) if (!e.dead && Math.hypot(e.x - a.x, e.y - a.y) < a.r) e.hurt(c.dmg, 'anom');
    if (Math.hypot(a.x - P.x, a.y - P.y) < 500) Snd.zap();
  }
  // Пружина: короткий заряд, затем всех в круге подбрасывает и отшвыривает от центра
  launch(a, ents) {
    const c = CFG.anoms.spring; a.state = 0; a.t = 0; a.flash = 0.4;
    for (const e of ents) {
      if (e.dead) continue; const dx = e.x - a.x, dy = e.y - a.y, d = Math.hypot(dx, dy);
      if (d >= a.r) continue;
      const k = c.push * (1 - d / a.r * 0.5) / (d || 1); e.x = U.clamp(e.x + dx * k, 20, this.S - 20); e.y = U.clamp(e.y + dy * k, 20, this.S - 20);
      e.hurt(c.dmg, 'anom');
    }
    if (Math.hypot(a.x - P.x, a.y - P.y) < 500) Snd.zap();
  }
  applyAnoms(e, dt) {
    e.slow = 1; let cur = null;
    for (const a of this.anoms) {
      const dx = e.x - a.x, dy = e.y - a.y;
      if (Math.abs(dx) > a.r * 1.8 || Math.abs(dy) > a.r * 1.8) continue;
      const d = Math.hypot(dx, dy) || 1, c = CFG.anoms[a.type];
      if (a.type === 'funnel') {
        const pr = a.r * 1.7;
        if (d < pr) {
          const pull = c.pull * (1 - d / pr) * dt; e.x -= dx / d * pull; e.y -= dy / d * pull;
          if (d < a.r) { e.hurt(c.dps * dt, 'anom'); if (d < a.r * c.core) e.hurt(c.coreDps * dt, 'anom'); cur = a; }
        }
      } else if (a.type === 'fluff' && d < a.r) { e.hurt(c.dps * dt, 'anom'); e.slow = Math.min(e.slow, c.slow); cur = a; }
      else if (a.type === 'slime' && d < a.r) { e.hurt(c.dps * dt, 'anom'); e.slow = Math.min(e.slow, c.slow); cur = a; }
      else if (a.type === 'plesh' && d < a.r) { e.hurt(c.dps * dt, 'anom'); const pl = 45 * (1 - d / a.r) * dt; e.x -= dx / d * pl; e.y -= dy / d * pl; e.slow = Math.min(e.slow, 0.55); cur = a; }
      else if (a.type === 'grinder' && d < a.r) { cur = a; if (a.act) e.hurt(c.dps * dt, 'anom'); }
      else if (a.type === 'electra' && d < a.r) cur = a;
      else if (a.type === 'spring' && d < a.r) cur = a;
      else if (a.type === 'magnet') {
        const pr = a.r * 1.5, metal = !!(e.c && e.c.metal);
        if (d < pr) {
          const pull = c.pull * (metal ? 1.6 : 0.6) * (1 - d / pr) * dt; e.x -= dx / d * pull; e.y -= dy / d * pull;
          if (d < a.r) { e.hurt(c.dps * dt, 'anom'); if (metal) e.hurt(c.metalDps * dt, 'anom'); cur = a; }
        }
      }
    }
    e.inAnom = cur;
  }
  boltHit(x, y) {
    for (const a of this.anoms) {
      const c = CFG.anoms[a.type];
      if (Math.hypot(a.x - x, a.y - y) < a.r * (a.type === 'funnel' ? 1.2 : 1)) {
        const first = !a.known; a.known = true; a.revealed = 45; a.flash = 0.6;
        if (a.type === 'electra' && a.state === 0) { a.state = 1; a.t = c.charge - 0.5; }
        else if (a.type === 'electra' && a.state === 1) a.t = c.charge;
        else if (a.type === 'grinder' && !a.act) a.t = c.cycle - c.act - 0.3;
        else if (a.type === 'spring' && a.state === 0) { a.state = 1; a.t = c.charge - 0.5; }
        return { a, first };
      }
    }
    return null;
  }
  radAt(x, y) {
    let s = 0;
    for (const z of this.rad) { const d = Math.hypot(x - z.x, y - z.y); if (d < z.r) s += z.i * (1 - d / z.r); }
    return s;
  }
  sheltered(x, y) {
    if (Math.hypot(x - this.C.x, y - this.C.y) < this.C.r) return true;
    return this.bunkers.some(b => Math.hypot(x - b.x, y - b.y) < CFG.emission.shelterR);
  }
  // Выброс тасует Зону
  shake() {
    for (let i = this.anoms.length - 1; i >= 0; i--) {
      const a = this.anoms[i];
      if (Math.random() < 0.3) {
        this.arts = this.arts.filter(r => r.anom !== a.id);
        this.anoms.splice(i, 1);
        this.addAnom(Math.random);
      } else a.known = false;
    }
    for (const a of this.anoms) {
      if (this.arts.length < 140 && !this.arts.some(r => r.anom === a.id) && Math.random() < 0.3) this.addArtifact(a, this.danger(a.x, a.y), Math.random);
    }
    for (const c of this.conts) if (c.opened && Math.random() < 0.45) { c.opened = false; c.loot = c.kind === 'lab' ? this.rollLab(Math.random) : this.rollLoot(this.danger(c.x, c.y), c.kind !== 'wreck', Math.random); }
    for (const z of this.rad) z.i = Math.max(0.4, z.i * (0.7 + Math.random() * 0.7));
  }
}

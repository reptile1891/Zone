"use strict";
// v0.27: у аномалий разные формы, признаки видны только вблизи; геометрия (урон, болт, артефакты) следует форме.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createZone } = require("./zone-load");

const z = createZone();
const run = code => JSON.parse(JSON.stringify(z.run(code) ?? null));
const fresh = () => z.run(`(() => {
  W = new World(1234); resetPlayer(); P.stash = []; P.bld = null; Mutants.spawn(); Stalkers.spawn(); Meta.reset(); Camp.enter(true);
  G.events = []; G.dead = false; G.started = true; G.ui = null; G.scene = "zone"; G.emi = { s: "calm", left: 0, next: 99999 }; G.t = 5; VW = 800; VH = 600;
  P.x = 3000; P.y = 3000; P.hp = 100; Mutants.list = []; Stalkers.list = []; W.anoms = []; W.arts = [];
})()`);

test("у каждого типа аномалии есть форма; формы не круглые (радиус границы заметно меняется), у остальных площадь сопоставима", () => {
  fresh();
  const o = run(`(() => { const r = {}; for (const k in CFG.anoms) { const a = { type: k, x: 0, y: 0, r: 50, ph: 1.3, rot: 0.9 }; let mn = 9, mx = 0, area = 0; for (let i = 0; i < 360; i++) { const e = AShape.edge(a, i / 360 * 6.2832); mn = Math.min(mn, e); mx = Math.max(mx, e); area += e * e / 2 / 360 * 6.2832; }
    r[k] = { shape: CFG.anoms[k].shape, mn: +mn.toFixed(2), mx: +mx.toFixed(2), area: +(area / 3.1416).toFixed(2) }; } return r; })()`);
  const shapes = new Set();
  for (const k in o) { assert.ok(o[k].shape, k + ": shape"); shapes.add(o[k].shape); if (o[k].shape !== "ring") assert.ok(o[k].mx - o[k].mn > 0.25, k + ": форма не круглая " + JSON.stringify(o[k])); assert.ok(o[k].area > 0.7 && o[k].area < 1.5, k + ": площадь " + o[k].area); }
  assert.ok(shapes.size >= 5, "разных форм: " + [...shapes]);
});

test("геометрия: точка внутри вытянутой Электры по длинной оси и вне по короткой; кольцо Мясорубки безопасно в центре; урон идёт по форме", () => {
  fresh();
  const o = run(`(() => {
    const el = { type: "electra", x: 3000, y: 3000, r: 48, ph: 0, rot: 0, t: 0, state: 0, flash: 0, revealed: 0, known: false, act: false, dir: 0 }; W.anoms = [el];
    const inX = AShape.inside(el, 60, 0), inY = AShape.inside(el, 0, 60), edgeX = AShape.R(el, 1, 0), edgeY = AShape.R(el, 0, 1);
    const gr = { type: "grinder", x: 3500, y: 3000, r: 44, ph: 0, rot: 0, t: 0, state: 0, flash: 0, revealed: 0, known: false, act: true, dir: 0 }; W.anoms = [gr];
    const centre = AShape.inside(gr, 3, 0), ring = AShape.inside(gr, 33, 0);
    P.x = 3500 + 3; P.y = 3000; P.hp = 100; W.applyAnoms(P, 0.5); const hpC = P.hp; P.x = 3500 + 33; W.applyAnoms(P, 0.5); const hpR = P.hp;
    const pl = { type: "plesh", x: 4000, y: 3000, r: 40, ph: 2, rot: 1, t: 0, state: 0, flash: 0, revealed: 0, known: false, act: false, dir: 0 }; W.anoms = [pl];
    let inside = 0, tot = 0; for (let i = 0; i < 400; i++) { const th = i / 400 * 6.2832; for (const f of [0.9, 1.1]) { tot++; if (AShape.inside(pl, Math.cos(th) * 40 * AShape.edge(pl, th) * f, Math.sin(th) * 40 * AShape.edge(pl, th) * f)) inside++; } }
    const bolt = W.boltHit(4000 + 40 * AShape.edge(pl, 0) * 0.9, 3000), boltOut = W.boltHit(4000 + 40 * AShape.edge(pl, 0) * 1.1, 3000);
    return { inX, inY, edgeX, edgeY, centre, ring, hpC, hpR, ratio: inside / tot, bolt: !!bolt, boltOut: !!boltOut };
  })()`);
  assert.equal(o.inX, true); assert.equal(o.inY, false); assert.ok(o.edgeX > 70 && o.edgeY < 35); assert.equal(o.centre, false); assert.equal(o.ring, true); assert.equal(o.hpC, 100, "в дырке кольца безопасно"); assert.ok(o.hpR < 100, "в кольце крутящаяся секция бьёт");
  assert.ok(Math.abs(o.ratio - 0.5) < 1e-9, "граница разделяет внутри и снаружи: " + o.ratio); assert.equal(o.bolt, true); assert.equal(o.boltOut, false);
});

test("артефакты лежат внутри формы своей аномалии (у Мясорубки — в безопасной дырке), на многих мирах", () => {
  fresh();
  const o = run(`(() => { let bad = 0, n = 0, ringIn = 0, ring = 0; for (let s = 0; s < 8; s++) { const w = new World(700 + s); for (const r of w.arts) { const a = w.anoms.find(x => x.id === r.anom); if (!a) continue; n++; if (!AShape.inside(a, r.x - a.x, r.y - a.y)) { if (CFG.anoms[a.type].shape !== "ring") bad++; } if (CFG.anoms[a.type].shape === "ring") { ring++; if (Math.hypot(r.x - a.x, r.y - a.y) < a.r * CFG.anoms[a.type].hole) ringIn++; } } } return { bad, n, ring, ringIn }; })()`);
  assert.ok(o.n > 20); assert.equal(o.bad, 0, "артефакт вне формы"); assert.equal(o.ring, o.ringIn, "у кольца артефакт в дырке");
});

test("заметность: радиус примет зависит от чутья и детекторов, без них — вплотную", () => {
  fresh();
  const o = run(`(() => { P.inv = []; P.sk.sense = 0; const base = signR(); P.sk.sense = 3; const sense = signR(); P.sk.sense = 0; invAdd("detector", 1); const d1 = signR(); invAdd("detector2", 1); const d2 = signR(); return { base, sense, d1, d2 }; })()`);
  assert.equal(o.base, 60); assert.equal(o.sense, 165); assert.equal(o.d1, 150); assert.equal(o.d2, 230);
});

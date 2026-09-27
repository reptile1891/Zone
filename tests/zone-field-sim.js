"use strict";
// Бот-прогон вылазок в Зону: бот стартует в секторе d, ходит по ближайшим контейнерам, телам и лежащим вещам, стреляет по врагам, лечится аптечкой.
// Считает, что выходит из вылазки заданной длины: добыча в рублях (по ценам Скупщика), потери, расход патронов и износ оружия.
// Это НЕ игрок: бот не берёт артефакты из аномалий, не прячется и не уворачивается (нижняя граница по добыче и по риску).
// Запуск отчёта: npm run sim:field [N]. Границы результатов проверяет tests/zone-field-sim.test.js.
const { createZone } = require("./zone-load");

const z = createZone();

const runOne = (seed, sector, opts) => z.run(`(() => {
  const opts = ${JSON.stringify(opts || {})}, rnd = U.rng(${seed}), orig = Math.random; Math.random = rnd; let hurt0 = null;
  try {
    W = new World(opts.world || 1234); resetPlayer(); P.stash = []; P.bld = null; Mutants.spawn(); Stalkers.spawn(); Meta.reset(); Camp.enter(true);
    G.events = []; G.dead = false; G.scene = "zone"; G.night = 0; G.hour = 12; G.fog = 0; G.rain = 0; G.wx = "clear"; G.wxT = 1e9; G.emi = { s: "calm", left: 0, next: 99999 }; G.t = 5; G.ui = null; G.started = true;
    G.clock = 12 / 24 * CFG.time.dayLen;
    // стартовая точка нужного сектора: не вода, не озеро
    let sx = 0, sy = 0; for (let i = 0; i < 4000; i++) { const x = 300 + rnd() * (W.S - 600), y = 300 + rnd() * (W.S - 600); if (W.danger(x, y) === ${sector} && W.biomeAt(x, y) !== "lake") { sx = x; sy = y; break; } }
    P.x = sx; P.y = sy; P.inv = []; invAdd("ammo", opts.ammo || 30); invAdd("medkit", opts.medkits == null ? 2 : opts.medkits); invAdd("bolt", 10);
    P.hp = 100; P.money = 0; P.weapon = "pistol"; P.cond.pistol = 100; P.sel = 0; P.kills = 0; P.grab = 0; P.stam = 100; VW = 800; VH = 600; Codex.t = 99999;
    keys.KeyD = keys.KeyA = keys.KeyW = keys.KeyS = keys.ControlLeft = false; mouse.l = false;
    let hurtSum = 0; hurt0 = P.hurt; P.hurt = function (d, src) { const h = this.hp; const r = hurt0.apply(this, arguments); hurtSum += Math.max(0, h - this.hp); return r; };
    const dt = 0.1, T = (opts.minutes || 4) * 60; let t = 0, meds = 0, shots = 0, picks = 0, result = "ok", target = null, stuckT = 0, lx = P.x, ly = P.y, wander = 0, wdx = 0, wdy = 0; const ammo0 = invCount("ammo"); const bl = new Set(); const invN0 = P.inv.length;
    const inAnom = o => W.anoms.some(a => Math.hypot(a.x - o.x, a.y - o.y) < a.r + 25);
    const pick = () => { let best = null, bd = 2600; const c = (o, d) => { if (!bl.has(o) && d < bd && !inAnom(o)) { bd = d; best = o; } };
      for (const o of W.conts) if (!o.opened) c(o, Math.hypot(o.x - P.x, o.y - P.y)); for (const o of W.corpses) if (!o.looted) c(o, Math.hypot(o.x - P.x, o.y - P.y)); for (const o of W.loot) if (o.id !== "bolt") c(o, Math.hypot(o.x - P.x, o.y - P.y)); return best; };
    while (t < T) {
      keys.KeyD = keys.KeyA = keys.KeyW = keys.KeyS = false;
      // враги: преследующие мутанты и враждебные сталкеры
      let foe = null, fd = 330; for (const m of Mutants.list) { if (m.dead || (m.state !== "hunt" && !(Math.hypot(m.x - P.x, m.y - P.y) < 120 && m.state !== "sleep"))) continue; const d = Math.hypot(m.x - P.x, m.y - P.y); if (d < fd) { fd = d; foe = m; } }
      for (const s of Stalkers.list) { if (s.dead || !s.hostile) continue; const d = Math.hypot(s.x - P.x, s.y - P.y); if (d < fd) { fd = d; foe = s; } }
      if (P.hp < 40 && invCount("medkit") > 0 && meds < 4) { useItem("medkit"); meds++; }
      if (foe && invCount("ammo") > 0) { P.ang = Math.atan2(foe.y - P.y, foe.x - P.x); if (P.cd <= 0) { shoot(); shots++; } }
      else {
        if (!target || (target.opened || target.looted) || (target.n !== undefined && !W.loot.includes(target))) target = pick();
        if (!target && wander <= 0) { const a = rnd() * 6.28; wdx = Math.cos(a); wdy = Math.sin(a); wander = 3; }
        let dx, dy; if (target) { dx = target.x - P.x; dy = target.y - P.y; } else { dx = wdx; dy = wdy; wander -= dt; }
        P.ang = Math.atan2(dy, dx);
        if (target && Math.hypot(dx, dy) < 30) { const m0 = P.money, n0 = P.inv.reduce((a, s) => a + (s.n || 1), 0); if (G.near) G.near.fn(); if (P.money !== m0 || P.inv.reduce((a, s) => a + (s.n || 1), 0) !== n0) picks++; bl.add(target); target = null; }
        else {
          // обход аномалий: если впереди (на 70 пикс.) опасный круг — свернуть по касательной
          const L = Math.hypot(dx, dy) || 1; let ux = dx / L, uy = dy / L;
          for (const a of W.anoms) { const ax = a.x - P.x, ay = a.y - P.y, ad = Math.hypot(ax, ay), lim = a.r + 45 + (a.pull ? 40 : 0); if (ad < lim + 70 && ax * ux + ay * uy > 0) { const cr = ux * ay - uy * ax; const sg = cr > 0 ? -1 : 1; const px = -uy * sg, py = ux * sg; ux = ux * 0.35 + px; uy = uy * 0.35 + py; const l2 = Math.hypot(ux, uy); ux /= l2; uy /= l2; if (ad < lim) { ux = -ax / ad * 0.6 + px * 0.8; uy = -ay / ad * 0.6 + py * 0.8; } } }
          keys.KeyA = ux < -0.3; keys.KeyD = ux > 0.3; keys.KeyW = uy < -0.3; keys.KeyS = uy > 0.3;
        }
      }
      update(dt); t += dt;
      if (Math.hypot(P.x - lx, P.y - ly) < 1.5 * dt * 10) stuckT += dt; else { stuckT = 0; lx = P.x; ly = P.y; }
      if (stuckT > 2 && !foe) { if (target) bl.add(target); target = null; stuckT = 0; wander = 2; const a = rnd() * 6.28; wdx = Math.cos(a); wdy = Math.sin(a); }
      if (G.dead) { result = "dead"; break; }
    }
    // итог: деньги + рыночная цена всего, что принёс (артефакты, трофеи, хлам, мясо) + оружие по цене продажи
    let haul = P.money; for (const s of P.inv) haul += sellPrice(s, s.art ? "sci" : "buyer") * (s.art ? 1 : s.n) || 0; for (const id of P.weapons) if (id !== "pistol") haul += Wpn.sellPrice(id);
    const mats = {}; for (const s of P.inv) if (!s.art && ["scrap", "circuit", "battery", "plate"].includes(s.id)) mats[s.id] = s.n;
    return { result, t, hp: Math.max(0, P.hp), lost: hurtSum, meds, kills: P.kills, shots, picks, ammo: ammo0 - invCount("ammo"), wear: 100 - P.cond.pistol, haul: Math.round(haul), mats, start: [Math.round(sx), Math.round(sy)] };
  } finally { if (hurt0) P.hurt = hurt0; Math.random = orig; G.dead = false; P.dead = false; }
})()`);

runOne(1, 1, { minutes: 0.2 });   // прогрев: первый прогон один раз собирает лагерь и спрайты

// n прогонов на сектор
function simulate({ sector, n = 12, opts = {}, seed0 = 1 }) {
  const rows = []; for (let i = 0; i < n; i++) rows.push(JSON.parse(JSON.stringify(runOne(seed0 + i * 7919, sector, Object.assign({ world: 1000 + i * 37 }, opts)))));
  const avg = k => rows.reduce((s, r) => s + r[k], 0) / (rows.length || 1), mat = k => rows.reduce((s, r) => s + (r.mats[k] || 0), 0) / (rows.length || 1);
  return { sector, n, deaths: rows.filter(r => r.result === "dead").length / n, haul: avg("haul"), lost: avg("lost"), kills: avg("kills"), ammo: avg("ammo"), wear: avg("wear"), meds: avg("meds"), picks: avg("picks"), time: avg("t"), scrap: mat("scrap"), circuit: mat("circuit"), rows };
}

module.exports = { simulate, runOne };

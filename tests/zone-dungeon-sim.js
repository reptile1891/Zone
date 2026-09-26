"use strict";
// Бот-прогон подземелий «Обочины»: проходит настоящий цикл игры (update, shoot, useItem) от входа до сейфа и считает исход по секторам.
// Это НЕ игрок: бот не уворачивается и не прячется за углами, поэтому его результат — нижняя граница «человеческого» прохождения.
// Запуск отчёта: npm run sim:dungeon. Границы результатов проверяет tests/zone-dungeon-sim.test.js.
const { createZone } = require("./zone-load");

const z = createZone();
const CFG = z.get("CFG");

// Один прогон. careful: крадётся (Ctrl) и стреляет только по преследующим; иначе идёт обычным шагом и стреляет по всем видимым.
const runOne = (seed, danger, careful, opts) => z.run(`(() => {
  const opts = ${JSON.stringify(opts || {})}, careful = ${careful ? "true" : "false"}, rnd = U.rng(${seed}), orig = Math.random; Math.random = rnd;
  try {
    W = new World(opts.world || 1234); resetPlayer(); P.stash = []; P.bld = null; Mutants.spawn(); Stalkers.spawn(); Meta.reset(); Camp.enter(true); Dungeon.levels = {};
    G.events = []; G.dead = false; G.scene = "zone"; G.night = 0; G.hour = 12; G.fog = 0; G.rain = 0; G.wx = "clear"; G.wxT = 1e9; G.emi = { s: "calm", left: 0, next: 99999 }; G.t = 5; G.ui = null; G.clock = 100;
    ${(opts && opts.setup) || ""}
    W.danger = () => ${danger}; Stalkers.list = []; Mutants.list = [];
    P.inv = []; invAdd("ammo", opts.ammo || 40); invAdd("medkit", opts.medkits == null ? 2 : opts.medkits); invAdd("bolt", 15); if (opts.lamp) invAdd("headlamp", 1);
    P.hp = 100; P.money = 0; P.weapon = opts.weapon || "pistol"; if (opts.weapon) { P.weapons.push(opts.weapon); P.cond[opts.weapon] = 100; if (opts.weapon === "crossbow") invAdd("bolt", 40); }
    P.cond.pistol = 100; P.sel = 0; P.kills = 0; P.grab = 0; VW = 800; VH = 600; keys.KeyD = keys.KeyA = keys.KeyW = keys.KeyS = keys.ControlLeft = false; mouse.l = false;
    const b = W.bunkers[0]; b.opened = []; b.cleared = false; b.gen = 0; Dungeon.enter(b); const L = Dungeon.lvl, T = 48, w = L.w;
    const vd = new Uint16Array(w * L.h).fill(65535), q = [L.vault.ty * w + L.vault.tx]; vd[q[0]] = 0;
    for (let i = 0; i < q.length; i++) { const p = q[i], x = p % w, y = (p - x) / w; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = (y + dy) * w + x + dx; if (!L.t[n] && vd[n] === 65535) { vd[n] = vd[p] + 1; q.push(n); } } }
    const enemies0 = Dungeon.enemies.length, types = {}; for (const e of Dungeon.enemies) types[e.type] = (types[e.type] || 0) + 1;
    const dealt = {}, hurt0 = P.hurt; globalThis.__hurt0 = hurt0; P.hurt = function (d, src) { const k = src && src.type ? src.type : src === "acid" ? "spitter" : String(src); dealt[k] = (dealt[k] || 0) + d; return hurt0.call(this, d, src); };
    const dt = 0.1; let t = 0, minHp = 100, meds = 0, result = "timeout", shots = 0, spent = 0; const ammo0 = invCount("ammo") + invCount("bolt");
    while (t < 240) {
      keys.KeyD = keys.KeyA = keys.KeyW = keys.KeyS = false; keys.ControlLeft = careful;
      const tx = Math.floor(P.x / T), ty = Math.floor(P.y / T), vc = Dungeon.center(L.vault.tx, L.vault.ty);
      if (Math.hypot(vc.x - P.x, vc.y - P.y) < 40) { spent = ammo0 - (invCount("ammo") + invCount("bolt")); Dungeon.openVault(); result = "vault"; break; }
      // ближайший видимый враг
      let target = null, td = 1e9; for (const e of Dungeon.enemies) { const d = Math.hypot(e.x - P.x, e.y - P.y); if (d < 280 && d < td && Dungeon.los(P.x, P.y, e.x, e.y) && (!careful || e.state === "hunt" || !!CFG.weapons[P.weapon].ambush) && !(e.c.kind === "shade" && e.alpha() < 0.2 && e.state !== "hunt")) { target = e; td = d; } }
      if (P.hp < 40 && invCount("medkit") > 0 && meds < 4) { useItem("medkit"); meds++; }
      if (target) {
        P.ang = Math.atan2(target.y - P.y, target.x - P.x);
        const w0 = CFG.weapons[P.weapon]; const need = (w0.ammo || "ammo");
        if (P.cd <= 0 && invCount(need) > 0) { shoot(); shots++; }
        // против стрелка и разбега бот не двигается: стоит и стреляет; против остальных — тоже (без уклонения)
      } else {
        let best = null, bd = vd[ty * w + tx];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const v = vd[(ty + dy) * w + tx + dx]; if (v < bd) { bd = v; best = [dx, dy]; } }
        if (best) { const c = Dungeon.center(tx + best[0], ty + best[1]), ex = c.x - P.x, ey = c.y - P.y; if (Math.abs(ex) > 4) { keys[ex > 0 ? "KeyD" : "KeyA"] = true; } if (Math.abs(ey) > 4) { keys[ey > 0 ? "KeyS" : "KeyW"] = true; } }
      }
      update(dt); t += dt; minHp = Math.min(minHp, P.hp);
      if (G.dead) { result = "dead"; break; }
    }
    return { result, t, hp: Math.max(0, P.hp), minHp: Math.max(0, minHp), lost: 100 - Math.max(0, P.hp), meds, kills: P.kills, enemies: enemies0, shots, ammo: result === "vault" ? spent : ammo0 - (invCount("ammo") + invCount("bolt")), types, dealt, grab: 0 };
  } finally { if (globalThis.__hurt0) P.hurt = globalThis.__hurt0; Math.random = orig; G.dead = false; P.dead = false; W.danger = World.prototype.danger; }
})()`);

// Первый прогон одноразово собирает лагерь и спрайты (тратит случайные числа) — прогреваем, чтобы результаты не зависели от порядка
runOne(1, 1, false, {});

// Серия прогонов: n штук на сектор
function simulate({ danger, n = 20, careful = false, opts = {}, seed0 = 1 }) {
  const rows = []; for (let i = 0; i < n; i++) rows.push(JSON.parse(JSON.stringify(runOne(seed0 + i * 7919, danger, careful, Object.assign({ world: 1000 + i * 37 }, opts)))));
  const ok = rows.filter(r => r.result === "vault"), avg = (a, k) => a.reduce((s, r) => s + r[k], 0) / (a.length || 1);
  return { danger, n, careful, success: ok.length / n, deaths: rows.filter(r => r.result === "dead").length / n, timeouts: rows.filter(r => r.result === "timeout").length / n,
    hpLost: avg(rows, "lost"), hpLostOk: avg(ok, "lost"), time: avg(ok, "t"), meds: avg(rows, "meds"), kills: avg(rows, "kills"), enemies: avg(rows, "enemies"), ammo: avg(rows, "ammo"), rows };
}

module.exports = { simulate, runOne, CFG, z };

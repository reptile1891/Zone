"use strict";
// «Обочина» v0.12: цепочка «Нижний ярус» — записки экспедиции Штейна в сейфах трёх бункеров.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createZone } = require("./zone-load");

const z = createZone();
const CFG = z.get("CFG");
const run = code => JSON.parse(JSON.stringify(z.run(code) ?? null));
const fresh = () => z.run(`(() => {
  W = new World(1234); resetPlayer(); P.stash = []; P.bld = null; Mutants.spawn(); Stalkers.spawn(); Meta.reset(); Camp.enter(true); Dungeon.levels = {};
  G.events = []; G.dead = false; G.scene = "zone"; G.emi = { s: "calm", left: 0, next: 99999 }; G.t = 5; P.hp = 100; P.money = 1000; P.inv = []; P.quests = []; P.offers = []; P.notes = []; P.lore = 0; P.rep = 0;
  P.chainDone = false; P.deepDone = false; Stalkers.list = []; Mutants.list = []; localStorage.removeItem("zone_save_v2");
})()`);

test("конфиг: три записки Штейна, награда «Эхо» не встречается в аномалиях", () => {
  assert.equal(CFG.deepNotes.length, 3); assert.ok(CFG.deepNotes.every(t => /Штейн/.test(t)));
  assert.ok(CFG.arts.echo && CFG.arts.echo.val <= 400);
  const wild = new Set(Object.values(CFG.anoms).flatMap(a => a.arts)); assert.ok(!wild.has("echo"), "эхо — только награда");
});

test("предложение появляется только после цепочки «Сумерки», один раз, не дублируется", () => {
  fresh();
  const o = run(`(() => {
    const has = () => P.offers.some(o => o.type === "deep"); const orig = Math.random; let before = 0, after = 0;
    Math.random = () => 0.1; try { for (let i = 0; i < 5; i++) { Meta.genOffers(); if (has()) before++; } P.chainDone = true; for (let i = 0; i < 5; i++) { Meta.genOffers(); if (has()) after++; }
      const q = P.offers.find(o => o.type === "deep"); P.quests = [q]; Meta.genOffers(); const dup = has(); P.quests = []; P.deepDone = true; Meta.genOffers(); const done = has(); return { before, after, dup, done }; } finally { Math.random = orig; }
  })()`);
  assert.equal(o.before, 0); assert.equal(o.after, 5); assert.equal(o.dup, false); assert.equal(o.done, false);
});

test("предложение: три разных бункера от мелкого сектора к глубокому, первый отмечен на карте", () => {
  fresh();
  const o = run(`(() => {
    const q = Meta.makeOffer("deep"), d = q.bunks.map(i => W.danger(W.bunkers[i].x, W.bunkers[i].y)), b0 = W.bunkers[q.bunks[0]];
    return { q, distinct: new Set(q.bunks).size, d, known: b0.known, atFirst: q.x === b0.x && q.y === b0.y, text: Meta.progText(q) };
  })()`);
  assert.equal(o.distinct, 3); assert.ok(o.d[0] <= o.d[1] && o.d[1] <= o.d[2], "сектора растут: " + o.d); assert.ok(o.known && o.atFirst); assert.equal(o.q.reward, 520); assert.deepEqual(o.q.item, ["art", "echo"]);
  assert.match(o.text, /этап 1\/3/);
});

test("этапы: сейф чужого бункера не засчитывается; правильный — записка в журнал, следующий бункер на карте; после третьего — сдача", () => {
  fresh();
  const o = run(`(() => {
    const q = Meta.makeOffer("deep"); P.quests = [q]; const B = i => W.bunkers[q.bunks[i]], other = W.bunkers.find(b => !q.bunks.includes(b.i));
    Meta.onVault(other); const wrong = { stage: q.stage, notes: P.notes.length };
    Meta.onVault(B(1)); const skipped = q.stage;                       // не по порядку
    Meta.onVault(B(0)); const s1 = { stage: q.stage, notes: P.notes.map(n => n.txt), next: B(1).known, at: q.x === B(1).x && q.y === B(1).y, xp: P.xp };
    Meta.onVault(B(0)); const repeat = q.stage; Meta.onVault(B(1)); const s2 = { stage: q.stage, next: B(2).known, at: q.x === B(2).x };
    const mid = Meta.done(q); Meta.onVault(B(2)); const s3 = { stage: q.stage, x: q.x, done: Meta.done(q), text: Meta.progText(q), notes: P.notes.length };
    return { wrong, skipped, s1, repeat, s2, mid, s3 };
  })()`);
  assert.deepEqual(o.wrong, { stage: 0, notes: 0 }); assert.equal(o.skipped, 0); assert.equal(o.s1.stage, 1); assert.deepEqual(o.s1.notes, [CFG.deepNotes[0]]); assert.ok(o.s1.next && o.s1.at);
  assert.equal(o.repeat, 1); assert.equal(o.s2.stage, 2); assert.ok(o.s2.next && o.s2.at); assert.equal(o.mid, false);
  assert.equal(o.s3.stage, 3); assert.equal(o.s3.x, null); assert.equal(o.s3.done, true); assert.match(o.s3.text, /сдай Сидору/); assert.equal(o.s3.notes, 3);
});

test("реальный путь: вскрытие сейфа в подземелье двигает цепочку, метка видна только у цели; повторно сейф не засчитывается", () => {
  fresh();
  const o = run(`(() => {
    const q = Meta.makeOffer("deep"); P.quests = [q]; const b = W.bunkers[q.bunks[0]], other = W.bunkers.find(x => !q.bunks.includes(x.i));
    Dungeon.enter(other); const otherMark = Dungeon.storyTarget(); Dungeon.leave();
    Dungeon.enter(b); const mark = Dungeon.storyTarget(), logs = document.getElementById("log") ? 1 : 1; Dungeon.openVault(); const after = { stage: q.stage, mark: Dungeon.storyTarget(), notes: P.notes.length };
    Dungeon.openVault(); return { otherMark, mark, after, again: q.stage };
  })()`);
  assert.equal(o.otherMark, false); assert.equal(o.mark, true); assert.equal(o.after.stage, 1); assert.equal(o.after.mark, false); assert.equal(o.after.notes, 1); assert.equal(o.again, 1);
});

test("сдача: артефакт «Эхо», деньги, репутация, два знания, исследование; цепочка не предлагается снова", () => {
  fresh();
  const o = run(`(() => {
    P.chainDone = true; const q = Meta.makeOffer("deep"); q.stage = 3; q.x = null; q.y = null; P.quests = [q]; P.rep = 0; P.karma.study = 0; P.lore = 0; const m0 = P.money;
    const ok = Meta.done(q); Meta.turnIn(0); const orig = Math.random; Math.random = () => 0.1; try { Meta.genOffers(); } finally { Math.random = orig; }
    return { ok, paid: P.money - m0, rep: P.rep, lore: P.lore, study: P.karma.study, art: P.inv.filter(s => s.art).map(s => s.art), deepDone: P.deepDone, again: P.offers.some(o => o.type === "deep"), quests: P.quests.length };
  })()`);
  assert.ok(o.ok); assert.equal(o.paid, 520); assert.equal(o.rep, 14); assert.equal(o.lore, 3, "два от цепочки и одно от сдачи задания"); assert.equal(o.study, 2); assert.deepEqual(o.art, ["echo"]);
  assert.equal(o.deepDone, true); assert.equal(o.again, false); assert.equal(o.quests, 0);
});

test("«Эхо» опознаётся, работает: мутанты замечают хуже, раны затягиваются; в подсказке — эффекты", () => {
  fresh();
  const o = run(`(() => { P.known.echo = true; P.equip = ["echo", null]; return { repel: fx("repel"), regen: fx("hpRegen"), tip: Tip.art("echo"), val: CFG.arts.echo.val }; })()`);
  assert.equal(o.repel, 1); assert.equal(o.regen, 1); assert.match(o.tip.replace(/<[^>]+>/g, " "), /Мутанты хуже замечают/);
});

test("награды не утекают: артефакты-задания и сейфы никогда не выдают «Эхо»", () => {
  fresh();
  const o = run(`(() => {
    const wild = Meta.wildArts(); const fetched = new Set(); for (let i = 0; i < 300; i++) fetched.add(Meta.makeOffer("fetch").art);
    const vault = new Set(); for (const b of W.bunkers) { Dungeon.cur = b; Dungeon.lvl = Dungeon.level(b); for (let g = 0; g < 8; g++) { b.gen = g; vault.add(Dungeon.vaultLoot(b).find(x => x[0] === "art")[1]); } }
    return { wildHasEcho: wild.includes("echo"), wildHasDud: wild.includes("dud"), fetchEcho: fetched.has("echo"), vaultEcho: vault.has("echo"), vaultDud: vault.has("dud"), n: wild.length };
  })()`);
  assert.equal(o.wildHasEcho, false); assert.equal(o.wildHasDud, false); assert.equal(o.fetchEcho, false); assert.equal(o.vaultEcho, false); assert.equal(o.vaultDud, false); assert.ok(o.n >= 10);
});

test("сохранение: прогресс цепочки и признак завершения переживают перезагрузку", () => {
  fresh();
  const o = run(`(() => {
    const q = Meta.makeOffer("deep"); P.quests = [q]; Meta.onVault(W.bunkers[q.bunks[0]]); Camp.enter(true); save(); W = null; load();
    const r = P.quests.find(x => x.type === "deep"); const a = { stage: r.stage, bunks: r.bunks.length, notes: P.notes.length };
    P.deepDone = true; Camp.enter(true); save(); W = null; load(); return { a, done: P.deepDone };
  })()`);
  assert.deepEqual(o.a, { stage: 1, bunks: 3, notes: 1 }); assert.equal(o.done, true);
});

test("журнал: цепочка «Нижний ярус» видна с описанием", () => {
  fresh();
  const o = run(`(() => { const q = Meta.makeOffer("deep"); P.quests = [q]; return Meta.journalHTML(); })()`);
  assert.match(o.replace(/<[^>]+>/g, " "), /Нижний ярус/);
});

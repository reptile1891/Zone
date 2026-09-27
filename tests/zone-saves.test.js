"use strict";
// v0.22: слоты сохранений, экспорт и импорт кодом.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createZone } = require("./zone-load");

const z = createZone();
z.sandbox.btoa = s => Buffer.from(s, "binary").toString("base64");
z.sandbox.atob = s => Buffer.from(s, "base64").toString("binary");
const run = code => JSON.parse(JSON.stringify(z.run(code) ?? null));
const fresh = () => z.run(`(() => {
  for (const k of Saves.KEYS.concat(["zone_slot"])) localStorage.removeItem(k); Saves.blocked = false;
  W = new World(1234); resetPlayer(); P.stash = []; P.bld = null; Mutants.spawn(); Stalkers.spawn(); Meta.reset(); Camp.enter(true);
  G.events = []; G.dead = false; G.started = true; G.ui = null; G.scene = "camp"; G.emi = { s: "calm", left: 0, next: 99999 }; G.t = 5;
})()`);

test("слоты: по умолчанию первый со старым ключом, у каждого слота своё сохранение, мусор в настройке — первый слот", () => {
  fresh();
  const o = run(`(() => {
    const k0 = saveKey(); P.money = 111; save(); Saves.setSlot(1); const k1 = saveKey(); P.money = 222; save(); Saves.setSlot(2); const k2 = saveKey(); const empty = Saves.info(2);
    localStorage.setItem("zone_slot", "77"); const bad = saveKey(); localStorage.setItem("zone_slot", "abc"); const bad2 = saveKey();
    Saves.setSlot(0); load(); const m0 = P.money; Saves.setSlot(1); load(); const m1 = P.money;
    return { k0, k1, k2, empty, bad, bad2, m0, m1, i0: Saves.info(0), i1: Saves.info(1) };
  })()`);
  assert.equal(o.k0, "zone_save_v2"); assert.equal(o.k1, "zone_save_v2_s2"); assert.equal(o.k2, "zone_save_v2_s3"); assert.equal(o.empty, "пусто"); assert.equal(o.bad, "zone_save_v2"); assert.equal(o.bad2, "zone_save_v2");
  assert.equal(o.m0, 111); assert.equal(o.m1, 222); assert.match(o.i0, /Ур\. 1 · 111 ₽ · день \d+/); assert.match(o.i1, /222 ₽/);
});

test("код: туда и обратно (с русскими буквами), понятные ошибки на мусор, неполный код и чужой формат", () => {
  fresh();
  const o = run(`(() => {
    const json = JSON.stringify({ seed: 5, P: { inv: [], sk: {}, notes: [{ txt: "Записка: привет, Зона ☢" }] } }), code = Saves.encode(json);
    const back = Saves.decode("  " + code.slice(0, 20) + " " + code.slice(20) + " ");
    const err = t => { try { Saves.decode(t); return "ok"; } catch (e) { return e.message; } };
    return { code: code.slice(0, 4), same: back === json, e1: err(""), e2: err("hello"), e3: err("OB1:@@@@"), e4: err("OB1:" + Saves.b64("не json")), e5: err("OB1:" + Saves.b64("{\\"a\\":1}")), e6: err(code.slice(0, 30)) };
  })()`);
  assert.equal(o.code, "OB1:"); assert.equal(o.same, true); assert.match(o.e1, /не код сохранения/); assert.match(o.e2, /не код сохранения/); assert.match(o.e3, /повреждён/); assert.match(o.e4, /повреждён/); assert.match(o.e5, /нет данных игры/); assert.match(o.e6, /повреждён|нет данных/);
});

test("экспорт → импорт в другой слот даёт то же сохранение; плохой код слот не трогает; пустой слот не экспортируется", () => {
  fresh();
  const o = run(`(() => {
    P.money = 4321; invAdd("art", 1, "soul", 1.2); P.known.soul = true; Codex.see("m", "tin", 1); save(); const code = Saves.exportText(0);
    Saves.setSlot(2); const before = Saves.info(2); let emptyErr = ""; try { Saves.exportText(2); } catch (e) { emptyErr = e.message; }
    let badErr = ""; try { Saves.importText("OB1:!!!"); } catch (e) { badErr = e.message; } const untouched = localStorage.getItem(saveKey());
    Saves.importText(code); resetPlayer(); load(); const art = P.inv.find(s => s.art === "soul");
    return { before, emptyErr, badErr, untouched, money: P.money, q: art && art.q, tin: P.codex.m.tin && P.codex.m.tin.n, info: Saves.info(2), slot0: Saves.info(0) };
  })()`);
  assert.equal(o.before, "пусто"); assert.match(o.emptyErr, /нет сохранения/); assert.match(o.badErr, /повреждён/); assert.equal(o.untouched, null);
  assert.equal(o.money, 4321); assert.equal(o.q, 1.2); assert.equal(o.tin, 1); assert.match(o.info, /4321 ₽/); assert.match(o.slot0, /4321 ₽/);
});

test("блокировка автосохранения после импорта и строки меню", () => {
  fresh();
  const o = run(`(() => {
    P.money = 10; save(); const a = localStorage.getItem(saveKey()); Saves.blocked = true; P.money = 999; save(true); const b = localStorage.getItem(saveKey()); Saves.blocked = false;
    G.ui = { k: "menu" }; const html = menuHTML(G.ui); let opened = []; const _m = Saves.modal; Saves.modal = mode => opened.push(mode); Meta.click("svexp", undefined, undefined, G.ui); Meta.click("svimp", undefined, undefined, G.ui); Saves.modal = _m;
    return { same: a === b, html, opened };
  })()`);
  assert.equal(o.same, true, "при блокировке сохранение не перезаписывается"); assert.match(o.html, /Слот сохранения: <b>1<\/b>/); assert.match(o.html, /data-a="svexp"/); assert.match(o.html, /data-a="svimp"/); assert.deepEqual(o.opened, ["exp", "imp"]);
});

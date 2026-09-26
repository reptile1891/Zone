"use strict";
// Загрузка скриптов «Обочины» в песочницу vm (см. load.js). Порядок — как в index.html.
const vm = require("vm");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function stub() {
  const fn = function () {};
  return new Proxy(fn, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === "length" ? 0 : stub()),
    set: () => true,
    apply: () => stub(),
    construct: () => stub(),
  });
}

function scriptList() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  return [...html.matchAll(/<script src="([\w.]+\.js)">/g)].map(m => m[1]);
}

function createZone() {
  const store = new Map();
  const sandbox = {
    console, Math, Date, JSON, Object, Array, Map, Set, Uint8Array, Float32Array, Number, String, Symbol, Promise, Error,
    parseInt, parseFloat, isNaN, setTimeout, clearTimeout,
    performance: { now: () => Date.now() },
    requestAnimationFrame: () => 0,
    innerWidth: 1280, innerHeight: 720,
    navigator: {},
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    document: { getElementById: stub, createElement: stub, addEventListener() {}, body: stub(), hidden: false },
    AudioContext: stub(), webkitAudioContext: stub(),
  };
  sandbox.window = sandbox;
  sandbox.addEventListener = () => {};
  vm.createContext(sandbox);
  for (const f of scriptList()) {
    const file = path.join(ROOT, f);
    vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });
  }
  return { sandbox, get: expr => vm.runInContext(expr, sandbox), run: code => vm.runInContext(code, sandbox) };
}

module.exports = { createZone, scriptList };

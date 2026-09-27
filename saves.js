'use strict';
// Слоты сохранений, экспорт и импорт кодом (перенос между устройствами).
//  • три слота: localStorage 'zone_save_v2' (первый, как раньше), 'zone_save_v2_s2', 'zone_save_v2_s3'; выбранный номер — 'zone_slot';
//    слот выбирают на заставке, main.js берёт ключ через saveKey();
//  • экспорт: код вида «OB1:<base64 от JSON сохранения>» — скопировать или скачать файлом (меню игры → Экспорт);
//  • импорт: вставить код или выбрать файл (заставка → Импорт, или меню) — заменяет выбранный слот и перезапускает страницу.
const Saves = {
  KEYS: ['zone_save_v2', 'zone_save_v2_s2', 'zone_save_v2_s3'],
  PREFIX: 'OB1:',
  blocked: false,          // после импорта страница перезагружается: автосохранение не должно затереть только что загруженное
  slot() { try { const n = +localStorage.getItem('zone_slot'); return n >= 0 && n < this.KEYS.length ? n : 0; } catch (e) { return 0; } },
  setSlot(i) { try { localStorage.setItem('zone_slot', String(i)); } catch (e) { /* без хранилища слоты не нужны */ } },
  key() { return this.KEYS[this.slot()]; },
  read(i) { try { const s = localStorage.getItem(this.KEYS[i]); return s ? JSON.parse(s) : null; } catch (e) { return null; } },
  info(i) {
    const s = this.read(i); if (!s || !s.P) return 'пусто';
    const day = Math.floor((s.clock || 0) / CFG.time.dayLen) + 1;
    return 'Ур. ' + (s.P.lvl || 1) + ' · ' + Math.round(s.P.money || 0) + ' ₽ · день ' + day;
  },

  // ---------- код сохранения ----------
  b64(str) { const enc = unescape(encodeURIComponent(str)); return typeof btoa === 'function' ? btoa(enc) : Buffer.from(enc, 'binary').toString('base64'); },
  unb64(b) { const raw = typeof atob === 'function' ? atob(b) : Buffer.from(b, 'base64').toString('binary'); return decodeURIComponent(escape(raw)); },
  encode(json) { return this.PREFIX + this.b64(json); },
  // Возвращает строку JSON или бросает Error с понятным текстом
  decode(text) {
    const t = String(text || '').replace(/\s+/g, '');
    if (!t.startsWith(this.PREFIX)) throw new Error('Это не код сохранения «Обочины» (должен начинаться с ' + this.PREFIX + ').');
    let json; try { json = this.unb64(t.slice(this.PREFIX.length)); } catch (e) { throw new Error('Код повреждён: не удалось прочитать.'); }
    let o; try { o = JSON.parse(json); } catch (e) { throw new Error('Код повреждён: внутри не сохранение.'); }
    if (!o || o.seed === undefined || !o.P || !Array.isArray(o.P.inv) || !o.P.sk) throw new Error('В коде нет данных игры (возможно, он неполный).');
    return json;
  },
  exportText(i = this.slot()) { const raw = localStorage.getItem(this.KEYS[i]); if (!raw) throw new Error('В слоте ' + (i + 1) + ' нет сохранения. Сохранитесь в лагере и повторите.'); return this.encode(raw); },
  // Кладёт сохранение в слот i. Возвращает true; выбрасывает Error, если код плохой
  importText(text, i = this.slot()) { const json = this.decode(text); localStorage.setItem(this.KEYS[i], json); return true; },

  // ---------- окно экспорта/импорта ----------
  el(tag, css, html, parent) { const e = document.createElement(tag); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; (parent || document.body).appendChild(e); return e; },
  modal(mode) {
    this.closeModal(); const B = 'padding:8px 14px;border:1px solid #6a5a34;background:#231f14;color:#c9c2a8;font:inherit;cursor:pointer;margin:4px 6px 0 0';
    const m = this.m = this.el('div', 'position:fixed;inset:0;z-index:40;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;padding:12px');
    const box = this.el('div', 'background:#10120e;border:1px solid #4a4634;padding:14px;width:min(560px,96vw);max-height:96vh;overflow:auto;color:#c9c2a8;font:14px/1.4 Consolas,monospace', '', m);
    const slot = this.slot();
    this.el('div', 'color:#b5742a;font-size:16px;margin-bottom:6px', mode === 'exp' ? 'Экспорт сохранения (слот ' + (slot + 1) + ')' : 'Импорт сохранения в слот ' + (slot + 1), box);
    const note = this.el('div', 'color:#7d7864;margin-bottom:6px', mode === 'exp' ? 'Скопируйте код или скачайте файл и загрузите его на другом устройстве: заставка → «Импорт».' : 'Вставьте код или выберите файл, потом «Загрузить». Сохранение в этом слоте будет заменено.', box);
    const ta = this.ta = this.el('textarea', 'width:100%;height:120px;background:#0a0b08;color:#c9c2a8;border:1px solid #4a4634;font:12px Consolas,monospace;user-select:text;padding:6px', '', box);
    const msg = this.msg = this.el('div', 'margin:6px 0;min-height:1.4em', '', box), row = this.el('div', '', '', box);
    const btn = (t, fn) => { const b = this.el('button', B, t, row); b.onclick = fn; return b; }, say = (t, ok) => { msg.style.color = ok ? '#8fbf7f' : '#e0a060'; msg.textContent = t; };
    if (mode === 'exp') {
      try { ta.value = this.exportText(); ta.readOnly = true; } catch (e) { say(e.message, false); }
      btn('Копировать', () => { ta.select(); try { (navigator.clipboard ? navigator.clipboard.writeText(ta.value) : Promise.reject()).then(() => say('Скопировано.', true), () => { document.execCommand('copy'); say('Скопировано.', true); }); } catch (e) { say('Выделите код и скопируйте вручную.', false); } });
      btn('Скачать файл', () => { try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ta.value], { type: 'text/plain' })); a.download = 'obochina-save-slot' + (slot + 1) + '.txt'; a.click(); say('Файл сохранён.', true); } catch (e) { say('Не удалось скачать: скопируйте код.', false); } });
    } else {
      const file = this.el('input', 'display:none', '', box); file.type = 'file'; file.accept = '.txt,text/plain';
      file.onchange = () => { const f = file.files && file.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { ta.value = String(r.result || ''); say('Файл прочитан, нажмите «Загрузить».', true); }; r.readAsText(f); };
      btn('Выбрать файл…', () => file.click());
      let armed = false;
      btn('Загрузить', () => {
        try {
          this.decode(ta.value);
          if (this.read(slot) && !armed) { armed = true; say('В слоте ' + (slot + 1) + ' уже есть сохранение (' + this.info(slot) + '). Нажмите «Загрузить» ещё раз, чтобы заменить.', false); return; }
          this.importText(ta.value); this.blocked = true; say('Готово. Перезапуск…', true); setTimeout(() => location.reload(), 400);
        } catch (e) { say(e.message, false); }
      });
    }
    btn('Закрыть', () => this.closeModal());
    return m;
  },
  closeModal() { if (this.m && this.m.parentNode) this.m.parentNode.removeChild(this.m); this.m = null; },

  // ---------- надёжность хранилища ----------
  // Проверка «прямо сейчас» — не ловит главный случай (файл открыт как content://вложение в чате: при
  // каждом новом открытии браузер может завести новое хранилище) — тот определяется по протоколу ниже.
  storageOk() { try { const k = '__zone_probe__'; localStorage.setItem(k, '1'); const ok = localStorage.getItem(k) === '1'; localStorage.removeItem(k); return ok; } catch (e) { return false; } },
  originRisky() { try { return !/^https?:$/.test(location.protocol); } catch (e) { return true; } },

  // ---------- заставка и меню ----------
  refresh() {
    const bar = this.bar; if (!bar) return; const cur = this.slot();
    bar.innerHTML = this.KEYS.map((k, i) => '<button class="btn" data-slot="' + i + '" style="min-width:150px;font-size:13px;' + (i === cur ? 'border-color:#b5742a;background:#3a2f16;color:#f0d9a0' : '') + '">Слот ' + (i + 1) + '<br><span style="color:#7d7864">' + this.info(i) + '</span></button>').join('') + '<button class="btn" data-slot="imp" style="font-size:13px">⤒ Импорт<br><span style="color:#7d7864">по коду или файлу</span></button>';
    const cont = document.getElementById('bCont'); if (cont) cont.style.display = this.read(cur) ? '' : 'none';
  },
  initSplash() {
    const cont = document.getElementById('bCont'); if (!cont || !cont.parentNode || !cont.parentNode.parentNode) return;
    if (this.originRisky() || !this.storageOk()) {
      const warn = document.createElement('div'); warn.id = 'storagewarn';
      warn.style.cssText = 'max-width:640px;margin:4px auto 8px;padding:8px 12px;border:1px solid #6a5a34;background:#2a2010;color:#e0c090;font-size:12px;text-align:left;line-height:1.5';
      warn.innerHTML = '⚠ Игра открыта не как обычная веб-страница (например, файл прямо из чата) — сохранения могут пропадать между запусками. Надёжнее играть по ссылке: <a href="https://reptile1891.github.io/Zone/" style="color:#f0d9a0" target="_blank" rel="noopener">reptile1891.github.io/Zone</a>. Если играете здесь — периодически делайте «Экспорт» в меню (Esc → слот сохранения) и сохраняйте код отдельно.';
      cont.parentNode.parentNode.insertBefore(warn, cont.parentNode);
    }
    const bar = this.bar = document.createElement('div'); bar.id = 'slotbar'; bar.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin:8px 0';
    cont.parentNode.parentNode.insertBefore(bar, cont.parentNode);
    bar.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-slot]'); if (!b) return; if (b.dataset.slot === 'imp') this.modal('imp'); else { this.setSlot(+b.dataset.slot); this.refresh(); } });
    this.refresh();
  },
  menuRows() {
    return '<div class="row"><div class="nm">Слот сохранения: <b>' + (this.slot() + 1) + '</b><div class="sub">перенос на другое устройство — экспорт и импорт кодом</div></div>' + btn('svexp', 'Экспорт') + btn('svimp', 'Импорт') + '</div>';
  },
};

(function () {
  const _click = Meta.click; Meta.click = function (a, arg, arg2, u) {
    if (a === 'svexp') { if (inCamp() && G.scene !== 'dungeon') save(); Saves.modal('exp'); return true; }
    if (a === 'svimp') { Saves.modal('imp'); return true; }
    return _click.call(this, a, arg, arg2, u);
  };
  try { if (typeof document !== 'undefined' && document.getElementById) Saves.initSplash(); } catch (e) { /* без заставки (тесты) */ }
})();

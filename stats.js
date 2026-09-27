'use strict';
// Статистика и долгие цели: счётчики за всё время (P.st), сводка каждой вылазки (P.run → P.lastRun) и достижения (P.ach) с наградами.
// Панель — клавиша K (на телефоне 🏆). Сводка показывается при возвращении в лагерь, короткая строка — на экране смерти.
const Stats = {
  // достижения: n — счётчик из P.st (или функция), lv — ступени [порог, название, награда ₽]; xp/rep добавляются по ступени
  ACH: [
    { id: 'kills', name: 'Охотник', d: 'Убить мутантов и бандитов', get: () => P.st.kills, lv: [[10, 'Новичок', 60], [50, 'Истребитель', 180], [200, 'Гроза Зоны', 600]] },
    { id: 'arts', name: 'Собиратель', d: 'Поднять артефакты', get: () => P.st.arts, lv: [[1, 'Первая находка', 40], [10, 'Коллекционер', 200], [30, 'Хранитель', 700]] },
    { id: 'hook', name: 'Без царапины', d: 'Достать артефакты Крюком-кошкой', get: () => P.st.hook, lv: [[3, 'Ловкие руки', 100], [15, 'Рыбак', 350]] },
    { id: 'anomkills', name: 'Зона за нас', d: 'Существа, погибшие в аномалиях', get: () => P.st.anomKills, lv: [[3, 'Ловушка', 100], [15, 'Мастер западни', 350]] },
    { id: 'depth', name: 'Всё глубже', d: 'Самый глубокий сектор', get: () => P.st.sector, lv: [[2, 'За первой чертой', 60], [3, 'В глубине', 200], [4, 'В сердце Зоны', 500]] },
    { id: 'runs', name: 'Вернулся', d: 'Вылазки, из которых вернулся живым', get: () => P.st.runs, lv: [[5, 'Обвыкся', 80], [25, 'Бывалый', 300], [80, 'Старожил', 900]] },
    { id: 'walk', name: 'Пешеход', d: 'Пройдено километров по Зоне', get: () => Math.floor(P.st.dist / 1000), lv: [[5, 'Разведчик', 80], [30, 'Следопыт', 300]] },
    { id: 'emi', name: 'Пережил выброс', d: 'Выбросы, встреченные вне лагеря', get: () => P.st.emis, lv: [[1, 'Крещение', 80], [8, 'Не боюсь сирены', 350]] },
    { id: 'events', name: 'Случай в Зоне', d: 'События Зоны: груз, засады, всплески, коробейники', get: () => P.st.events, lv: [[3, 'Везунчик', 100], [12, 'Ходок по слухам', 400]] },
    { id: 'anoms', name: 'Знаток аномалий', d: 'Изучено аномалий в справочнике', get: () => Object.keys(P.codex.a || {}).length, lv: [[5, 'Наблюдатель', 100], [Object.keys(CFG.anoms).length, 'Аномальщик', 400]] },
    { id: 'rep', name: 'Своя среди своих', d: 'Репутация в лагере', get: () => Math.max(0, P.rep | 0), lv: [[15, 'Свой', 150], [40, 'Легенда лагеря', 600]] },
  ],
  blank() { return { kills: 0, arts: 0, hook: 0, anomKills: 0, sector: 1, runs: 0, deaths: 0, dist: 0, emis: 0, events: 0, dmg: 0 }; },
  ensure() {
    if (!P.st) P.st = this.blank(); else for (const k in this.blank()) if (P.st[k] == null) P.st[k] = this.blank()[k];
    if (!P.ach) P.ach = {};
    if (P.run === undefined) P.run = null;
  },
  // ---- вылазка ----
  begin() { this.ensure(); P.run = { c0: G.clock, m0: P.money, kills: 0, arts: 0, hook: 0, anomKills: 0, dmg: 0, dist: 0, sector: 1, events: 0 }; this._px = null; },
  on(k, n = 1) { this.ensure(); P.st[k] = (P.st[k] || 0) + n; if (P.run && P.run[k] != null) P.run[k] += n; this.check(); },
  // сводка вылазки: время — в игровых минутах
  summary(kind) {
    const r = P.run; if (!r) return null;
    return { kind, mins: Math.max(1, Math.round((G.clock - r.c0) * 24 * 60 / CFG.time.dayLen)), kills: r.kills, arts: r.arts, hook: r.hook, anomKills: r.anomKills, dmg: Math.round(r.dmg), km: Math.round(r.dist / 100) / 10, sector: r.sector, events: r.events, m0: r.m0, m1: P.money };
  },
  finish(kind) {
    this.ensure(); const s = this.summary(kind); if (!s) return null;
    P.run = null; P.lastRun = s;
    if (kind === 'back') { P.st.runs++; this.check(); } else P.st.deaths++;
    return s;
  },
  line(s) { return s ? 'Вылазка: ' + s.mins + ' мин, убито ' + s.kills + ', артефактов ' + s.arts + ', получено урона ' + s.dmg + ', глубина — сектор ' + s.sector + '.' : ''; },
  // ---- достижения ----
  level(a) { const v = a.get(); let n = 0; for (const l of a.lv) if (v >= l[0]) n++; return n; },
  check() {
    this.ensure(); if (this._chk) return; this._chk = true;
    try {
      for (const a of this.ACH) {
        const have = P.ach[a.id] || 0, now = this.level(a);
        for (let i = have; i < now; i++) {
          const l = a.lv[i]; P.money += l[2]; addXp(20 + i * 30);
          log('★ Достижение: ' + a.name + ' — «' + l[1] + '»! +' + l[2] + ' ₽', '#f0d060'); Snd.achieve && Snd.achieve();
        }
        if (now > have) P.ach[a.id] = now;
      }
    } finally { this._chk = false; }
  },
  // ---- панель ----
  open() { this.ensure(); G.ui = { k: 'stats' }; renderPanel(); },
  bar(v, max) { const p = Math.min(100, Math.round(v / max * 100)); return '<div style="height:6px;background:#2a2a20;border-radius:3px;margin-top:3px"><div style="height:6px;width:' + p + '%;background:#b5742a;border-radius:3px"></div></div>'; },
  html() {
    this.ensure(); const s = P.st, L = P.lastRun, r = P.run ? this.summary('run') : null;
    let h = '<div class="x" data-a="close">✕ Esc</div><h2>Статистика и достижения</h2><div class="cols"><div>';
    const rows = (o) => o.map(([k, v]) => '<div class="row"><div class="nm">' + k + '</div><b>' + v + '</b></div>').join('');
    if (r) h += '<h3>Текущая вылазка</h3>' + rows([['Время', r.mins + ' мин'], ['Убито', r.kills], ['Артефактов', r.arts + (r.hook ? ' (крюком ' + r.hook + ')' : '')], ['Получено урона', r.dmg], ['Глубина', 'сектор ' + r.sector]]);
    if (L) h += '<h3>Прошлая вылазка' + (L.kind === 'dead' ? ' — погиб' : '') + '</h3>' + rows([['Время', L.mins + ' мин'], ['Убито', L.kills], ['Артефактов', L.arts], ['Деньги', L.m0 + ' → ' + L.m1 + ' ₽'], ['Пройдено', L.km + ' км'], ['Глубина', 'сектор ' + L.sector]]);
    h += '<h3>За всё время</h3>' + rows([['Вылазок', s.runs + (s.deaths ? ' (погиб ' + s.deaths + ')' : '')], ['Убито', s.kills], ['Артефактов', s.arts + (s.hook ? ' (крюком ' + s.hook + ')' : '')], ['Погибло в аномалиях', s.anomKills], ['Пройдено', (s.dist / 1000).toFixed(1) + ' км'], ['Выбросов', s.emis], ['Событий Зоны', s.events]]);
    h += '</div><div><h3>Достижения</h3>';
    for (const a of this.ACH) {
      const v = a.get(), n = this.level(a), next = a.lv[n], last = a.lv[Math.max(0, n - 1)];
      h += '<div class="row"><div class="ic">' + (n >= a.lv.length ? '★' : n ? '☆' : '·') + '</div><div class="nm">' + a.name + (n ? ' — ' + a.lv[n - 1][1] : '') + '<div class="sub">' + a.d + (next ? ' · ' + Math.min(v, next[0]) + '/' + next[0] + ' → «' + next[1] + '» +' + next[2] + ' ₽' : ' · всё получено') + '</div>' + (next ? this.bar(v, next[0]) : '') + '</div></div>';
    }
    return h + '</div></div>';
  },
};

(function () {
  const _rp = resetPlayer; resetPlayer = function () { _rp(); P.st = null; P.ach = null; P.run = null; P.lastRun = null; Stats.ensure(); };   // новая игра и загрузка начинают с чистого
  Stats.ensure();
  // счётчики: убийства игрока
  const _ok = Meta.onKill; Meta.onKill = function (kind) { if (kind !== 'bounty') Stats.on('kills'); return _ok.call(this, kind); };
  // артефакты (и как их достали)
  const _ta = takeArt; takeArt = function (a) { _ta(a); Stats.on('arts'); };
  // урон игроку
  const _ph = P.hurt; P.hurt = function (d, src) { const hp = this.hp; _ph.call(this, d, src); const lost = Math.max(0, hp - this.hp); if (lost > 0) { Stats.ensure(); P.st.dmg += lost; if (P.run) P.run.dmg += lost; } };
  // существа, погибшие в аномалиях
  const gone = function (e, name) { if (Math.hypot(e.x - P.x, e.y - P.y) < 520 && G.scene === 'zone') log(name + ' попал в аномалию и погиб.', '#9ad0a0'); Snd.at('zapdie', e.x, e.y); Stats.on('anomKills'); };
  const _md = Mutant.prototype.die; Mutant.prototype.die = function (src) { const was = this.dead; _md.call(this, src); if (!was && this.dead && src === 'anom') gone(this, this.c.name); };
  const _sd = Stalker.prototype.die; Stalker.prototype.die = function (src) { const was = this.dead; _sd.call(this, src); if (!was && this.dead && src === 'anom') gone(this, this.name || 'Сталкер'); };
  // выброс, встреченный вне лагеря
  const _oe = Meta.onEmission; Meta.onEmission = function () { if (!inCamp() && !G.dead && G.scene !== 'dungeon') Stats.on('emis'); return _oe.call(this); };
  // начало и конец вылазки
  const _dep = Camp.depart; Camp.depart = function () { _dep.call(this); Stats.begin(); };
  const _ent = Camp.enter; Camp.enter = function (silent) {
    const had = P.run && !silent && !G.dead; _ent.call(this, silent);
    if (had) { const s = Stats.finish('back'); if (s) { G.ui = { k: 'stats' }; renderPanel(); } }
  };
  const _die = die; die = function () { const was = G.dead; _die(); if (!was && G.dead) { const s = Stats.finish('dead'); if (s && $('deathtxt')) $('deathtxt').textContent += ' ' + Stats.line(s); } };
  // ходьба и глубина
  const _upd = update; update = function (dt) {
    _upd(dt);
    if (G.scene !== 'zone' || G.dead || inCamp()) { Stats._px = null; return; }
    Stats.ensure();
    if (Stats._px) { const d = Math.hypot(P.x - Stats._px.x, P.y - Stats._px.y); if (d < 60) { P.st.dist += d; if (P.run) P.run.dist += d; } }
    Stats._px = { x: P.x, y: P.y };
    if (Math.floor(G.t) !== Stats._sec) { Stats._sec = Math.floor(G.t); const sec = W.danger(P.x, P.y); if (P.run && sec > P.run.sector) { P.run.sector = sec; if (sec > 1) { Snd.sector(sec); log('Сектор ' + sec + ': опаснее, зато добыча богаче.', '#c8b070'); } } if (sec > P.st.sector) { P.st.sector = sec; Stats.check(); } if (!(Stats._sec % 10)) Stats.check(); }
  };
  // панель, клавиша
  const _render = Camp.render; Camp.render = function (u) { if (u.k === 'stats') { panel.style.display = 'block'; panel.innerHTML = Stats.html(); return true; } return _render.call(this, u); };
  if (typeof addEventListener === 'function') addEventListener('keydown', e => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName || '')) return;
    if (e.code !== 'KeyK' || e.repeat || !G.started || G.dead) return;
    if (G.ui && G.ui.k === 'stats') closePanel(); else if (!G.ui || G.ui.k !== 'menu') { closePanel(); Stats.open(); }
  });
})();

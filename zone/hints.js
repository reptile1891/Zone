'use strict';
// Контекстные советы: игра сама подсказывает по ситуации (перегруз, кровотечение, первая ночь, спуск в бункер…).
// Каждый совет показывается один раз за игру (P.hints), не чаще одного за ~6 секунд, не при открытой панели; выключатель — в меню.
// Срочные (repeat) повторяются не чаще раза в N секунд. Тексты зависят от состояния (нет аптечек — совет другой).
const Hint = {
  t: 0, quiet: 0, last: {},
  rules: [
    // ---- срочное: здоровье и состояния ----
    { id: 'emission', repeat: 240, when: () => G.emi.s === 'warn' && !isSheltered() && 'Сирена! В лагерь или в бункер (E у люка) — внизу выброс не бьёт. Времени мало.' },
    { id: 'grab', repeat: 60, when: () => P.grab > 0 && 'Тебя держат! Жми движение (рывок вдвое быстрее освобождает) или стреляй в Топляка — каждое попадание ослабляет хватку.' },
    { id: 'lowhp', when: () => P.hp < 35 && (invCount('medkit') > 0 ? 'Здоровье на исходе. Аптечка — слот 3 (колесо мыши или цифра 3, затем ЛКМ).' : 'Здоровье на исходе, а аптечек нет. Уходи в лагерь; регенерация идёт только пока сыт (>20) и радиации <40.') },
    { id: 'bleed', when: () => P.bleed > 0 && 'Кровотечение: аптечка останавливает сразу; иначе пройдёт само, но заберёт здоровье. После него возможно заражение.' },
    { id: 'fracture', when: () => P.fracture && 'Перелом: шина (слот 7) лечит. Без неё — медленнее, бег недоступен. Койка в казарме 2 уровня тоже лечит.' },
    { id: 'infect', when: () => P.infect > 0 && 'Заражение: антибиотик (Кум, снабжение) лечит. Организм справится сам, но не сразу и ценой здоровья.' },
    { id: 'burn', when: () => P.burn > 0 && 'Горишь! Потуши: вода, аптечка. Огнеупорный плащ снимает ожог на 60%. Не бегай по углям Углеглота.' },
    { id: 'rad', when: () => P.rad > 40 && 'Радиация растёт: антирад (слот 5) снимает 35. Выше 60 она отнимает здоровье. В лагере спадает сама.' },
    { id: 'food', when: () => P.food < 25 && 'Голод: еда — слот 4. Пока сытость ниже 20, здоровье не восстанавливается.' },
    { id: 'stress', when: () => P.stress > 70 && 'Напряжение высокое: мерещится всякое. Помогает костёр, койка, привал (E у палатки). Ночь и туман его копят.' },
    // ---- снаряжение ----
    { id: 'overweight', when: () => weight() > carryCap() && 'Перегруз: медленнее и шумнее. Лишнее — в ящик у Лёхи в лагере (или ↓ в рюкзаке). Навык «Грузоподъёмность» помогает.' },
    { id: 'noammo', when: () => G.scene !== 'camp' && G.scene !== 'interior' && invCount(CFG.weapons[P.weapon].ammo || 'ammo') < 1 && !(CFG.weapons[P.weapon].perAmmo && P.fuel > 0) && (CFG.weapons[P.weapon].ammo === 'bolt' ? 'Болты кончились. Они же нужны, чтобы проверять аномалии — держи запас.' : CFG.weapons[P.weapon].ammo === 'canister' ? 'Топливо кончилось: канистры у оружейника или на верстаке (ур. 3).' : 'Патронов нет. Патроны — у Ржавого в мастерской, ещё их находят в остовах и на трупах.') },
    { id: 'gunwear', when: () => P.cond[P.weapon] < 30 && 'Оружие изношено: возможны осечки и разброс. Ремонт — у Ржавого или ремкомплектом (слот из рюкзака).' },
    { id: 'unknownart', when: () => P.inv.some(s => s.art && !P.known[s.art]) && 'Неопознанный артефакт: отнеси Учёному (Лис) — опознание 20 ₽. Пока не опознан, в контейнер не положишь и продаёшь дёшево.' },
    { id: 'equipart', when: () => G.scene === 'camp' && P.equip.some(a => !a) && P.inv.some(s => s.art && P.known[s.art]) && 'Опознанный артефакт лучше носить: Tab → «В контейнер». Слоты можно докупить у Кума.' },
    { id: 'skillpoint', when: () => P.sp > 0 && 'Есть очко навыка: Tab → навыки → «+».' },
    // ---- обстановка ----
    { id: 'leave', when: () => G.scene === 'zone' && !inCamp() && Math.hypot(P.x - W.C.x, P.y - W.C.y) > W.C.r + 260 && 'Зона слушает. Болты — слот 2, ЛКМ: бросай вперёд, аномалии выдадут себя. ПКМ — осмотреться. M — карта. Красться — Ctrl.' },
    { id: 'night', when: () => G.scene === 'zone' && !inCamp() && G.night > 0.7 && 'Ночь: слухачи, гнилозубы и Углеглот. Крадись (Ctrl) — слухачи слепые, но слышат каждый шаг.' },
    { id: 'lake', when: () => G.scene === 'zone' && W.biomeAt(P.x, P.y) === 'lake' && 'Озёрный край: вода замедляет, а в озёрах живёт Топляк. Держись на шаг от кромки; схватит — рвись вбок.' },
    { id: 'burnt', when: () => G.scene === 'zone' && W.biomeAt(P.x, P.y) === 'burnt' && 'Гарь: тлеющие колодцы бьют конусом (виден клин заряда), Углеглот днём спит в золе. Огнеупорный плащ пригодится.' },
    { id: 'dungeon', when: () => G.scene === 'dungeon' && 'Под землёй темно, выброс не бьёт. Болты, приманки и шок-бомбы не работают. Тени слепы — иди тихо; Кислотника обходи за угол; Панцирника уводи с прямой.' },
    { id: 'vault', when: () => G.scene === 'dungeon' && Dungeon.cur && Dungeon.lvl && Math.hypot(Dungeon.center(Dungeon.lvl.vault.tx, Dungeon.lvl.vault.ty).x - P.x, Dungeon.center(Dungeon.lvl.vault.tx, Dungeon.lvl.vault.ty).y - P.y) < 150 && !Dungeon.cur.opened.includes(99) && 'Сейф рядом: E. Шум привлечёт остальных — сначала зачисть окрестности.' },
    { id: 'gate', when: () => G.scene === 'zone' && W.danger(P.x, P.y) >= 4 && !P.pass && P.rep < CFG.gate.rep && 'Сектор 4 закрыт: нужна репутация ' + CFG.gate.rep + ' или пропуск (Сидор, 250 ₽, репутация 5+). Иначе оцепление.' },
    // ---- лагерь ----
    { id: 'questdone', repeat: 90, when: () => (G.scene === 'camp' || G.scene === 'zone') && inCamp() && P.quests.some(q => Meta.done(q)) && 'Задание выполнено — сдай Сидору в баре (награда и репутация).' },
    { id: 'sell', when: () => G.scene === 'camp' && P.inv.some(s => !s.art && (CFG.items[s.id].junk || CFG.items[s.id].part)) && P.money < 150 && 'Хлам и трофеи продай Бороде (скупка), артефакты — ему или Лису. Деньги нужны на улучшения зданий.' },
  ],
  tick(dt) {
    if (!G.started || G.dead || P.hintsOff || G.ui) return;
    this.t -= dt; if (this.t > 0) return; this.t = 0.6; this.quiet -= 0.6; if (this.quiet > 0) return;
    if (!P.hints) P.hints = {};
    for (const r of this.rules) {
      const seen = P.hints[r.id]; if (seen && !(r.repeat && G.t - (this.last[r.id] || -1e9) > r.repeat)) continue;
      let txt = null; try { txt = r.when(); } catch (e) { txt = null; }
      if (txt) { this.say(r.id, txt); this.quiet = 6; return; }
    }
  },
  say(id, txt) { if (!P.hints) P.hints = {}; P.hints[id] = true; this.last[id] = G.t; log('💡 ' + txt, '#9ad0e8'); },
  reset() { P.hints = {}; this.last = {}; this.quiet = 0; },
};

// Пояснения к полоскам состояния (подсказка при наведении)
Tip.BAR = {
  b_hp: () => Tip.head('Здоровье', Math.round(P.hp) + ' / 100', '#d06060') + '<div class="ti-d">Восстанавливается само, пока сыт (>20) и радиация <40. Быстрее лечат аптечка, «Душа» и казарма. Ноль — смерть.</div>' + (P.bleed > 0 ? Tip.row('', 'кровотечение: отнимает здоровье', '#e06060') : '') + (P.infect > 0 ? Tip.row('', 'заражение раны', '#c0e060') : ''),
  b_st: () => Tip.head('Силы', Math.round(P.stam) + ' / ' + Math.round(maxStam()), '#8fbf7f') + '<div class="ti-d">Тратятся на бег (Shift), перегруз тратит больше. На ходу и на месте восстанавливаются; артефакты ускоряют.</div>',
  b_rad: () => Tip.head('Радиация', Math.round(P.rad) + ' / 100', '#d8d040') + '<div class="ti-d">Копится в фонящих зонах и от артефактов. Выше 60 отнимает здоровье. Антирад снимает 35, в лагере спадает сама.</div>',
  b_food: () => Tip.head('Сытость', Math.round(P.food) + ' / 100', '#c09060') + '<div class="ti-d">Убывает со временем, на бегу быстрее. Ниже 20 здоровье не восстанавливается, на нуле — теряешь его.</div>',
  b_psy: () => Tip.head('Напряжение', Math.round(P.stress) + ' / 100', '#9070c0') + '<div class="ti-d">Растёт ночью, в тумане, рядом с трупами и от «Пёрышка» с «Миражом». Выше 65 мерещится. Снимают лагерь, костёр, привал.</div>',
};

(() => {
  const _hud = hud, _resolve = Tip.resolve.bind(Tip), _click = Meta.click.bind(Meta);
  hud = function (dt) { _hud(dt); Hint.tick(dt); };
  // полоски состояния: подсказка по наведению
  Tip.resolve = function (el) {
    const bar = el && el.closest && el.closest('.bar'); if (bar) { const i = bar.querySelector && bar.querySelector('i'); const f = i && Tip.BAR[i.id]; if (f) return f(); }
    return _resolve(el);
  };
  // выключатель и повтор из меню
  Meta.click = function (a, arg, arg2, u) {
    if (a === 'hintsToggle') { P.hintsOff = !P.hintsOff; return true; }
    if (a === 'hintsReset') { Hint.reset(); log('Подсказки покажутся заново.', '#9ad0e8'); return true; }
    return _click(a, arg, arg2, u);
  };
})();

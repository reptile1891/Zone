'use strict';
// Пиксель-арт спрайты: строки символов -> кэш canvas (1 пиксель арта = 2 пикселя экрана).
const Spr = {
  cache: {},
  make(name, rows, pal) {
    const h = rows.length, w = Math.max(...rows.map(r => r.length)), c = document.createElement('canvas');
    c.width = w * 2; c.height = h * 2; const g = c.getContext('2d');
    rows.forEach((row, y) => [...row].forEach((ch, x) => { const col = pal[ch]; if (col) { g.fillStyle = col; g.fillRect(x * 2, y * 2, 2, 2); } }));
    return this.cache[name] = c;
  },
  draw(ctx, name, x, y, flip, alpha, sc) {
    const c = this.cache[name]; if (!c) return;
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); if (flip) ctx.scale(-1, 1); if (alpha != null) ctx.globalAlpha = alpha; if (sc && sc !== 1) ctx.scale(sc, sc);
    ctx.drawImage(c, -c.width / 2, -c.height / 2); ctx.restore();
  },
  init() {
    const M = (n, r, p) => this.make(n, r, p);
    const human = ['..gggg..', '.gggggg.', '.gffffg.', '..ffff..', '.bbbbbb.', 'bbbbbbbb', 'bb.bb.bb', '.bbbbbb.', '.dd..dd.', '.dd..dd.', '.kk..kk.', '.kk..kk.'];
    M('player', human, { g: '#5a6a3a', f: '#d0a878', b: '#7a7048', d: '#3a3a30', k: '#22201a' });
    M('player_s', human, { g: '#4a5a30', f: '#c09868', b: '#5a5438', d: '#2e2e26', k: '#1a1812' });
    for (const k in CFG.vendors) M('npc_' + k, human, { g: CFG.vendors[k].col, f: '#d0a878', b: '#4a4234', d: '#2a2820', k: '#161410' });
    M('listener', ['.......ee.......', '......eEEe......', '..ppppppEe.p....', '.pppppppppppp...', 'pppppppppppppp..', '.ppp.pp..ppp.pp.', '.p.p.p...p.p.p..'], { p: '#cbb9a0', e: '#d68f8f', E: '#9a5a5a' });
    M('tin', ['....rrrrrrrrrr....', '..rrRrrRrrRrrRrr..', '.rrrrrrrrrrrrrrrrh.', 'rRrrRrrRrrRrrRrrrhh', 'rrrrrrrrrrrrrrrrrhhw', '.rrrrrrrrrrrrrrrrr.w', '..kk..kk....kk..kk.', '..kk..kk....kk..kk.'], { r: '#7a5238', R: '#a06a3a', h: '#4a3a30', w: '#d8d0b0', k: '#2a2018' });
    M('glass', ['.........aa.', '........aaba', '..aaaaaaaaa.', '.aabbabbbaa.', '.aabbbbbbaa.', '.aaaaaaaaaa.', '..a.a..a.a..', '..a.a..a.a..'], { a: '#8fb8d8', b: '#d8f0ff' });
    M('bristler', ['...k.k.k.k.k....', '..kqkqkqkqkqk...', '.bbbbbbbbbbbbbh.', 'bbBbbbbbbbbbbbhh', 'bbbbbbbbbbbbbhwh', '.bbbbbbbbbbbbbh.', '..kk..kk..kk.kk.', '..kk..kk..kk.kk.'], { b: '#6a4e3a', B: '#8a6a4a', q: '#d8cfa8', k: '#2a2018', h: '#4a3a2a', w: '#e8e0c0' });
    M('cinder', ['.........kk.....', '.......kkKKk....', '..kkkkkkKKeEk...', '.kKKkKKkkKKKKk..', 'kKKrKKKrKKKKkk..', '.kKKKKKKKKKKk...', '..k.k....k.k....', '..k.k....k.k....'], { k: '#1a1512', K: '#3a302a', e: '#ffd050', E: '#e0702a', r: '#e05a22' });
    M('rotter', ['....gg....', '..ggGGg...', '.ggggggggg', 'gggwrwgggg', '.gggggggg.', '.g.g..g.g.', '.k.k..k.k.'], { g: '#5a6a3a', G: '#7a8a4a', w: '#e8e4c0', r: '#a03030', k: '#2a3018' });
    M('fogger',['..wwww..', '.wwwwww.', '.wkwwkw.', '..wwww..', '..dddd..', '.dddddd.', '.dddddd.', 'dddddddd', '.d.dd.d.', '.d.dd.d.', '.d....d.', '.d....d.'], { w: '#dcdcd0', k: '#101010', d: '#2a2c34' });
    M('tree', ['...gggg...', '..gGggGg..', '.gggGgggg.', '.gGggggGg.', '..gggggg..', '...gggg...', '....tt....', '....tt....'], { g: '#1e2c1a', G: '#2c4024', t: '#3a2a1a' });
    M('rock', ['..rrrr..', '.rRrrrr.', 'rRrrrrrr', 'rrrrrrkr', '.kkkkkk.'], { r: '#57574f', R: '#77776c', k: '#3a3a34' });
    M('wreck', ['..rrrrrr....', '.rRRRRRRr...', 'rrrrrrrrrrrr', 'rkkrrrrkkrrr', 'rkkrrrrkkrrr', '.kk......kk.'], { r: '#6a3e26', R: '#8a5a3a', k: '#2a1c12' });
    M('tent', ['....tt....', '...tTTt...', '..tTTTTt..', '.tTTkkTTt.', 'tTTTkkTTTt'], { t: '#4a5a3a', T: '#5f7048', k: '#1a1a10' });
    M('bunker', ['bbbbbbbbbbbb', 'bBBBBBBBBBBb', 'bBkkkkkkkkBb', 'bBkddddddkBb', 'bBkddddddkBb', 'bbbbbbbbbbbb'], { b: '#3c3c38', B: '#5a5a54', k: '#22221e', d: '#111110' });
    M('crate', ['bbbbbbbb', 'bBBBBBBb', 'bBbbbbBb', 'bBBBBBBb', 'bbbbbbbb'], { b: '#5a4a2a', B: '#7a6438' });
    M('crate_o', ['bbbbbbbb', 'b......b', 'bbbbbbbb'], { b: '#3a3020' });
    M('star', ['..w..', '.www.', 'wwwww', '.www.', '..w..'], { w: '#fff2b0' });
    M('corpse', ['..d...d..', '.dd.d.dd.', '..ddddd..', '.dd.d.dd.', '..d...d..'], { d: '#8a7a5a' });
    M('corpse_l', ['..d...d..', '.dd.d.dd.', '..ddddd..', '.dd.d.dd.', '..d...d..'], { d: '#3a3a30' });
    M('meat', ['.rrr.', 'rRrrr', '.rrr.'], { r: '#5a1e1e', R: '#7a2a2a' });
    // ground tile
    const t = document.createElement('canvas'); t.width = t.height = 128; const g = t.getContext('2d'), R = U.rng(7);
    g.fillStyle = '#1d2418'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) { const x = Math.floor(R() * 64) * 2, y = Math.floor(R() * 64) * 2, v = R(); g.fillStyle = v < 0.5 ? '#222b1c' : v < 0.8 ? '#182014' : v < 0.95 ? '#2c3822' : '#3a3a24'; g.fillRect(x, y, 2, 2); }
    for (let i = 0; i < 60; i++) { const x = Math.floor(R() * 62) * 2, y = Math.floor(R() * 60) * 2 + 4; g.fillStyle = '#34452a'; g.fillRect(x, y, 2, 2); g.fillRect(x, y - 2, 2, 2); g.fillRect(x + 2, y - 4, 2, 2); }
    this.ground = t;
        if (this.init2) this.init2();
  },
};
const BASEPATCH = ['rgba(60,90,40,.25)', 'rgba(80,90,40,.25)', 'rgba(100,80,40,.25)', 'rgba(110,60,40,.28)'];

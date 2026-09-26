'use strict';
// Оружие в руках: пиксельные спрайты, поворот за прицелом, отдача и вспышка. Используется игроком и сталкерами.
const Gun = {
  ready: false,
  def: {
    pistol:  { px: 2, py: 2, my: 1 },
    sawnoff: { px: 6, py: 2, my: 1 },
    rifle:   { px: 6, py: 3, my: 2 },
    revolver: { px: 2, py: 2, my: 1 },
    flamer:  { px: 2, py: 3, my: 2 },
    smg:     { px: 2, py: 2, my: 1 },
  },
  init() {
    if (this.ready) return; this.ready = true;
    Spr.make('gun_pistol', ['.GGGGGGGG.', '.GGgGGGGGk', '.sGGGGsss.', '.hhs..s...', '.hHh......', '.hh.......'], { G: '#3c4046', g: '#6a707a', k: '#181a1c', s: '#24272b', h: '#4e3220', H: '#7a5230' });
    Spr.make('gun_sawnoff', ['......kkkkkkkk', 'wwwwwwGGGGGGGm', 'wWWwwkkkkkkkk.', '.wwss.........', '..ww..........'], { k: '#181a1c', G: '#4a4e54', m: '#b8bec8', w: '#5a3a22', W: '#805632', s: '#24272b' });
    Spr.make('gun_revolver', ['..kkkkkkkkkk', '.GGGGGGGGGGm', '.GGcccGGGGGk', '.sGGGGGss...', '.hhs..s.....', '.hHh........', '.hh.........'], { G: '#3c4046', c: '#8a8f98', k: '#181a1c', s: '#24272b', m: '#b8bec8', h: '#4e3220', H: '#7a5230' });
    Spr.make('gun_smg', ['..........kkk.', '.kkGGGGGGGGGGm', '.kGGGgGGGGGGGk', '.sGGGGGGssss..', '..sMMs.hhs....', '..sMMs.hHh....', '...MM..hh.....'], { G: '#3c4046', g: '#6a707a', k: '#181a1c', s: '#24272b', M: '#5a5e66', m: '#b8bec8', h: '#4e3220', H: '#7a5230' });
    Spr.make('gun_flamer', ['.tttt.........', 'tTTTTt.kkkkkkk', 'tTTTTGGGGGGGGm', 'tTTTTtGGGGGGGk', '.tttt.hs.ssss.', '......hhs.....', '......hH......'], { t: '#5a2a1a', T: '#a04a2a', G: '#3c4046', k: '#181a1c', m: '#e08a30', s: '#24272b', h: '#4e3220', H: '#7a5230' });
    Spr.make('gun_rifle', ['......SSSS..........', '..kkkkSSSSkkkkkkkkkk', 'wwwwGGGGGGGGGGGGGGGm', 'wWWwsGGGGGss........', '.wwwhhs.s...........', '..ww.h..............'], { k: '#181a1c', S: '#5a80a0', G: '#3c4046', m: '#b8bec8', w: '#5a3a22', W: '#805632', s: '#24272b', h: '#4a3020' });
  },
  draw(ctx, x, y, ang, key, rec) {
    this.init(); const d = this.def[key] || this.def.pistol, c = Spr.cache['gun_' + (this.def[key] ? key : 'pistol')]; rec = rec || 0;
    const left = Math.cos(ang) < 0;
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(ang + (left ? 1 : -1) * 0.2 * rec); if (left) ctx.scale(1, -1);
    ctx.translate(5 - rec * 4, 0); ctx.drawImage(c, -d.px * 2, -d.py * 2);
    if (rec > 0.6) {
      const mx = c.width - d.px * 2 + 1, my = -d.py * 2 + d.my * 2 + 1;
      ctx.fillStyle = '#ffb030'; ctx.fillRect(mx, my - 4, 8, 8); ctx.fillStyle = '#fff2a0'; ctx.fillRect(mx + 1, my - 2, 8, 4); ctx.fillRect(mx + 4, my - 1, 6, 2);
    }
    ctx.restore();
  },
};

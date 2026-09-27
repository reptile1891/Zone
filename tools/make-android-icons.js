// Рисует значки приложения для Android (прицел в кольце): обычные, круглые и слой переднего плана адаптивного значка.
// Запуск: node tools/make-android-icons.js (нужен один раз; результат лежит в android/app/src/main/res/mipmap-*)
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const res = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
function crc(buf) { let c; const t = crc.t || (crc.t = Array.from({ length: 256 }, (_, n) => { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; })); c = 0xFFFFFFFF; for (const b of buf) c = t[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(type, data) { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); }
// mode: 'full' — с тёмным фоном; 'round' — фон только внутри круга; 'fg' — прозрачный слой (рисунок в центральных 60%)
function png(n, mode) {
  const raw = Buffer.alloc((n * 4 + 1) * n), k = mode === 'fg' ? 0.6 : 1;
  for (let y = 0; y < n; y++) { raw[y * (n * 4 + 1)] = 0; for (let x = 0; x < n; x++) {
    const u = ((x + 0.5) / n - 0.5) / k, v = ((y + 0.5) / n - 0.5) / k, d = Math.hypot(u, v), i = y * (n * 4 + 1) + 1 + x * 4;
    let c = null;
    if (mode !== 'fg' && !(mode === 'round' && Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5) > 0.5)) c = [11, 13, 10];
    if (d > 0.28 && d < 0.38) c = [181, 116, 42];
    const ax = Math.abs(u), ay = Math.abs(v); if ((ax < 0.035 && ay < 0.2) || (ay < 0.035 && ax < 0.2)) c = [201, 194, 168];
    if (d < 0.05) c = [111, 154, 85];
    if (c) { raw[i] = c[0]; raw[i + 1] = c[1]; raw[i + 2] = c[2]; raw[i + 3] = 255; } }
  }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(n, 0); ih.writeUInt32BE(n, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, m] of Object.entries(dens)) {
  const dir = path.join(res, 'mipmap-' + d);
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), png(48 * m, 'full'));
  fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), png(48 * m, 'round'));
  fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), png(108 * m, 'fg'));
}
fs.writeFileSync(path.join(res, 'values', 'ic_launcher_background.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0B0D0A</color>\n</resources>\n');
console.log('значки записаны');

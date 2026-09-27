// Собирает папку www/ для приложения: только то, что нужно игре (страница, скрипты из index.html, иконки).
// Запуск: npm run build:web (его же вызывает npm run android:sync)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'www');
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const files = new Set(['index.html', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png']);
for (const m of html.matchAll(/<script src="([\w.]+\.js)">/g)) files.add(m[1]);
for (const f of files) { if (!fs.existsSync(path.join(root, f))) throw new Error('нет файла ' + f); fs.copyFileSync(path.join(root, f), path.join(out, f)); }
console.log('www: ' + files.size + ' файлов');

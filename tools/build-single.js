// Собирает игру в ОДИН файл dist/Obochina.html: страница, все скрипты из index.html и значок внутри. Открывается двойным щелчком, без сервера и интернета.
// Запуск: npm run build:single
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'dist');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const n = { js: 0 };
html = html.replace(/<script src="([\w.]+\.js)"><\/script>/g, (_, f) => {
  const code = fs.readFileSync(path.join(root, f), 'utf8');
  if (/<\/script/i.test(code)) throw new Error(f + ': внутри скрипта есть «</script», встраивание сломает страницу');
  n.js++; return '<script>\n// ---- ' + f + ' ----\n' + code + '\n</script>';
});
const svg = fs.readFileSync(path.join(root, 'icon.svg'));
html = html.replace(/<link rel="manifest"[^>]*>\n?/, '').replace(/<link rel="apple-touch-icon"[^>]*>\n?/, '')
  .replace(/<link rel="icon" href="icon.svg"[^>]*>/, '<link rel="icon" href="data:image/svg+xml;base64,' + svg.toString('base64') + '" type="image/svg+xml">')
  .replace(/<script>if \('serviceWorker' in navigator[^\n]*<\/script>\n?/, '');   // сервис-воркер нужен только для сайта
if (/src="[\w.]+\.js"/.test(html)) throw new Error('остались внешние скрипты');
fs.mkdirSync(out, { recursive: true });
const file = path.join(out, 'Obochina.html'); fs.writeFileSync(file, html);
console.log('dist/Obochina.html: ' + n.js + ' скриптов, ' + Math.round(fs.statSync(file).size / 1024) + ' КБ');

# Обочина

Браузерная сталкер-игра на чистом JavaScript: без фреймворков и сборки, скрипты подключаются тегами `<script>`. Подробности, состав версий и устройство — в [zone/README.md](zone/README.md).

## Запуск

Нужен только Node.js (маленький статический сервер):

```bash
npm start   # → http://localhost:8124
```

Без npm: `node serve.js zone 8124`. На телефоне откройте адрес компьютера в той же Wi-Fi сети или выложите папку `zone/` на статический хостинг (GitHub Pages: адрес `…/Zone/zone/`).

## Тесты

```bash
npm test
```

Встроенный `node:test`, без зависимостей и без браузера: скрипты игры загружаются в песочницу `vm` с заглушками DOM ([tests/zone-load.js](tests/zone-load.js)). Отчёты: `npm run balance:zone` (баланс), `npm run sim:dungeon [N]` (бот-прогон подземелий).

# GeeksGame

Telegram Mini App для живой игры «Угадай мелодию»: один ведущий, два игрока, buzzer, очередь зрителей и анимированный рейтинг.

## Локальный запуск

```bash
npm install
npm run dev
```

- Интерфейс: `http://localhost:5173`
- API и Socket.IO: `http://localhost:3000`
- В development обычный браузер может создавать тестовых игроков.

## Production

```bash
npm run build
npm start
```

Переменные Railway:

- `DATABASE_URL=${{Postgres.DATABASE_URL}}`
- `BOT_TOKEN` — только новый токен из BotFather, старый опубликованный токен использовать нельзя
- `SESSION_SECRET` — длинная случайная строка
- `ALLOW_DEV_AUTH=false`

Railway автоматически выполняет `npm run db:migrate`, проверяет `/api/health` и запускает сервис. Если `DATABASE_URL` ещё не подключён, миграция безопасно пропускается, а ведущий продолжает работать.

## Проверки

```bash
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Профили Telegram сохраняются в PostgreSQL. Роли, очередь, счёт и раунд хранятся в памяти одного Railway-инстанса и сбрасываются при рестарте.

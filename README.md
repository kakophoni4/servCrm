# Field CRM — замена Битрикса

CRM для малого сервисного бизнеса: заявки → клиенты → исполнение → деньги → касса → отчёты → бот/чат.

Документация: [`docs/`](./docs/) · статус старта: [`docs/DAY0-STATUS.md`](./docs/DAY0-STATUS.md).

## Стек

| Слой | Выбор |
|------|--------|
| Frontend | Next.js 15 + TypeScript |
| Backend | NestJS + Prisma |
| DB | PostgreSQL 16 |
| Deploy | Docker Compose + Caddy (HTTPS) |

## Структура

```
apps/api     — NestJS API
apps/web     — Next.js UI
docs/        — BRIEF, роли, статусы, формулы, roadmap
deploy/      — Caddyfile
docker-compose.yml       — только Postgres (dev)
docker-compose.prod.yml  — полный стенд на VPS
```

## Что реализовано

| Область | API | Web |
|---------|-----|-----|
| Auth / роли | ✅ | ✅ |
| Заявки + ID MMYYWNNNN | ✅ | ✅ |
| Клиенты + история | ✅ | ✅ |
| Претензии | ✅ | ✅ |
| Мастера / сотрудники / увольнение | ✅ | ✅ |
| Документы + правило Готов >500 | ✅ | ✅ |
| Категории ЗП + пересчёт | ✅ | ✅ |
| Касса / инкассация | ✅ | ✅ |
| Расчёт мастеров (2× confirm) | ✅ | ✅ |
| Отчёты | ✅ | ✅ |
| Реклама дневная | ✅ | ✅ |
| Имущество | ✅ | ✅ |
| Чат-центр + bot HTTP | ✅ | ✅ |
| ЗП диспетчеров (настройки) | ✅ | ✅ |

## Деплой на сервер

1. Установить Docker на VPS (2 vCPU / 4 GB хватит на старт).
2. Клонировать репо, скопировать `.env.example` → `.env`, заполнить секреты и `DOMAIN`.
3. `docker compose -f docker-compose.prod.yml up -d --build`
4. `docker compose -f docker-compose.prod.yml exec api npx prisma db seed` (или `npm run db:seed` из образа — см. ниже).
5. Открыть `https://DOMAIN`, войти пилотными логинами.

Сиды после первого старта:

```bash
docker compose -f docker-compose.prod.yml exec api npx tsx prisma/seed.ts
```

(если в образе нет tsx — выполнить seed с машины разработчика, указав `DATABASE_URL` на сервер.)

### Пилотные логины

| login | пароль | роль |
|-------|--------|------|
| owner | owner123 | OWNER |
| admin | admin123 | ADMIN |
| dispatcher | disp123 | DISPATCHER |

## Локальная разработка (без Docker Desktop)

Нужен любой PostgreSQL 16+ и Node 20+.

```bash
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# поправить DATABASE_URL
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev:api
npm run dev:web
```

На Windows без виртуализации Docker Desktop не стартует — проверяйте на VPS.

## API health

`GET /api/health` → `{ ok: true }`

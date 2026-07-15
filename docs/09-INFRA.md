# Инфраструктура

## Сервер

| Этап | CPU | RAM | Disk |
|------|-----|-----|------|
| MVP | 2 vCPU | 4 GB | 40 GB |
| Боевой | 4 vCPU | 8 GB | больше |

- Домен + DNS → A-запись на VPS
- Почта для Let's Encrypt / алертов (опционально)
- Firewall: 22, 80, 443
- Object Storage — со 2-й фазы (чеки)

## Стек деплоя

```
Docker Compose:
  - postgres:16
  - api (NestJS)
  - web (Next.js)
  - caddy / nginx (TLS)
```

## Env (пример)

```env
# apps/api/.env
DATABASE_URL=postgresql://crm:crm@localhost:5432/crm?schema=public
JWT_SECRET=change-me-in-production
JWT_EXPIRES_IN=7d
PORT=3001
UPLOAD_DIR=./uploads
CORS_ORIGIN=http://localhost:3000

# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Бэкапы

```cron
0 3 * * * pg_dump -U crm crm | gzip > /backups/crm-$(date +\%F).sql.gz
# хранить ≥14 дней
```

## Локальный запуск

См. корневой `README.md`:

```bash
docker compose up -d db
cd apps/api && npm i && npx prisma migrate dev && npm run start:dev
cd apps/web && npm i && npm run dev
```

## Репозиторий

- `main` + `feat/*`
- PR даже в соло
- Коммуникация с заказчиком: один Telegram-чат, ответы по формулам ≤24ч

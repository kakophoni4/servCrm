# Статус кодовой базы

Дата: 2026-07-15

## Готово в репозитории

- Документация `docs/00`…`10` + `docs/DATA/*`
- Monorepo: NestJS API + Next.js Web + Prisma + Docker prod
- Полный контур фаз 1–5 в коде (проверка на VPS)

### API-модули

auth, users, clients, orders, claims, masters, cities, partners,
documents, salary, cash, settlements, reports, ads, assets, chat, settings, bot

### Web-экраны

логин, заявки, клиенты, претензии, касса, отчёты, реклама, имущество,
чат, расчёт мастеров, настройки ЗП, ЗП диспетчеров, мастера, сотрудники

## Решения (зафиксированы)

| Вопрос | Решение |
|--------|---------|
| ID | **9 цифр** MMYYWNNNN |
| Диспетчер видит | **все заявки** |
| Готов + чеки >500 | жёсткая блокировка в API |
| Партнёры | справочник |

## Деплой

Локально Docker Desktop на этой машине **не стартует** (нет виртуализации).  
Проверка: VPS + `docker compose -f docker-compose.prod.yml up -d --build`.

См. корневой `README.md`.

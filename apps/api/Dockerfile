FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/
RUN npm install --workspace=@field-crm/api --include-workspace-root

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json* ./
COPY apps/api apps/api
WORKDIR /app/apps/api
# Санитайзинг миграций: убираем null-байты/BOM (файлы, ошибочно сохранённые в UTF-16),
# иначе Postgres падает с "string contains embedded null". SQL миграций — чистый ASCII.
RUN find prisma/migrations -name '*.sql' -exec sh -c 'tr -d "\000\377\376" < "$1" > "$1.tmp" && mv "$1.tmp" "$1"' _ {} \;
RUN npx prisma generate && npx nest build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/prisma ./prisma
COPY --from=build /app/apps/api/package.json ./package.json
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]

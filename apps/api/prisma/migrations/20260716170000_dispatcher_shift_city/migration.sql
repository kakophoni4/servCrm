-- Add city_id (nullable first for backfill)
ALTER TABLE "dispatcher_shifts" ADD COLUMN "city_id" TEXT;

-- Backfill from dispatcher's user.city_id
UPDATE "dispatcher_shifts" AS s
SET "city_id" = u."city_id"
FROM "users" AS u
WHERE s."user_id" = u."id"
  AND s."city_id" IS NULL
  AND u."city_id" IS NOT NULL;

-- Drop rows that still have no city (cannot scope)
DELETE FROM "dispatcher_shifts" WHERE "city_id" IS NULL;

-- If duplicates (same date+city), keep newest
DELETE FROM "dispatcher_shifts" a
USING "dispatcher_shifts" b
WHERE a."work_date" = b."work_date"
  AND a."city_id" = b."city_id"
  AND a."id" < b."id";

ALTER TABLE "dispatcher_shifts" ALTER COLUMN "city_id" SET NOT NULL;

DROP INDEX IF EXISTS "dispatcher_shifts_work_date_key";

CREATE UNIQUE INDEX "dispatcher_shifts_work_date_city_id_key" ON "dispatcher_shifts"("work_date", "city_id");

CREATE INDEX "dispatcher_shifts_city_id_idx" ON "dispatcher_shifts"("city_id");

ALTER TABLE "dispatcher_shifts" ADD CONSTRAINT "dispatcher_shifts_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

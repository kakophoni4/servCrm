-- Дата закрытия заявки (статус Готов) для расчётов мастеров
ALTER TABLE "orders" ADD COLUMN "completed_at" TIMESTAMP(3);

-- Уже закрытые: считаем датой закрытия updated_at
UPDATE "orders"
SET "completed_at" = "updated_at"
WHERE "status" = 'DONE' AND "completed_at" IS NULL;

CREATE INDEX "orders_completed_at_idx" ON "orders"("completed_at");
CREATE INDEX "orders_master_id_completed_at_idx" ON "orders"("master_id", "completed_at");

-- Ack / escalation tracking for Telegram office notifications
ALTER TABLE "orders" ADD COLUMN "notify_acked_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "notify_escalated_at" TIMESTAMP(3);

ALTER TABLE "claims" ADD COLUMN "notify_acked_at" TIMESTAMP(3);
ALTER TABLE "claims" ADD COLUMN "notify_escalated_at" TIMESTAMP(3);

-- Не эскалировать уже существующие записи при первом запуске поллера
UPDATE "orders" SET "notify_escalated_at" = NOW() WHERE "notify_escalated_at" IS NULL;
UPDATE "claims" SET "notify_escalated_at" = NOW() WHERE "notify_escalated_at" IS NULL;

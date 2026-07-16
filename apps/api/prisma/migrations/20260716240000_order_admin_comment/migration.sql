-- Комментарий администратора на заявке (для мастера в Telegram).
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "admin_comment" TEXT;

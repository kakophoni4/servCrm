-- Telegram message ids for master order cards (delete on reassign)
ALTER TABLE "orders" ADD COLUMN "master_tg_chat_id" TEXT;
ALTER TABLE "orders" ADD COLUMN "master_tg_message_id" INTEGER;

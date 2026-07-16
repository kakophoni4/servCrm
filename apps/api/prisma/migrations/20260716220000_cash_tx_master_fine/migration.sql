-- Опциональная привязка кассового штрафа к мастеру
ALTER TABLE "cash_tx" ADD COLUMN IF NOT EXISTS "master_id" TEXT;

CREATE INDEX IF NOT EXISTS "cash_tx_master_id_idx" ON "cash_tx"("master_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cash_tx_master_id_fkey'
  ) THEN
    ALTER TABLE "cash_tx"
      ADD CONSTRAINT "cash_tx_master_id_fkey"
      FOREIGN KEY ("master_id") REFERENCES "masters"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

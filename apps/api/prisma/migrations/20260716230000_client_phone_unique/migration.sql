-- Один клиент = один телефон. Дубликаты сливаем в самую свежую карточку.
WITH ranked AS (
  SELECT
    id,
    phone_normalized,
    ROW_NUMBER() OVER (
      PARTITION BY phone_normalized
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS rn
  FROM clients
),
dups AS (
  SELECT id, phone_normalized FROM ranked WHERE rn > 1
),
keepers AS (
  SELECT id, phone_normalized FROM ranked WHERE rn = 1
)
UPDATE orders o
SET client_id = k.id
FROM dups d
JOIN keepers k ON k.phone_normalized = d.phone_normalized
WHERE o.client_id = d.id;

DELETE FROM clients
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY phone_normalized
        ORDER BY updated_at DESC, created_at DESC, id DESC
      ) AS rn
    FROM clients
  ) ranked
  WHERE rn > 1
);

DROP INDEX IF EXISTS "clients_phone_normalized_name_key";
DROP INDEX IF EXISTS "clients_phone_normalized_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "clients_phone_normalized_key" ON "clients"("phone_normalized");

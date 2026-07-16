-- Приход ORDER в кассе должен быть toCompany (чистыми), а не полной paid.
-- Пересчёт исторических cash_tx из order_payments.
UPDATE cash_tx ct
SET
  amount = op.to_company,
  description = COALESCE(ct.description, 'Приход по заявке (чистыми)')
FROM order_payments op
WHERE ct.order_id = op.order_id
  AND ct.direction = 'INCOME'
  AND ct.income_basis = 'ORDER'
  AND ct.amount IS DISTINCT FROM op.to_company;

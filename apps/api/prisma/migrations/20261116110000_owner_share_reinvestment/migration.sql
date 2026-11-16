-- Correct reinvestment only; preserve customer payments, parts and master earnings.
ALTER TABLE salary_categories ALTER COLUMN reinvest_pct SET DEFAULT 0.5;
UPDATE salary_categories SET reinvest_pct = 0.5;
UPDATE order_payments SET reinvest_pct = 0.5,
 reinvest_amount = ROUND(to_company * 0.5, 2),
 owner_net = to_company - ROUND(to_company * 0.5, 2);

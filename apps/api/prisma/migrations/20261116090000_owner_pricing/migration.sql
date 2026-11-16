ALTER TABLE salary_categories ADD COLUMN type_tech TEXT, ADD COLUMN master_id TEXT, ADD COLUMN reinvest_pct DECIMAL(5,4) NOT NULL DEFAULT 0.25;
ALTER TABLE masters ADD COLUMN address TEXT;
ALTER TABLE orders ADD COLUMN is_personal BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE order_payments ADD COLUMN reinvest_pct DECIMAL(5,4) NOT NULL DEFAULT 0, ADD COLUMN reinvest_amount DECIMAL(12,2) NOT NULL DEFAULT 0, ADD COLUMN owner_net DECIMAL(12,2) NOT NULL DEFAULT 0;
UPDATE order_payments SET owner_net = to_company;

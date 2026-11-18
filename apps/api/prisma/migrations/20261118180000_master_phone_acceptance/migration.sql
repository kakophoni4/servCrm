INSERT INTO app_settings (key,value,updated_at)
SELECT 'bot.orders.accepted.'||id,master_id,CURRENT_TIMESTAMP FROM orders
WHERE master_id IS NOT NULL AND is_personal=false AND status IN ('ON_THE_WAY','IN_PROGRESS','IN_PROGRESS_SD','DONE')
ON CONFLICT (key) DO NOTHING;

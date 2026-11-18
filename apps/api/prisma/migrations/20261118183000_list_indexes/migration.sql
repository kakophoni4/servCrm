CREATE INDEX IF NOT EXISTS orders_scheduled_page_idx ON orders (scheduled_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS orders_master_status_page_idx ON orders (master_id, status, scheduled_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS clients_updated_page_idx ON clients (updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS discussion_history_page_idx ON order_discussion_messages (order_id, created_at DESC, id DESC);

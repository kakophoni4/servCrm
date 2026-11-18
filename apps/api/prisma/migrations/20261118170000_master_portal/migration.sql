ALTER TABLE users ADD COLUMN master_web_enabled BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE order_discussion_messages (id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id),body TEXT NOT NULL,created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX order_discussion_messages_order_id_created_at_idx ON order_discussion_messages(order_id,created_at);
CREATE INDEX order_discussion_messages_user_id_idx ON order_discussion_messages(user_id);

CREATE TABLE stock_parts (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT '',
 quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
 minimum INTEGER NOT NULL DEFAULT 2 CHECK(minimum >= 0),
 active BOOLEAN NOT NULL DEFAULT true,
 UNIQUE(category,name)
);
CREATE TABLE stock_usage (
 order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 part_id TEXT NOT NULL REFERENCES stock_parts(id),
 quantity INTEGER NOT NULL CHECK(quantity >= 0),
 applied INTEGER NOT NULL DEFAULT 0 CHECK(applied >= 0),
 PRIMARY KEY(order_id,part_id)
);
CREATE TABLE stock_moves (
 id TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
 part_id TEXT NOT NULL REFERENCES stock_parts(id),
 delta INTEGER NOT NULL, reason TEXT NOT NULL,
 order_number TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX stock_moves_recent ON stock_moves(created_at DESC);
CREATE FUNCTION sync_order_stock(oid TEXT, closed BOOLEAN) RETURNS VOID AS $$
DECLARE r RECORD; target INTEGER; change INTEGER; number TEXT;
BEGIN
 PERFORM pg_advisory_xact_lock(73184199);
 SELECT public_id INTO number FROM orders WHERE id=oid;
 FOR r IN SELECT u.*,p.name FROM stock_usage u JOIN stock_parts p ON p.id=u.part_id WHERE u.order_id=oid ORDER BY u.part_id LOOP
  target := CASE WHEN closed THEN r.quantity ELSE 0 END;
  change := r.applied-target;
  IF change <> 0 THEN
   UPDATE stock_parts SET quantity=quantity+change WHERE id=r.part_id AND quantity+change>=0;
   IF NOT FOUND THEN RAISE EXCEPTION 'Not enough stock: %',r.name; END IF;
   INSERT INTO stock_moves(part_id,delta,reason,order_number) VALUES(r.part_id,change,CASE WHEN change<0 THEN 'order' ELSE 'return' END,number);
   UPDATE stock_usage SET applied=target WHERE order_id=oid AND part_id=r.part_id;
  END IF;
 END LOOP;
END;
$$ LANGUAGE plpgsql;
CREATE FUNCTION order_stock_change() RETURNS TRIGGER AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  PERFORM sync_order_stock(OLD.id,false);
  RETURN OLD;
 ELSE
  PERFORM sync_order_stock(NEW.id,NEW.status::text='DONE');
  RETURN NEW;
 END IF;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER order_stock_status AFTER UPDATE OF status ON orders FOR EACH ROW EXECUTE FUNCTION order_stock_change();
CREATE TRIGGER order_stock_delete BEFORE DELETE ON orders FOR EACH ROW EXECUTE FUNCTION order_stock_change();

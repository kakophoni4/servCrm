-- Привязка документа к статусу + dedup по хешу содержимого
ALTER TABLE "order_documents" ADD COLUMN "for_status" "OrderStatus";
ALTER TABLE "order_documents" ADD COLUMN "content_hash" TEXT;

CREATE UNIQUE INDEX "order_documents_order_id_content_hash_key" ON "order_documents"("order_id", "content_hash");
CREATE INDEX "order_documents_order_id_for_status_idx" ON "order_documents"("order_id", "for_status");

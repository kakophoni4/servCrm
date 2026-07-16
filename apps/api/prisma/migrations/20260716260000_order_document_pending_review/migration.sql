-- AlterTable
ALTER TABLE "order_documents" ADD COLUMN "pending_review" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "order_documents_order_id_pending_review_idx" ON "order_documents"("order_id", "pending_review");

-- CreateTable
CREATE TABLE "dispatcher_shifts" (
    "id" TEXT NOT NULL,
    "work_date" DATE NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispatcher_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dispatcher_shifts_work_date_key" ON "dispatcher_shifts"("work_date");

-- CreateIndex
CREATE INDEX "dispatcher_shifts_user_id_idx" ON "dispatcher_shifts"("user_id");

-- AddForeignKey
ALTER TABLE "dispatcher_shifts" ADD CONSTRAINT "dispatcher_shifts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

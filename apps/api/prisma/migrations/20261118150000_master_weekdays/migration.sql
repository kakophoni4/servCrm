CREATE TABLE "master_weekdays" (
 "master_id" TEXT NOT NULL REFERENCES "masters"("id") ON DELETE CASCADE,
 "weekday" INTEGER NOT NULL CHECK ("weekday" BETWEEN 1 AND 7),
 "is_working" BOOLEAN NOT NULL,
 "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("master_id", "weekday")
);

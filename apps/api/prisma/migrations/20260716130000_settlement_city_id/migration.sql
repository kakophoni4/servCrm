-- MasterSettlement: denormalized master branch (city)
ALTER TABLE "master_settlements" ADD COLUMN "city_id" TEXT;

ALTER TABLE "master_settlements" ADD CONSTRAINT "master_settlements_city_id_fkey"
    FOREIGN KEY ("city_id") REFERENCES "cities"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "master_settlements_city_id_idx" ON "master_settlements"("city_id");

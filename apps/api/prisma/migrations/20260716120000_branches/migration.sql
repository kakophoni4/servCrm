-- Master принадлежит филиалу (городу)
ALTER TABLE "masters" ADD COLUMN "city_id" TEXT;

CREATE INDEX "masters_city_id_idx" ON "masters"("city_id");

ALTER TABLE "masters" ADD CONSTRAINT "masters_city_id_fkey"
    FOREIGN KEY ("city_id") REFERENCES "cities"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Директор ↔ филиал (many-to-many)
CREATE TABLE "branch_directors" (
    "city_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "branch_directors_pkey" PRIMARY KEY ("city_id","user_id")
);

CREATE INDEX "branch_directors_user_id_idx" ON "branch_directors"("user_id");

ALTER TABLE "branch_directors" ADD CONSTRAINT "branch_directors_city_id_fkey"
    FOREIGN KEY ("city_id") REFERENCES "cities"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "branch_directors" ADD CONSTRAINT "branch_directors_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

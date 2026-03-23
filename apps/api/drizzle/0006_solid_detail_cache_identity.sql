DROP INDEX IF EXISTS "freshful_products_freshful_id_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "freshful_products_freshful_id_slug_idx" ON "freshful_products" USING btree ("freshful_id","slug");
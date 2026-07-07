ALTER TABLE "fcv_sales" ADD COLUMN "clover_idempotency_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_clover_idempotency_key_uidx" ON "fcv_sales" USING btree ("clover_idempotency_key");
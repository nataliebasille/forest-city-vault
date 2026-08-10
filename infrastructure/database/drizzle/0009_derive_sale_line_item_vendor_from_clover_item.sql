ALTER TABLE "fcv_sales_line_items" DROP CONSTRAINT "fcv_sales_line_items_vendor_id_fcv_vendors_id_fk";
--> statement-breakpoint
DROP INDEX "sale_line_items_vendor_id_idx";--> statement-breakpoint
DROP INDEX "vendor_items_vendor_id_clover_item_id_uidx";--> statement-breakpoint
CREATE INDEX "sale_line_items_clover_item_id_idx" ON "fcv_sales_line_items" USING btree ("clover_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_items_clover_item_id_uidx" ON "fcv_vendor_items" USING btree ("clover_item_id");--> statement-breakpoint
ALTER TABLE "fcv_sales_line_items" DROP COLUMN "vendor_id";
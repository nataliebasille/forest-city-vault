CREATE TABLE "fcv_vendor_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vendor_id" uuid NOT NULL,
	"clover_item_id" text NOT NULL,
	"name" text NOT NULL,
	"price_cents" bigint NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "vendor_items_price_check" CHECK ("fcv_vendor_items"."price_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "fcv_vendor_items" ADD CONSTRAINT "fcv_vendor_items_vendor_id_fcv_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."fcv_vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vendor_items_vendor_id_idx" ON "fcv_vendor_items" USING btree ("vendor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_items_vendor_id_clover_item_id_uidx" ON "fcv_vendor_items" USING btree ("vendor_id","clover_item_id");
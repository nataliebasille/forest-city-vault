CREATE TYPE "public"."sales_source" AS ENUM('clover');--> statement-breakpoint
CREATE TABLE "fcv_sales_line_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sale_id" uuid NOT NULL,
	"vendor_id" uuid,
	"name" text NOT NULL,
	"quantity" bigint NOT NULL,
	"gross_amount_cents" bigint NOT NULL,
	"discount_amount_cents" bigint NOT NULL,
	"net_amount_cents" bigint NOT NULL,
	"clover_item_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sale_line_items_quantity_check" CHECK ("fcv_sales_line_items"."quantity" > 0),
	CONSTRAINT "sale_line_items_gross_amount_check" CHECK ("fcv_sales_line_items"."gross_amount_cents" >= 0),
	CONSTRAINT "sale_line_items_discount_amount_check" CHECK ("fcv_sales_line_items"."discount_amount_cents" >= 0),
	CONSTRAINT "sale_line_items_net_amount_check" CHECK ("fcv_sales_line_items"."net_amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "fcv_sales" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source" "sales_source" NOT NULL,
	"clover_merchant_id" text,
	"clover_payment_id" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"subtotal_cents" bigint NOT NULL,
	"tax_cents" bigint NOT NULL,
	"discount_cents" bigint NOT NULL,
	"total_cents" bigint NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sales_subtotal_amount_check" CHECK ("fcv_sales"."subtotal_cents" >= 0),
	CONSTRAINT "sales_discount_amount_check" CHECK ("fcv_sales"."discount_cents" >= 0),
	CONSTRAINT "sales_tax_amount_check" CHECK ("fcv_sales"."tax_cents" >= 0),
	CONSTRAINT "sales_total_amount_check" CHECK ("fcv_sales"."total_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "fcv_vendors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"default_vendor_share" integer DEFAULT 6000 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "validate_default_vendor_share" CHECK ("fcv_vendors"."default_vendor_share" >= 0 AND "fcv_vendors"."default_vendor_share" <= 10000)
);
--> statement-breakpoint
ALTER TABLE "fcv_sales_line_items" ADD CONSTRAINT "fcv_sales_line_items_sale_id_fcv_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."fcv_sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fcv_sales_line_items" ADD CONSTRAINT "fcv_sales_line_items_vendor_id_fcv_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."fcv_vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sale_line_items_sale_id_idx" ON "fcv_sales_line_items" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_line_items_vendor_id_idx" ON "fcv_sales_line_items" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "sales_occurred_at_idx" ON "fcv_sales" USING btree ("occurred_at");
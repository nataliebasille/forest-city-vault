CREATE TYPE "public"."vendor_status" AS ENUM('active', 'inactive');--> statement-breakpoint
ALTER TABLE "fcv_vendors" ADD COLUMN "status" "vendor_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "fcv_vendors" ADD COLUMN "clover_category_id" text;--> statement-breakpoint
ALTER TABLE "fcv_vendors" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "fcv_vendors" ADD CONSTRAINT "vendors_name_not_blank_check" CHECK (length(btrim("fcv_vendors"."name")) > 0);
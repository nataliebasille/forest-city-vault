CREATE TYPE "public"."sale_payment_status" AS ENUM('paid', 'rejected', 'incomplete');--> statement-breakpoint
ALTER TABLE "fcv_sales" ADD COLUMN "payment_status" "sale_payment_status";
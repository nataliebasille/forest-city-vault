CREATE TYPE "public"."store_membership_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."store_role" AS ENUM('owner');--> statement-breakpoint
CREATE TYPE "public"."store_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TABLE "fcv_store_memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "store_role" NOT NULL,
	"status" "store_membership_status" NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fcv_stores" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" "store_status" NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"time_zone" text NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "stores_name_not_blank_check" CHECK (length(btrim("fcv_stores"."name")) > 0),
	CONSTRAINT "stores_time_zone_not_blank_check" CHECK (length(btrim("fcv_stores"."time_zone")) > 0),
	CONSTRAINT "stores_currency_usd_check" CHECK ("fcv_stores"."currency" = 'USD')
);
--> statement-breakpoint
ALTER TABLE "fcv_store_memberships" ADD CONSTRAINT "fcv_store_memberships_store_id_fcv_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."fcv_stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "store_memberships_store_user_uidx" ON "fcv_store_memberships" USING btree ("store_id","user_id");--> statement-breakpoint
CREATE INDEX "store_memberships_user_id_idx" ON "fcv_store_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "store_memberships_store_id_idx" ON "fcv_store_memberships" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "store_memberships_store_status_role_idx" ON "fcv_store_memberships" USING btree ("store_id","status","role");
CREATE TYPE "public"."vendor_item_event_type" AS ENUM('upsert', 'delete');--> statement-breakpoint
CREATE TYPE "public"."vendor_item_provider" AS ENUM('clover');--> statement-breakpoint
CREATE TABLE "fcv_vendor_item_inbox_errors" (
	"inbox_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"request_id" text NOT NULL,
	"error" text NOT NULL,
	CONSTRAINT "fcv_vendor_item_inbox_errors_inbox_id_attempt_number_pk" PRIMARY KEY("inbox_id","attempt_number")
);
--> statement-breakpoint
CREATE TABLE "fcv_vendor_item_inbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "inbox_status" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"occurred_at" timestamp,
	"received_at" timestamp NOT NULL,
	"processed_at" timestamp,
	"provider" "vendor_item_provider" NOT NULL,
	"provider_event_id" text NOT NULL,
	"provider_object_id" text NOT NULL,
	"event_type" "vendor_item_event_type" NOT NULL,
	"payload_json" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fcv_vendor_item_inbox_errors" ADD CONSTRAINT "fcv_vendor_item_inbox_errors_inbox_id_fcv_vendor_item_inbox_id_fk" FOREIGN KEY ("inbox_id") REFERENCES "public"."fcv_vendor_item_inbox"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vendor_item_inbox_errors_request_id_idx" ON "fcv_vendor_item_inbox_errors" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_item_inbox_idempotency_key_unique" ON "fcv_vendor_item_inbox" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "vendor_item_inbox_request_id_idx" ON "fcv_vendor_item_inbox" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "vendor_item_inbox_status_received_at_idx" ON "fcv_vendor_item_inbox" USING btree ("status","received_at");
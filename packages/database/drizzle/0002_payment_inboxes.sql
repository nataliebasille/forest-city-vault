CREATE TYPE "public"."payment_provider" AS ENUM('clover');--> statement-breakpoint
CREATE TYPE "public"."inbox_status" AS ENUM('received', 'processed', 'failed', 'dead_letter');--> statement-breakpoint
CREATE TABLE "fcv_payment_inbox_errors" (
	"payment_inbox_id" uuid NOT NULL,
	"attempt_number" serial NOT NULL,
	"request_id" text NOT NULL,
	"error_message" text NOT NULL,
	CONSTRAINT "fcv_payment_inbox_errors_payment_inbox_id_attempt_number_pk" PRIMARY KEY("payment_inbox_id","attempt_number")
);
--> statement-breakpoint
CREATE TABLE "fcv_payment_inbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "inbox_status" NOT NULL,
	"attempts" text NOT NULL,
	"received_at" text NOT NULL,
	"processed_at" text NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"provider_event_id" text NOT NULL,
	"provider_object_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload_json" text NOT NULL
);
--> statement-breakpoint
DROP TABLE "clover_event_processing_attempts" CASCADE;--> statement-breakpoint
DROP TABLE "clover_events" CASCADE;--> statement-breakpoint
ALTER TABLE "fcv_payment_inbox_errors" ADD CONSTRAINT "fcv_payment_inbox_errors_payment_inbox_id_fcv_payment_inbox_id_fk" FOREIGN KEY ("payment_inbox_id") REFERENCES "public"."fcv_payment_inbox"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_inbox_errors_request_id_idx" ON "fcv_payment_inbox_errors" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_inbox_idempotency_key_unique" ON "fcv_payment_inbox" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "payment_inbox_request_id_idx" ON "fcv_payment_inbox" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "payment_inbox_status_received_at_idx" ON "fcv_payment_inbox" USING btree ("status","received_at");--> statement-breakpoint
DROP TYPE "public"."clover_event_change_type";--> statement-breakpoint
DROP TYPE "public"."event_status";
CREATE TYPE "public"."clover_event_change_type" AS ENUM('CREATE', 'UPDATE', 'DELETE');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('received', 'processed', 'failed', 'needs_review', 'ignored', 'dead_letter');--> statement-breakpoint
CREATE TABLE "clover_event_processing_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" text NOT NULL,
	"clover_event_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error_message" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "clover_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"app_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"event_type" text NOT NULL,
	"event_id" text NOT NULL,
	"event_timestamp_ms" bigint NOT NULL,
	"change_type" "clover_event_change_type" NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "event_status" DEFAULT 'received' NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clover_event_processing_attempts" ADD CONSTRAINT "clover_event_processing_attempts_clover_event_id_clover_events_id_fk" FOREIGN KEY ("clover_event_id") REFERENCES "public"."clover_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clover_event_processing_attempts_event_attempt_unique" ON "clover_event_processing_attempts" USING btree ("clover_event_id","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "clover_events_idempotency_key_unique" ON "clover_events" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "clover_events_natural_event_unique" ON "clover_events" USING btree ("app_id","merchant_id","event_type","event_id","change_type","event_timestamp_ms");--> statement-breakpoint
CREATE INDEX "clover_events_merchant_object_idx" ON "clover_events" USING btree ("merchant_id","event_type","event_id");
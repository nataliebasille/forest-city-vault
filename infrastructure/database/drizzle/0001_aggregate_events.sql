CREATE TABLE "fcv_aggregate_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"version" integer NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "aggregate_events_stream_idx" ON "fcv_aggregate_events" USING btree ("aggregate_type","aggregate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "aggregate_events_stream_version_uidx" ON "fcv_aggregate_events" USING btree ("aggregate_type","aggregate_id","version");

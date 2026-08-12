CREATE TYPE "public"."order_event_type" AS ENUM('upsert');--> statement-breakpoint
CREATE TYPE "public"."order_provider" AS ENUM('clover');--> statement-breakpoint
CREATE TYPE "public"."order_payment_result" AS ENUM('SUCCESS', 'FAIL', 'INITIATED', 'VOIDED', 'VOIDING', 'VOID_FAILED', 'AUTH', 'AUTH_COMPLETED', 'DISCOUNT', 'OFFLINE_RETRYING', 'PENDING');--> statement-breakpoint
CREATE TYPE "public"."order_payment_status" AS ENUM('paid', 'rejected', 'incomplete');--> statement-breakpoint
CREATE TYPE "public"."order_source" AS ENUM('clover');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('paid', 'incomplete', 'partial', 'refunded');--> statement-breakpoint
CREATE TABLE "fcv_order_inbox_errors" (
	"inbox_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"request_id" text NOT NULL,
	"error" text NOT NULL,
	CONSTRAINT "fcv_order_inbox_errors_inbox_id_attempt_number_pk" PRIMARY KEY("inbox_id","attempt_number")
);
--> statement-breakpoint
CREATE TABLE "fcv_order_inbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "inbox_status" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"occurred_at" timestamp,
	"received_at" timestamp NOT NULL,
	"processed_at" timestamp,
	"provider" "order_provider" NOT NULL,
	"provider_event_id" text NOT NULL,
	"provider_object_id" text NOT NULL,
	"event_type" "order_event_type" NOT NULL,
	"payload_json" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fcv_order_line_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"name" text NOT NULL,
	"quantity" bigint NOT NULL,
	"gross_amount_cents" bigint NOT NULL,
	"discount_amount_cents" bigint NOT NULL,
	"net_amount_cents" bigint NOT NULL,
	"collected_amount_cents" bigint NOT NULL,
	"refunded" boolean DEFAULT false NOT NULL,
	"clover_item_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "order_line_items_quantity_check" CHECK ("fcv_order_line_items"."quantity" > 0),
	CONSTRAINT "order_line_items_gross_amount_check" CHECK ("fcv_order_line_items"."gross_amount_cents" >= 0),
	CONSTRAINT "order_line_items_discount_amount_check" CHECK ("fcv_order_line_items"."discount_amount_cents" >= 0),
	CONSTRAINT "order_line_items_net_amount_check" CHECK ("fcv_order_line_items"."net_amount_cents" >= 0),
	CONSTRAINT "order_line_items_collected_amount_check" CHECK ("fcv_order_line_items"."collected_amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "fcv_order_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"clover_payment_id" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"tip_amount_cents" bigint NOT NULL,
	"tax_amount_cents" bigint NOT NULL,
	"result" "order_payment_result" NOT NULL,
	"status" "order_payment_status" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "order_payments_amount_check" CHECK ("fcv_order_payments"."amount_cents" >= 0),
	CONSTRAINT "order_payments_tip_amount_check" CHECK ("fcv_order_payments"."tip_amount_cents" >= 0),
	CONSTRAINT "order_payments_tax_amount_check" CHECK ("fcv_order_payments"."tax_amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "fcv_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"source" "order_source" NOT NULL,
	"clover_merchant_id" text NOT NULL,
	"clover_order_id" text NOT NULL,
	"clover_idempotency_key" text NOT NULL,
	"status" "order_status" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"modified_at" timestamp with time zone NOT NULL,
	"subtotal_cents" bigint NOT NULL,
	"tax_cents" bigint NOT NULL,
	"discount_cents" bigint NOT NULL,
	"total_cents" bigint NOT NULL,
	"collected_cents" bigint NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "orders_subtotal_amount_check" CHECK ("fcv_orders"."subtotal_cents" >= 0),
	CONSTRAINT "orders_discount_amount_check" CHECK ("fcv_orders"."discount_cents" >= 0),
	CONSTRAINT "orders_tax_amount_check" CHECK ("fcv_orders"."tax_cents" >= 0),
	CONSTRAINT "orders_total_amount_check" CHECK ("fcv_orders"."total_cents" >= 0),
	CONSTRAINT "orders_collected_amount_check" CHECK ("fcv_orders"."collected_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "fcv_order_inbox_errors" ADD CONSTRAINT "fcv_order_inbox_errors_inbox_id_fcv_order_inbox_id_fk" FOREIGN KEY ("inbox_id") REFERENCES "public"."fcv_order_inbox"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fcv_order_line_items" ADD CONSTRAINT "fcv_order_line_items_order_id_fcv_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."fcv_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fcv_order_payments" ADD CONSTRAINT "fcv_order_payments_order_id_fcv_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."fcv_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_inbox_errors_request_id_idx" ON "fcv_order_inbox_errors" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_inbox_idempotency_key_unique" ON "fcv_order_inbox" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "order_inbox_request_id_idx" ON "fcv_order_inbox" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "order_inbox_status_received_at_idx" ON "fcv_order_inbox" USING btree ("status","received_at");--> statement-breakpoint
CREATE INDEX "order_line_items_order_id_idx" ON "fcv_order_line_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_line_items_clover_item_id_idx" ON "fcv_order_line_items" USING btree ("clover_item_id");--> statement-breakpoint
CREATE INDEX "order_payments_order_id_idx" ON "fcv_order_payments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_payments_order_id_clover_payment_id_uidx" ON "fcv_order_payments" USING btree ("order_id","clover_payment_id");--> statement-breakpoint
CREATE INDEX "orders_occurred_at_idx" ON "fcv_orders" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "orders_status_occurred_at_idx" ON "fcv_orders" USING btree ("status","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_clover_order_id_uidx" ON "fcv_orders" USING btree ("clover_order_id");
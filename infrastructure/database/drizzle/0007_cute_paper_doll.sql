CREATE TABLE "fcv_clover_import_cursors" (
	"merchant_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"last_timestamp" bigint DEFAULT 0 NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "fcv_clover_import_cursors_merchant_id_entity_type_pk" PRIMARY KEY("merchant_id","entity_type")
);

CREATE TABLE "fcv_clover_merchant_tokens" (
	"merchant_id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"access_token" text NOT NULL,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token" text,
	"refresh_token_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);

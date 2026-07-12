DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'fcv_payment_inbox'
			AND column_name = 'occurred_at'
	) THEN
		ALTER TABLE "public"."fcv_payment_inbox"
			ADD COLUMN "occurred_at" timestamp;
	END IF;
END
$$;

-- Backfill existing rows before enforcing NOT NULL. Every sale already recorded
-- came from a captured payment (failed attempts were never stored as sales), so
-- their normalized status is 'paid'. New rows always carry a status.
UPDATE "fcv_sales" SET "payment_status" = 'paid' WHERE "payment_status" IS NULL;
--> statement-breakpoint
ALTER TABLE "fcv_sales" ALTER COLUMN "payment_status" SET NOT NULL;
import { bigint, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { createdAt, fcvTable, updatedAt } from "./+helpers";

/**
 * Incremental-import watermark, one row per `(merchant_id, entity_type)` stream.
 *
 * Each puller (orders today; vendor items, etc. later) records the newest
 * source timestamp it has already imported in `last_timestamp` (epoch
 * milliseconds on the stream's watermark axis — `modifiedTime` for mutable
 * streams like orders/items, `createdTime` for append-mostly streams). The
 * next run asks the provider only for records at/after that watermark instead of
 * rescanning from the beginning of time.
 *
 * The table is deliberately decoupled from the inbox: pruning or archiving inbox
 * rows never rewinds the sync position, and every entity stream advances
 * independently.
 */
export const cloverImportCursors = fcvTable(
  "clover_import_cursors",
  {
    merchantId: text("merchant_id").notNull(),
    // The kind of entity this cursor tracks, e.g. "order", "vendor_item".
    entityType: text("entity_type").notNull(),
    // Newest already-imported source timestamp (epoch ms) on the stream's axis.
    // `0` means nothing imported yet, so the next run performs a full backfill.
    lastTimestamp: bigint("last_timestamp", { mode: "number" })
      .notNull()
      .default(0),
    // Bookkeeping: when the importer last ran for this stream.
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [primaryKey({ columns: [table.merchantId, table.entityType] })],
);

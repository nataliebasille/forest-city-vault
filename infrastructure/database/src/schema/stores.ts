import { sql } from "drizzle-orm";
import { createdAt, fcvTable, id, updatedAt } from "./+helpers";
import { check, integer, pgEnum, text } from "drizzle-orm/pg-core";

export const storeStatus = pgEnum("store_status", ["active", "inactive"]);

/**
 * Snapshot table for the `StoreAccount` aggregate. Like the `sales` table it
 * holds the current materialized state; the aggregate's events live in
 * `fcv_aggregate_events`. `version` mirrors the aggregate version so the
 * repository can reload the correct optimistic-concurrency version rather than
 * assuming a fixed one.
 */
export const stores = fcvTable(
  "stores",
  {
    id: id(),

    name: text("name").notNull(),
    status: storeStatus("status").notNull(),

    // Currency is fixed to USD for every store (see the check constraint). Kept
    // as a column — rather than an implicit constant — so it is explicit in the
    // data and enforced at the database boundary.
    currency: text("currency").notNull().default("USD"),

    timeZone: text("time_zone").notNull(),

    version: integer("version").notNull().default(0),

    createdAt,
    updatedAt,
  },
  (table) => [
    check("stores_name_not_blank_check", sql`length(btrim(${table.name})) > 0`),
    check(
      "stores_time_zone_not_blank_check",
      sql`length(btrim(${table.timeZone})) > 0`,
    ),
    check("stores_currency_usd_check", sql`${table.currency} = 'USD'`),
  ],
);

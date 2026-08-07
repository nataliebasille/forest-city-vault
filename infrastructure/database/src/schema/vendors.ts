import { sql } from "drizzle-orm";
import { createdAt, fcvTable, id, updatedAt } from "./+helpers";
import { check, integer, pgEnum, text } from "drizzle-orm/pg-core";

export const vendorStatus = pgEnum("vendor_status", ["active", "inactive"]);

/**
 * Snapshot table for the `Vendor` aggregate. Like the `stores` table it holds
 * the current materialized state; the aggregate's events live in
 * `fcv_aggregate_events`. `version` mirrors the aggregate version so the
 * repository can reload the correct optimistic-concurrency version.
 *
 * The `default_vendor_share` column is the persisted commission share (in basis
 * points); the domain exposes it as `commissionShare`. `fcv_sales_line_items`
 * references this table by `vendor_id`.
 */
export const vendors = fcvTable(
  "vendors",
  {
    id: id(),

    name: text("name").notNull(),

    status: vendorStatus("status").notNull().default("active"),

    /**
     * The default share of the vendor in basis points (1/100 of a percent).
     * For example, a value of 6000 means the vendor gets 60% of the sale amount '
     * by default.
     */
    defaultVendorShare: integer("default_vendor_share").notNull().default(6000),

    /**
     * The id of the Clover category this vendor corresponds to. Nullable: a
     * vendor may exist before it is linked to its Clover category.
     */
    cloverCategoryId: text("clover_category_id"),

    version: integer("version").notNull().default(0),

    createdAt,
    updatedAt,
  },
  (table) => [
    check("vendors_name_not_blank_check", sql`length(btrim(${table.name})) > 0`),
    check(
      "validate_default_vendor_share",
      sql`${table.defaultVendorShare} >= 0 AND ${table.defaultVendorShare} <= 10000`,
    ),
  ],
);

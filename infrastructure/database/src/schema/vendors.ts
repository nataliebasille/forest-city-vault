import { sql } from "drizzle-orm";
import { createdAt, fcvTable, id, updatedAt } from "./+helpers";
import { check, integer, text, uuid } from "drizzle-orm/pg-core";

export const vendors = fcvTable(
  "vendors",
  {
    id: id(),

    name: text("name").notNull(),

    /**
     * The default share of the vendor in basis points (1/100 of a percent).
     * For example, a value of 6000 means the vendor gets 60% of the sale amount '
     * by default.
     */
    defaultVendorShare: integer("default_vendor_share").notNull().default(6000),

    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "validate_default_vendor_share",
      sql`${table.defaultVendorShare} >= 0 AND ${table.defaultVendorShare} <= 10000`,
    ),
  ],
);

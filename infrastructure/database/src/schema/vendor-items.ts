import { sql } from "drizzle-orm";
import { cents, createdAt, fcvTable, id, updatedAt } from "./+helpers";
import { check, index, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { vendors } from "./vendors";

/**
 * Items a vendor sells, mirrored from Clover. Child of `fcv_vendors`; the
 * `Vendor` aggregate owns these rows and reconciles them from Clover via its
 * `syncCloverItems` action, so the repository replaces the vendor's item set on
 * each save. `clover_item_id` is the item's Clover identity and is unique across
 * all vendors (each vendor is a distinct Clover category within one merchant),
 * hence the global unique `clover_item_id` index. That global uniqueness is what
 * lets a sale line item resolve its vendor by joining on `clover_item_id` alone.
 */
export const vendorItems = fcvTable(
  "vendor_items",
  {
    id: id(),

    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),

    cloverItemId: text("clover_item_id").notNull(),

    name: text("name").notNull(),

    priceCents: cents("price_cents").notNull(),

    createdAt,
    updatedAt,
  },
  (table) => [
    index("vendor_items_vendor_id_idx").on(table.vendorId),
    uniqueIndex("vendor_items_clover_item_id_uidx").on(table.cloverItemId),
    check("vendor_items_price_check", sql`${table.priceCents} >= 0`),
  ],
);

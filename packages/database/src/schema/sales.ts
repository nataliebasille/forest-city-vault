import { sql } from "drizzle-orm";
import { cents, createdAt, fcvTable, id, updatedAt } from "./+helpers";
import {
  check,
  index,
  pgEnum,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { vendors } from "./vendors";

export const salesSource = pgEnum("sales_source", ["clover"]);

export const sales = fcvTable(
  "sales",
  {
    id: id(),

    source: salesSource("source").notNull(),

    cloverMerchantId: text("clover_merchant_id"),
    cloverPaymentId: text("clover_payment_id"),

    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),

    subtotalCents: cents("subtotal_cents").notNull(),
    taxCents: cents("tax_cents").notNull(),
    discountCents: cents("discount_cents").notNull(),
    totalCents: cents("total_cents").notNull(),

    createdAt,
    updatedAt,
  },
  (table) => [
    index("sales_occurred_at_idx").on(table.occurredAt),
    check("sales_subtotal_amount_check", sql`${table.subtotalCents} >= 0`),
    check("sales_discount_amount_check", sql`${table.discountCents} >= 0`),
    check("sales_tax_amount_check", sql`${table.taxCents} >= 0`),
    check("sales_total_amount_check", sql`${table.totalCents} >= 0`),
  ],
);

export const salesLineItems = fcvTable(
  "sales_line_items",
  {
    id: id(),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "no action" }),

    vendorId: uuid("vendor_id").references(() => vendors.id),

    name: text("name").notNull(),

    quantity: cents("quantity").notNull(),
    grossAmountCents: cents("gross_amount_cents").notNull(),
    discountAmountCents: cents("discount_amount_cents").notNull(),
    netAmountCents: cents("net_amount_cents").notNull(),

    cloverItemId: text("clover_item_id"),

    createdAt,
    updatedAt,
  },
  (table) => [
    index("sale_line_items_sale_id_idx").on(table.saleId),
    index("sale_line_items_vendor_id_idx").on(table.vendorId),

    check("sale_line_items_quantity_check", sql`${table.quantity} > 0`),
    check(
      "sale_line_items_gross_amount_check",
      sql`${table.grossAmountCents} >= 0`,
    ),
    check(
      "sale_line_items_discount_amount_check",
      sql`${table.discountAmountCents} >= 0`,
    ),
    check(
      "sale_line_items_net_amount_check",
      sql`${table.netAmountCents} >= 0`,
    ),
  ],
);

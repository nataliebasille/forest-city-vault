import { sql } from "drizzle-orm";
import { cents, createdAt, fcvTable, id, updatedAt } from "./+helpers";
import {
  check,
  index,
  pgEnum,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const salesSource = pgEnum("sales_source", ["clover"]);

// Normalized payment outcome. Provider dispositions (e.g. Clover's "SUCCESS"/
// "FAIL") are mapped to this vocabulary before storage, so no raw vendor strings
// are persisted.
export const salePaymentStatus = pgEnum("sale_payment_status", [
  "paid",
  "rejected",
  "incomplete",
]);

export const sales = fcvTable(
  "sales",
  {
    id: id(),

    source: salesSource("source").notNull(),

    cloverMerchantId: text("clover_merchant_id"),
    cloverPaymentId: text("clover_payment_id"),
    cloverIdempotencyKey: text("clover_idempotency_key"),

    // Normalized outcome of the payment this sale was recorded from. NOT NULL:
    // every ingested payment carries a normalized status.
    paymentStatus: salePaymentStatus("payment_status").notNull(),

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
    uniqueIndex("sales_clover_idempotency_key_uidx").on(
      table.cloverIdempotencyKey,
    ),
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

    name: text("name").notNull(),

    quantity: cents("quantity").notNull(),
    grossAmountCents: cents("gross_amount_cents").notNull(),
    discountAmountCents: cents("discount_amount_cents").notNull(),
    netAmountCents: cents("net_amount_cents").notNull(),

    cloverItemId: text("clover_item_id").notNull(),

    createdAt,
    updatedAt,
  },
  (table) => [
    index("sale_line_items_sale_id_idx").on(table.saleId),
    index("sale_line_items_clover_item_id_idx").on(table.cloverItemId),

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

import { sql } from "drizzle-orm";
import { cents, createdAt, fcvTable, id, updatedAt } from "./+helpers";
import {
  boolean,
  check,
  index,
  pgEnum,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const orderSource = pgEnum("order_source", ["clover"]);

export const orderStatus = pgEnum("order_status", [
  "paid",
  "incomplete",
  "partial",
  "refunded",
]);

export const orderPaymentStatus = pgEnum("order_payment_status", [
  "paid",
  "rejected",
  "incomplete",
]);

export const orderPaymentResult = pgEnum("order_payment_result", [
  "SUCCESS",
  "FAIL",
  "INITIATED",
  "VOIDED",
  "VOIDING",
  "VOID_FAILED",
  "AUTH",
  "AUTH_COMPLETED",
  "DISCOUNT",
  "OFFLINE_RETRYING",
  "PENDING",
]);

export const orders = fcvTable(
  "orders",
  {
    id: text("id").primaryKey(),

    source: orderSource("source").notNull(),
    cloverMerchantId: text("clover_merchant_id").notNull(),
    cloverOrderId: text("clover_order_id").notNull(),
    cloverIdempotencyKey: text("clover_idempotency_key").notNull(),

    status: orderStatus("status").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    modifiedAt: timestamp("modified_at", { withTimezone: true }).notNull(),

    subtotalCents: cents("subtotal_cents").notNull(),
    taxCents: cents("tax_cents").notNull(),
    discountCents: cents("discount_cents").notNull(),
    totalCents: cents("total_cents").notNull(),
    collectedCents: cents("collected_cents").notNull(),

    createdAt,
    updatedAt,
  },
  (table) => [
    index("orders_occurred_at_idx").on(table.occurredAt),
    index("orders_status_occurred_at_idx").on(table.status, table.occurredAt),
    uniqueIndex("orders_clover_order_id_uidx").on(table.cloverOrderId),
    check("orders_subtotal_amount_check", sql`${table.subtotalCents} >= 0`),
    check("orders_discount_amount_check", sql`${table.discountCents} >= 0`),
    check("orders_tax_amount_check", sql`${table.taxCents} >= 0`),
    check("orders_total_amount_check", sql`${table.totalCents} >= 0`),
    check("orders_collected_amount_check", sql`${table.collectedCents} >= 0`),
  ],
);

export const orderLineItems = fcvTable(
  "order_line_items",
  {
    id: id(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "no action" }),

    name: text("name").notNull(),
    quantity: cents("quantity").notNull(),
    grossAmountCents: cents("gross_amount_cents").notNull(),
    discountAmountCents: cents("discount_amount_cents").notNull(),
    netAmountCents: cents("net_amount_cents").notNull(),
    collectedAmountCents: cents("collected_amount_cents").notNull(),
    refunded: boolean("refunded").notNull().default(false),
    cloverItemId: text("clover_item_id").notNull(),

    createdAt,
    updatedAt,
  },
  (table) => [
    index("order_line_items_order_id_idx").on(table.orderId),
    index("order_line_items_clover_item_id_idx").on(table.cloverItemId),
    check("order_line_items_quantity_check", sql`${table.quantity} > 0`),
    check(
      "order_line_items_gross_amount_check",
      sql`${table.grossAmountCents} >= 0`,
    ),
    check(
      "order_line_items_discount_amount_check",
      sql`${table.discountAmountCents} >= 0`,
    ),
    check("order_line_items_net_amount_check", sql`${table.netAmountCents} >= 0`),
    check(
      "order_line_items_collected_amount_check",
      sql`${table.collectedAmountCents} >= 0`,
    ),
  ],
);

export const orderPayments = fcvTable(
  "order_payments",
  {
    id: id(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "no action" }),
    cloverPaymentId: text("clover_payment_id").notNull(),
    amountCents: cents("amount_cents").notNull(),
    tipAmountCents: cents("tip_amount_cents").notNull(),
    taxAmountCents: cents("tax_amount_cents").notNull(),
    result: orderPaymentResult("result").notNull(),
    status: orderPaymentStatus("status").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("order_payments_order_id_idx").on(table.orderId),
    uniqueIndex("order_payments_order_id_clover_payment_id_uidx").on(
      table.orderId,
      table.cloverPaymentId,
    ),
    check("order_payments_amount_check", sql`${table.amountCents} >= 0`),
    check("order_payments_tip_amount_check", sql`${table.tipAmountCents} >= 0`),
    check("order_payments_tax_amount_check", sql`${table.taxAmountCents} >= 0`),
  ],
);

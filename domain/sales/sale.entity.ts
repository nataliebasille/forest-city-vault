import { defineAggregateType } from "@forest-city-vault/core-domain";
import { Schema } from "effect";
import { CentsSchema } from "../value-objects/cents";

const CloverSaleSourceSchema = Schema.Struct({
  provider: Schema.Literal("clover"),
  merchantId: Schema.String,
  paymentId: Schema.String,
  /**
   * The inbox idempotency key of the payment event this sale was recorded from.
   * It uniquely identifies the originating provider event, so it is what ties a
   * sale back to exactly one payment (and is enforced unique in storage).
   */
  idempotencyKey: Schema.String,
});

export const SaleSourceSchema = CloverSaleSourceSchema;

/**
 * Normalized outcome of the payment a sale was recorded from. Provider-specific
 * dispositions are mapped to this vocabulary at the integration boundary, so the
 * domain and storage never carry raw vendor strings. Every payment is ingested
 * regardless of outcome; a `rejected`/`incomplete` sale is retained (not dropped)
 * so it can be reconciled downstream.
 *
 * - `paid`       the payment was captured (money collected).
 * - `rejected`   the payment failed / was declined.
 * - `incomplete` the payment is not finalized either way (authorized-only,
 *                pending, initiated, voiding, retrying, …).
 */
export const SalePaymentStatusSchema = Schema.Literal(
  "paid",
  "rejected",
  "incomplete",
);

export type SalePaymentStatus = typeof SalePaymentStatusSchema.Type;

export const SaleItemSchema = Schema.Struct({
  cloverItemId: Schema.String,
  name: Schema.String,
  quantity: Schema.Number.pipe(Schema.int(), Schema.positive()),
  grossAmount: CentsSchema,
  discountAmount: CentsSchema,
  taxAmount: CentsSchema,
  netAmount: CentsSchema,
});

export const SaleSchema = Schema.Struct({
  source: SaleSourceSchema,
  paymentStatus: SalePaymentStatusSchema,
  items: Schema.Array(SaleItemSchema),
  subtotal: CentsSchema,
  tax: CentsSchema,
  discount: CentsSchema,
  total: CentsSchema,
  recordedAt: Schema.Date,
  completedAt: Schema.NullOr(Schema.Date),
});

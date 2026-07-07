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

export const SaleItemSchema = Schema.Struct({
  vendorId: Schema.String,
  name: Schema.String,
  quantity: Schema.Number.pipe(Schema.int(), Schema.positive()),
  grossAmount: CentsSchema,
  discountAmount: CentsSchema,
  taxAmount: CentsSchema,
  netAmount: CentsSchema,
});

export const SaleSchema = Schema.Struct({
  source: SaleSourceSchema,
  items: Schema.Array(SaleItemSchema),
  subtotal: Schema.NullOr(CentsSchema),
  tax: Schema.NullOr(CentsSchema),
  discount: Schema.NullOr(CentsSchema),
  total: Schema.NullOr(CentsSchema),
  recordedAt: Schema.Date,
  completedAt: Schema.NullOr(Schema.Date),
});

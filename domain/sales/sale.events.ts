import { Schema } from "effect";
import { SaleSchema, SalePaymentStatusSchema, SaleSourceSchema } from "./sale.entity";
import { CentsSchema } from "../value-objects/cents";

const SaleRecordedSchema = Schema.Struct({
  source: SaleSourceSchema,
  paymentStatus: SalePaymentStatusSchema,
  timestamp: Schema.Date,
  subtotal: CentsSchema,
  tax: CentsSchema,
  discount: CentsSchema,
  total: CentsSchema,
});

export const SaleRecorded = {
  schema: SaleRecordedSchema,

  handler: (payload: typeof SaleRecordedSchema.Type) => {
    return {
      source: payload.source,
      paymentStatus: payload.paymentStatus,
      items: [],
      subtotal: payload.subtotal,
      tax: payload.tax,
      discount: payload.discount,
      total: payload.total,
      recordedAt: payload.timestamp,
      completedAt: null,
    } satisfies typeof SaleSchema.Type;
  },
};

const SaleItemRecordedSchema = Schema.Struct({
  cloverItemId: Schema.String,
  name: Schema.String,
  quantity: Schema.Number.pipe(Schema.int(), Schema.positive()),
  grossAmount: CentsSchema,
  discountAmount: CentsSchema,
  taxAmount: CentsSchema,
  netAmount: CentsSchema,
});

export const SaleItemRecorded = {
  schema: SaleItemRecordedSchema,

  handler: (
    snapshot: typeof SaleSchema.Type,
    payload: typeof SaleItemRecordedSchema.Type,
  ) => {
    return {
      ...snapshot,
      items: [...snapshot.items, payload],
    } satisfies typeof SaleSchema.Type;
  },
};

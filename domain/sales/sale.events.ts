import { Schema } from "effect";
import { SaleSchema, SalePaymentStatusSchema, SaleSourceSchema } from "./sale.entity";
import { CentsSchema } from "../value-objects/cents";

const SaleRecordedSchema = Schema.Struct({
  source: SaleSourceSchema,
  // Optional on the event to stay backward-compatible with events recorded before
  // `paymentStatus` existed: replaying them must not fail. New events always carry
  // it (the action requires it). Legacy events are upcast in the handler below.
  paymentStatus: Schema.optional(SalePaymentStatusSchema),
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
      // Upcast legacy events: a SaleRecorded written before `paymentStatus`
      // existed has none, and the pre-status code only ever recorded captured
      // payments as sales, so the faithful reconstruction is `paid`. This keeps
      // the read model rebuildable from the full event history.
      paymentStatus: payload.paymentStatus ?? "paid",
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

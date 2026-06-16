import { Schema } from "effect";
import { SaleSchema, SaleSourceSchema } from "./sale.entity";
import { CentsSchema } from "../value-objects/cents";

const SaleRecordedSchema = Schema.Struct({
  source: SaleSourceSchema,
  timestamp: Schema.Date,
});

export const SaleRecorded = {
  schema: SaleRecordedSchema,

  handler: (payload: typeof SaleRecordedSchema.Type) => {
    return {
      source: payload.source,
      items: [],
      subtotal: null,
      tax: null,
      discount: null,
      total: null,
      recordedAt: payload.timestamp,
      completedAt: null,
    } satisfies typeof SaleSchema.Type;
  },
};

const SaleItemRecordedSchema = Schema.Struct({
  vendorId: Schema.String,
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
      subtotal: (snapshot.subtotal ?? 0) + payload.grossAmount,
      tax: (snapshot.tax ?? 0) + payload.taxAmount,
      discount: (snapshot.discount ?? 0) + payload.discountAmount,
      total: (snapshot.total ?? 0) + payload.netAmount,
    } satisfies typeof SaleSchema.Type;
  },
};

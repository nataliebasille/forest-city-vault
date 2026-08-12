import { Schema } from "effect";
import {
  OrderLineItemSchema,
  OrderPaymentSchema,
  OrderSchema,
  OrderSourceSchema,
  OrderStatusSchema,
} from "./order.entity";
import { CentsSchema } from "../value-objects/cents";

const OrderRecordedSchema = Schema.Struct({
  source: OrderSourceSchema,
  status: OrderStatusSchema,
  timestamp: Schema.Date,
  subtotal: CentsSchema,
  tax: CentsSchema,
  discount: CentsSchema,
  total: CentsSchema,
  collected: CentsSchema,
});

export const OrderRecorded = {
  schema: OrderRecordedSchema,

  handler: (
    snapshotOrPayload:
      | typeof OrderSchema.Type
      | typeof OrderRecordedSchema.Type,
    maybePayload?: typeof OrderRecordedSchema.Type,
  ) => {
    const payload =
      maybePayload === undefined ? (snapshotOrPayload as typeof OrderRecordedSchema.Type) : maybePayload;

    return {
      source: payload.source,
      status: payload.status,
      payments: [],
      items: [],
      subtotal: payload.subtotal,
      tax: payload.tax,
      discount: payload.discount,
      total: payload.total,
      collected: payload.collected,
      recordedAt: payload.timestamp,
      completedAt: null,
    } satisfies typeof OrderSchema.Type;
  },
};

const LineItemRecordedSchema = OrderLineItemSchema;

export const LineItemRecorded = {
  schema: LineItemRecordedSchema,

  handler: (
    snapshot: typeof OrderSchema.Type,
    payload: typeof LineItemRecordedSchema.Type,
  ) => {
    return {
      ...snapshot,
      items: [...snapshot.items, payload],
    } satisfies typeof OrderSchema.Type;
  },
};

const PaymentRecordedSchema = OrderPaymentSchema;

export const PaymentRecorded = {
  schema: PaymentRecordedSchema,

  handler: (
    snapshot: typeof OrderSchema.Type,
    payload: typeof PaymentRecordedSchema.Type,
  ) => {
    return {
      ...snapshot,
      payments: [...snapshot.payments, payload],
    } satisfies typeof OrderSchema.Type;
  },
};

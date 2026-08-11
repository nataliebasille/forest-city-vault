import { Schema } from "effect";
import { SaleItemSchema, SalePaymentStatusSchema } from "./sale.entity";
import { CentsSchema } from "../value-objects/cents";
import * as events from "./sale.events";

const CloverPaymentSchema = Schema.Struct({
  merchantId: Schema.String,
  paymentId: Schema.String,
  timestamp: Schema.Date,
  idempotencyKey: Schema.String,
  // Normalized payment outcome. The Clover-specific `result` string is mapped to
  // this vocabulary at the integration boundary, so the domain never sees raw
  // vendor values. Every payment is recorded regardless of outcome.
  paymentStatus: SalePaymentStatusSchema,
  subtotal: CentsSchema,
  tax: CentsSchema,
  discount: CentsSchema,
  total: CentsSchema,
});

export const FromCloverPaymentSchema = Schema.Struct({
  payment: CloverPaymentSchema,
  items: Schema.Array(SaleItemSchema),
});

type SaleRecordedEvent = {
  type: "SaleRecorded";
  payload: typeof events.SaleRecorded.schema.Type;
};

type SaleItemRecordedEvent = {
  type: "SaleItemRecorded";
  payload: typeof events.SaleItemRecorded.schema.Type;
};

export function fromCloverPayment(
  payload: typeof FromCloverPaymentSchema.Type,
): [SaleRecordedEvent, ...SaleItemRecordedEvent[]] {
  const saleRecordedEvent: SaleRecordedEvent = {
    type: "SaleRecorded",
    payload: {
      source: {
        provider: "clover",
        merchantId: payload.payment.merchantId,
        paymentId: payload.payment.paymentId,
        idempotencyKey: payload.payment.idempotencyKey,
      },
      paymentStatus: payload.payment.paymentStatus,
      timestamp: payload.payment.timestamp,
      subtotal: payload.payment.subtotal,
      tax: payload.payment.tax,
      discount: payload.payment.discount,
      total: payload.payment.total,
    },
  };

  const saleItemEvents: SaleItemRecordedEvent[] = payload.items.map((item) => ({
    type: "SaleItemRecorded",
    payload: item,
  }));

  return [saleRecordedEvent, ...saleItemEvents];
}

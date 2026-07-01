import { Schema } from "effect";
import { SaleItemSchema } from "./sale.entity";
import * as events from "./sale.events";

const CloverPaymentSchema = Schema.Struct({
  merchantId: Schema.String,
  paymentId: Schema.String,
  timestamp: Schema.Date,
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

export function fromCloverPayment(payload: typeof FromCloverPaymentSchema.Type): [
  SaleRecordedEvent,
  ...SaleItemRecordedEvent[],
] {
  const saleRecordedEvent: SaleRecordedEvent = {
    type: "SaleRecorded",
    payload: {
      source: {
        provider: "clover",
        merchantId: payload.payment.merchantId,
        paymentId: payload.payment.paymentId,
      },
      timestamp: payload.payment.timestamp,
    },
  };

  const saleItemEvents: SaleItemRecordedEvent[] = payload.items.map((item) => ({
    type: "SaleItemRecorded",
    payload: item,
  }));

  return [saleRecordedEvent, ...saleItemEvents];
}
import { Schema } from "effect";
import {
  OrderLineItemSchema,
  OrderPaymentResultSchema,
  OrderSchema,
  OrderStatusSchema,
} from "./order.entity";
import { CentsSchema } from "../value-objects/cents";
import * as events from "./order.events";

const CloverOrderPaymentStateSchema = Schema.Literal(
  "PAID",
  "OPEN",
  "PARTIALLY_PAID",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
);

const CloverOrderPaymentSchema = Schema.Struct({
  paymentId: Schema.String,
  amount: CentsSchema,
  tipAmount: CentsSchema,
  taxAmount: CentsSchema,
  result: OrderPaymentResultSchema,
});

const CloverOrderSchema = Schema.Struct({
  merchantId: Schema.String,
  orderId: Schema.String,
  timestamp: Schema.Date,
  idempotencyKey: Schema.String,
  modifiedTime: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  paymentState: CloverOrderPaymentStateSchema,
  subtotal: CentsSchema,
  tax: CentsSchema,
  discount: CentsSchema,
  total: CentsSchema,
  payments: Schema.Array(CloverOrderPaymentSchema),
});

export const FromCloverOrderSchema = Schema.Struct({
  order: CloverOrderSchema,
  items: Schema.Array(OrderLineItemSchema),
});

type OrderRecordedEvent = {
  type: "OrderRecorded";
  payload: typeof events.OrderRecorded.schema.Type;
};

type PaymentRecordedEvent = {
  type: "PaymentRecorded";
  payload: typeof events.PaymentRecorded.schema.Type;
};

type LineItemRecordedEvent = {
  type: "LineItemRecorded";
  payload: typeof events.LineItemRecorded.schema.Type;
};

export function fromCloverOrder(
  payload: typeof FromCloverOrderSchema.Type,
): [OrderRecordedEvent, ...Array<PaymentRecordedEvent | LineItemRecordedEvent>] {
  return buildEventsFromCloverOrder(payload);
}

export function refreshFromCloverOrder(
  _snapshot: typeof OrderSchema.Type,
  payload: typeof FromCloverOrderSchema.Type,
): [OrderRecordedEvent, ...Array<PaymentRecordedEvent | LineItemRecordedEvent>] {
  return buildEventsFromCloverOrder(payload);
}

function buildEventsFromCloverOrder(
  payload: typeof FromCloverOrderSchema.Type,
): [OrderRecordedEvent, ...Array<PaymentRecordedEvent | LineItemRecordedEvent>] {
  const status = toOrderStatus(payload.order.paymentState);
  const paymentEvents: PaymentRecordedEvent[] = payload.order.payments.map(
    (payment) => ({
      type: "PaymentRecorded",
      payload: {
        paymentId: payment.paymentId,
        amount: payment.amount,
        tipAmount: payment.tipAmount,
        taxAmount: payment.taxAmount,
        result: payment.result,
        status: toOrderPaymentStatus(payment.result),
      },
    }),
  );

  const collected = paymentEvents
    .filter((event) => event.payload.status === "paid")
    .reduce((sum, event) => sum + event.payload.amount, 0);

  const orderRecordedEvent: OrderRecordedEvent = {
    type: "OrderRecorded",
    payload: {
      source: {
        provider: "clover",
        merchantId: payload.order.merchantId,
        orderId: payload.order.orderId,
        idempotencyKey: payload.order.idempotencyKey,
        modifiedTime: payload.order.modifiedTime,
      },
      status,
      timestamp: payload.order.timestamp,
      subtotal: payload.order.subtotal,
      tax: payload.order.tax,
      discount: payload.order.discount,
      total: payload.order.total,
      collected,
    },
  };

  const lineItemEvents: LineItemRecordedEvent[] = payload.items.map((item) => ({
    type: "LineItemRecorded",
    payload: item,
  }));

  return [orderRecordedEvent, ...paymentEvents, ...lineItemEvents];
}

function toOrderStatus(
  state: typeof CloverOrderPaymentStateSchema.Type,
): typeof OrderStatusSchema.Type {
  switch (state) {
    case "PAID":
      return "paid";
    case "OPEN":
      return "incomplete";
    case "PARTIALLY_PAID":
      return "partial";
    case "REFUNDED":
    case "PARTIALLY_REFUNDED":
      return "refunded";
    default:
      throw new Error(`Unsupported Clover order payment state: ${state}`);
  }
}

function toOrderPaymentStatus(result: typeof OrderPaymentResultSchema.Type) {
  switch (result) {
    case "SUCCESS":
    case "AUTH_COMPLETED":
      return "paid";
    case "FAIL":
    case "VOIDED":
      return "rejected";
    default:
      return "incomplete";
  }
}

import { Schema } from "effect";
import { CentsSchema } from "../value-objects/cents";

const CloverOrderSourceSchema = Schema.Struct({
  provider: Schema.Literal("clover"),
  merchantId: Schema.String,
  orderId: Schema.String,
  idempotencyKey: Schema.String,
  modifiedTime: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
});

export const OrderSourceSchema = CloverOrderSourceSchema;

export const OrderStatusSchema = Schema.Literal(
  "paid",
  "incomplete",
  "partial",
  "refunded",
);

export type OrderStatus = typeof OrderStatusSchema.Type;

export const OrderPaymentStatusSchema = Schema.Literal(
  "paid",
  "rejected",
  "incomplete",
);

export type OrderPaymentStatus = typeof OrderPaymentStatusSchema.Type;

export const OrderPaymentResultSchema = Schema.Literal(
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
);

export type OrderPaymentResult = typeof OrderPaymentResultSchema.Type;

export const OrderPaymentSchema = Schema.Struct({
  paymentId: Schema.String,
  amount: CentsSchema,
  tipAmount: CentsSchema,
  taxAmount: CentsSchema,
  result: OrderPaymentResultSchema,
  status: OrderPaymentStatusSchema,
});

export const OrderLineItemSchema = Schema.Struct({
  cloverItemId: Schema.String,
  name: Schema.String,
  quantity: Schema.Number.pipe(Schema.int(), Schema.positive()),
  grossAmount: CentsSchema,
  discountAmount: CentsSchema,
  netAmount: CentsSchema,
  collectedAmount: CentsSchema,
  refunded: Schema.Boolean,
});

export const OrderSchema = Schema.Struct({
  source: OrderSourceSchema,
  status: OrderStatusSchema,
  payments: Schema.Array(OrderPaymentSchema),
  items: Schema.Array(OrderLineItemSchema),
  subtotal: CentsSchema,
  tax: CentsSchema,
  discount: CentsSchema,
  total: CentsSchema,
  collected: CentsSchema,
  recordedAt: Schema.Date,
  completedAt: Schema.NullOr(Schema.Date),
});

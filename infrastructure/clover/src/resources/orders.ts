import { Effect, Redacted, Schema } from "effect";
import { makeRequest } from "../make-request";
import { resolveMerchantAccessToken } from "../auth";

// Clover returns monetary/quantity values as either JSON numbers or strings in
// cents (e.g. `"price": "1000"`), so decode tolerates both and lands as a number.
const CloverNumber = Schema.Union(Schema.Number, Schema.NumberFromString);

const CloverReference = Schema.Struct({ id: Schema.String });

// A line item may carry zero or more percentage/amount discounts. Clover stores
// `amount` as a non-positive integer (a reduction), and expresses percentages
// either as whole `percentage` or `percentageDecimal` (percent × 10000).
const CloverDiscountSchema = Schema.Struct({
  amount: Schema.optional(CloverNumber),
  percentage: Schema.optional(CloverNumber),
  percentageDecimal: Schema.optional(CloverNumber),
});

export const CloverOrderLineItemSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.optional(Schema.String),
  // Per-unit price in cents. For PER_UNIT (weighted) items the extended amount is
  // `price * unitQty / 1000`; for per-each items it is the amount for one unit.
  price: Schema.optional(CloverNumber),
  // Reference to the inventory item this line sold. Its `id` is the Clover item
  // id used to resolve the vendor (`vendor_items.clover_item_id`). Absent for
  // custom/manually-keyed line items.
  item: Schema.optional(CloverReference),
  // Fixed-point quantity (thousandths) for PER_UNIT items only.
  unitQty: Schema.optional(CloverNumber),
  exchanged: Schema.optional(Schema.Boolean),
  refunded: Schema.optional(Schema.Boolean),
  discounts: Schema.optional(
    Schema.Struct({
      elements: Schema.optional(Schema.Array(CloverDiscountSchema)),
    }),
  ),
});

export type CloverOrderLineItem = typeof CloverOrderLineItemSchema.Type;

export const CloverOrderSchema = Schema.Struct({
  id: Schema.String,
  lineItems: Schema.optional(
    Schema.Struct({
      elements: Schema.optional(Schema.Array(CloverOrderLineItemSchema)),
    }),
  ),
});

export type CloverOrder = typeof CloverOrderSchema.Type;

/**
 * Fetches a single order with its line items expanded.
 *
 * Line items are an expandable collection on the order, so `expand=lineItems` is
 * always requested. This requires the merchant token to hold the **Read order**
 * permission; a token without it is rejected by Clover with a `403`.
 */
export function getCloverOrder(merchantId: string, orderId: string) {
  return Effect.gen(function* () {
    const redactedToken = yield* resolveMerchantAccessToken(merchantId);
    const accessToken = Redacted.value(redactedToken);

    return yield* makeRequest({
      method: "GET",
      path: `/v3/merchants/${merchantId}/orders/${orderId}`,
      accessToken,
      responseSchema: CloverOrderSchema,
      urlParams: { expand: "lineItems" },
    });
  });
}

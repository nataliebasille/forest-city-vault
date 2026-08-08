import { Effect, Redacted, Schema } from "effect";
import { makeRequest } from "../make-request";
import { resolveMerchantAccessToken } from "../auth";

export const CloverPaymentSchema = Schema.Struct({
  id: Schema.String,
  amount: Schema.Number,
  taxAmount: Schema.optional(Schema.Number),
  discountAmount: Schema.optional(Schema.Number),
  createdTime: Schema.Number,
  lineItems: Schema.optional(
    Schema.Struct({
      elements: Schema.optional(
        Schema.Array(
          Schema.Struct({
            id: Schema.String,
            name: Schema.String,
            price: Schema.Number,
            quantity: Schema.Number,
            note: Schema.optional(Schema.String),
          }),
        ),
      ),
    }),
  ),
});

export type CloverPayment = typeof CloverPaymentSchema.Type;

export const CloverPaymentListSchema = Schema.Struct({
  elements: Schema.Array(CloverPaymentSchema),
  href: Schema.optional(Schema.String),
});

export type CloverPaymentList = typeof CloverPaymentListSchema.Type;

export function getCloverPayment(merchantId: string, paymentId: string) {
  return Effect.gen(function* () {
    const redactedToken = yield* resolveMerchantAccessToken(merchantId);
    const accessToken = Redacted.value(redactedToken);

    return yield* makeRequest({
      method: "GET",
      path: `/v3/merchants/${merchantId}/payments/${paymentId}`,
      accessToken,
      responseSchema: CloverPaymentSchema,
    });
  });
}

/**
 * Lists a page of payments for the merchant, most useful with a static access
 * token to pull recent payments directly from the Clover API.
 *
 * `filter` is a Clover query filter (e.g. `createdTime>=1700000000000`).
 * `orderBy` is a Clover sort spec (e.g. `createdTime ASC`).
 *
 * `expand` requests Clover expandable fields (e.g. `"lineItems"`). It is **not**
 * requested by default: expanding line items requires order/line-item read
 * permission, and a payments-only token responds `403 Invalid permissions for
 * expandable fields`. The importer only needs each payment's id/created time, so
 * it omits `expand`; pass it explicitly only when the token is scoped for it.
 */
export function listCloverPayments(
  merchantId: string,
  options?: {
    readonly limit?: number;
    readonly offset?: number;
    readonly filter?: string;
    readonly orderBy?: string;
    readonly expand?: string;
  },
) {
  return Effect.gen(function* () {
    const redactedToken = yield* resolveMerchantAccessToken(merchantId);
    const accessToken = Redacted.value(redactedToken);

    const urlParams: Record<string, string> = {};
    if (options?.limit !== undefined) {
      urlParams.limit = String(options.limit);
    }
    if (options?.offset !== undefined) {
      urlParams.offset = String(options.offset);
    }
    if (options?.filter !== undefined) {
      urlParams.filter = options.filter;
    }
    if (options?.orderBy !== undefined) {
      urlParams.orderBy = options.orderBy;
    }
    if (options?.expand !== undefined) {
      urlParams.expand = options.expand;
    }

    return yield* makeRequest({
      method: "GET",
      path: `/v3/merchants/${merchantId}/payments`,
      accessToken,
      responseSchema: CloverPaymentListSchema,
      urlParams,
    });
  });
}

import { Effect, Redacted, Schema } from "effect";
import { makeRequest } from "./make-request";
import { getMerchantAccessToken } from "./auth";

export const CloverPaymentSchema = Schema.Struct({
  id: Schema.String,
  total: Schema.Number,
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

export function getCloverPayment(merchantId: string, paymentId: string) {
  return Effect.gen(function* () {
    const redactedToken = yield* getMerchantAccessToken(merchantId);
    const accessToken = Redacted.value(redactedToken);

    return yield* makeRequest({
      method: "GET",
      path: `/v3/merchants/${merchantId}/payments/${paymentId}`,
      accessToken,
      responseSchema: CloverPaymentSchema,
    });
  });
}

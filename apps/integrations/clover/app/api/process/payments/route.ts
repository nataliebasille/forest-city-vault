import { RequestTrace } from "@/lib/runtime/middleware/request-trace";
import { pooledRoute } from "@/runtime";
import { FromCloverPaymentSchema, Sales } from "@forest-city-vault/domain";
import {
  drain,
  RepositoriesSagaScoped,
} from "@forest-city-vault/infrastructure-database";
import { provideSagaScoped } from "@forest-city-vault/platform-saga";
import { getCloverPayment } from "@/lib/integration/payments";
import { Effect, Schema } from "effect";

const PaymentPayloadSchema = Schema.Struct({
  merchantId: Schema.String,
});

const decodePaymentPayload = Schema.decodeUnknown(
  Schema.parseJson(PaymentPayloadSchema),
);

export const POST = pooledRoute(() =>
  Effect.gen(function* () {
    const { requestId } = yield* RequestTrace;

    yield* Effect.logInfo("clover.payments.drain.begin", {
      requestId,
      workflowStage: "drain_inbox",
      inbox: "payments",
    });

    const processed = yield* drain({
      inbox: "payments",
      requestId,
      action: (message) =>
        Effect.gen(function* () {
          const { merchantId } = yield* decodePaymentPayload(
            message.payloadJson,
          );

          const cloverPayment = yield* getCloverPayment(
            merchantId,
            message.providerObjectId,
          );

          const saleItems = mapCloverPaymentToSaleItems(cloverPayment);

          const newSale = Sales.pristine(crypto.randomUUID());
          const actionPayload: typeof FromCloverPaymentSchema.Type = {
            payment: {
              merchantId,
              paymentId: message.providerObjectId,
              timestamp: new Date(cloverPayment.createdTime),
              idempotencyKey: message.idempotencyKey,
            },
            items: saleItems,
          };

          const sale = yield* Sales.actions.fromCloverPayment(
            newSale,
            actionPayload,
          );

          yield* Sales.repository.save(sale);
        }),
    });

    yield* Effect.logInfo("clover.payments.drain.completed", {
      requestId,
      workflowStage: "completed",
      inbox: "payments",
      processedCount: processed.length,
    });

    return true;
  }).pipe(Effect.provide(provideSagaScoped(RepositoriesSagaScoped))),
);

function mapCloverPaymentToSaleItems(
  payment: Effect.Effect.Success<ReturnType<typeof getCloverPayment>>,
): (typeof FromCloverPaymentSchema.Type)["items"] {
  const lineItems = payment.lineItems?.elements ?? [];

  if (lineItems.length === 0) {
    // If no line items, create one aggregate item for the total
    return [
      {
        vendorId: "",
        name: "Payment",
        quantity: 1,
        grossAmount: payment.total,
        discountAmount: payment.discountAmount ?? 0,
        taxAmount: payment.taxAmount ?? 0,
        netAmount: payment.total,
      },
    ];
  }

  return lineItems.map((item) => ({
    vendorId: "",
    name: item.name,
    quantity: item.quantity,
    grossAmount: item.price * item.quantity,
    discountAmount: 0, // Clover item-level discounts would be here
    taxAmount: 0, // Clover item-level taxes would be here
    netAmount: item.price * item.quantity,
  }));
}

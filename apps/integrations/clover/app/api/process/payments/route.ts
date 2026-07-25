import { RequestTrace } from "@/lib/runtime/middleware/request-trace";
import { isAuthorizedInternalBearerToken } from "@/lib/security/internal-bearer-auth";
import { pooledRoute } from "@/runtime";
import { FromCloverPaymentSchema, Sales } from "@forest-city-vault/domain";
import {
  drain,
  RepositoriesSagaScoped,
} from "@forest-city-vault/infrastructure-database";
import { provideSagaScoped } from "@forest-city-vault/platform-saga";
import {
  httpFailure,
  unauthorized,
} from "@forest-city-vault/platform-nextjs-effect";
import { getCloverPayment } from "@/lib/integration/payments";
import { Config, Effect, Redacted, Schema } from "effect";
import { NextRequest } from "next/server";

// Vercel Hobby caps serverless function duration at 60s. Keep the inbox drain
// within that budget; larger backlogs are processed across successive triggers.
export const maxDuration = 60;

const PaymentPayloadSchema = Schema.Struct({
  merchantId: Schema.String,
});

const decodePaymentPayload = Schema.decodeUnknown(
  Schema.parseJson(PaymentPayloadSchema),
);

const processPaymentsRoute = internalProcessorRoute(() =>
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

export const POST = pooledRoute(processPaymentsRoute as never);

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
        grossAmount: payment.amount,
        discountAmount: payment.discountAmount ?? 0,
        taxAmount: payment.taxAmount ?? 0,
        netAmount: payment.amount,
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

const ACTIVE_GUARDS = new Set<string>();
const PROCESS_GUARD_KEY = "clover.process.payments";

export function internalProcessorRoute(
  handler: (request: NextRequest) => Effect.Effect<boolean, any, any>,
): (request: NextRequest) => Effect.Effect<boolean, any, any> {
  return (request: NextRequest) =>
    Effect.gen(function* () {
      const processorSecret = yield* Config.redacted("CLOVER_PROCESSOR_SECRET");

      const isAuthorized = isAuthorizedInternalBearerToken({
        authorizationHeader: request.headers.get("authorization"),
        expectedToken: Redacted.value(processorSecret),
      });

      if (!isAuthorized) {
        return yield* unauthorized("Unauthorized");
      }

      if (ACTIVE_GUARDS.has(PROCESS_GUARD_KEY)) {
        return yield* httpFailure(
          409,
          "Payment processing is already running",
        );
      }

      ACTIVE_GUARDS.add(PROCESS_GUARD_KEY);
      try {
        return yield* handler(request);
      } finally {
        ACTIVE_GUARDS.delete(PROCESS_GUARD_KEY);
      }
    });
}

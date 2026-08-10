import { CloverConfig } from "@forest-city-vault/core-config";
import { FromCloverPaymentSchema, Sales } from "@forest-city-vault/domain";
import { getCloverPayment } from "@forest-city-vault/infrastructure-clover";
import {
  drain,
  RepositoriesSagaScoped,
} from "@forest-city-vault/infrastructure-database";
import { provideSagaScoped } from "@forest-city-vault/platform-saga";
import { Effect, Schema } from "effect";
import { paymentsImportSource, runImport } from "../import/public";

/**
 * The Clover payments jobs, expressed as plain Effect programs independent of any
 * HTTP boundary. The `/api/import/payments` and `/api/process/payments` routes
 * wrap these with request auth/tracing, and the standalone runner
 * (`scripts/run-payments-cycle.ts`) and local scheduler drive the same programs
 * directly against {@link JobLive}. Keeping the logic here means there is a
 * single implementation of the import loop and the payment → sale mapping,
 * regardless of what triggers it.
 */

// Default page size when a caller does not specify one. Matches the Clover Hobby
// budget: a bounded number of records per run, resuming from the watermark.
const DEFAULT_PAGE_SIZE = 50;

/**
 * Incrementally pulls the configured merchant's payments from the Clover API into
 * the payments inbox, resuming from the per-stream watermark. Turning inbox rows
 * into sales is {@link processPayments}'s job.
 */
export function importPayments(options: {
  readonly requestId: string;
  readonly pageSize?: number;
}) {
  return Effect.gen(function* () {
    const { merchantId } = yield* CloverConfig;

    yield* runImport(paymentsImportSource, {
      merchantId,
      requestId: options.requestId,
      pageSize: options.pageSize ?? DEFAULT_PAGE_SIZE,
    });
  });
}

/**
 * Drains the payments inbox into sales. Each message is processed as its own
 * saga (its own transaction), so a single bad payment fails in isolation and is
 * recorded without rolling back the rest of the batch. Returns the number of
 * messages processed this run.
 */
export function processPayments(options: { readonly requestId: string }) {
  const { requestId } = options;

  return Effect.gen(function* () {
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
              subtotal: cloverPayment.amount,
              tax: cloverPayment.taxAmount ?? 0,
              discount: cloverPayment.discountAmount ?? 0,
              total: cloverPayment.amount,
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

    return processed.length;
  }).pipe(Effect.provide(provideSagaScoped(RepositoriesSagaScoped)));
}

/**
 * One full payments cycle: import new Clover payments into the inbox, then drain
 * the inbox into sales. This is the unit a scheduled trigger (GitHub Actions, the
 * local scheduler) runs on each tick.
 */
export function runPaymentsCycle(options: {
  readonly requestId: string;
  readonly pageSize?: number;
}) {
  return Effect.gen(function* () {
    yield* importPayments(options);
    yield* processPayments({ requestId: options.requestId });
  });
}

const PaymentPayloadSchema = Schema.Struct({
  merchantId: Schema.String,
});

const decodePaymentPayload = Schema.decodeUnknown(
  Schema.parseJson(PaymentPayloadSchema),
);

function mapCloverPaymentToSaleItems(
  payment: Effect.Effect.Success<ReturnType<typeof getCloverPayment>>,
): (typeof FromCloverPaymentSchema.Type)["items"] {
  const lineItems = payment.lineItems?.elements ?? [];

  // Only real Clover line items become sale items. A payment with no line items
  // records a sale with its header totals but no line detail — never a
  // fabricated placeholder item.
  return lineItems.map((item) => ({
    vendorId: "",
    cloverItemId: item.id,
    name: item.name,
    quantity: item.quantity,
    grossAmount: item.price * item.quantity,
    discountAmount: 0, // Clover item-level discounts would be here
    taxAmount: 0, // Clover item-level taxes would be here
    netAmount: item.price * item.quantity,
  }));
}

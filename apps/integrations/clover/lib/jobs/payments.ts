import { CloverConfig } from "@forest-city-vault/core-config";
import { FromCloverPaymentSchema, Sales } from "@forest-city-vault/domain";
import {
  type CloverOrder,
  type CloverOrderLineItem,
  type CloverPaymentResult,
  getCloverOrder,
  getCloverPayment,
} from "@forest-city-vault/infrastructure-clover";
import {
  drain,
  RepositoriesSagaScoped,
} from "@forest-city-vault/infrastructure-database";
import { provideSagaScoped } from "@forest-city-vault/platform-saga";
import { Config, Duration, Effect, Schema } from "effect";
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

// How far back a cold (first) run reaches when there is no stored watermark, in
// ms. Clover's payments list only returns ~90 days with no `createdTime` filter,
// and returns nothing for a bound older than its ~8-month ceiling, so the floor
// must sit between those: ~6 months captures full history while staying safely
// inside the window Clover serves. Overridable via CLOVER_IMPORT_BACKFILL_LOOKBACK_MS.
const DEFAULT_BACKFILL_LOOKBACK_MS = 180 * 24 * 60 * 60 * 1000;

// How many inbox messages a single drain pulls, and how long to wait between
// them. Each message costs two Clover calls (payment, then its order), so the
// drain is paced to stay under Clover's per-merchant rate limit rather than
// bursting a whole batch and provoking 429s. Both are overridable via env for
// tuning without a redeploy.
const DEFAULT_DRAIN_BATCH_SIZE = 30;
const DEFAULT_DRAIN_MESSAGE_DELAY_MS = 250;

/**
 * Incrementally pulls the configured merchant's payments from the Clover API into
 * the payments inbox, resuming from the per-stream watermark. Turning inbox rows
 * into sales is {@link processPayments}'s job.
 */
export function importPayments(options: { readonly requestId: string }) {
  return Effect.gen(function* () {
    const { merchantId } = yield* CloverConfig;

    const coldStartLookbackMs = yield* Config.integer(
      "CLOVER_IMPORT_BACKFILL_LOOKBACK_MS",
    ).pipe(Config.withDefault(DEFAULT_BACKFILL_LOOKBACK_MS));

    yield* runImport(paymentsImportSource, {
      merchantId,
      requestId: options.requestId,
      coldStartLookbackMs,
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

    const batchSize = yield* Config.integer("CLOVER_DRAIN_BATCH_SIZE").pipe(
      Config.withDefault(DEFAULT_DRAIN_BATCH_SIZE),
    );
    const messageDelayMs = yield* Config.integer(
      "CLOVER_DRAIN_MESSAGE_DELAY_MS",
    ).pipe(Config.withDefault(DEFAULT_DRAIN_MESSAGE_DELAY_MS));

    const processed = yield* drain({
      inbox: "payments",
      requestId,
      batchSize,
      delayBetweenMessages: Duration.millis(messageDelayMs),
      action: (message) =>
        Effect.gen(function* () {
          const { merchantId } = yield* decodePaymentPayload(
            message.payloadJson,
          );

          const cloverPayment = yield* getCloverPayment(
            merchantId,
            message.providerObjectId,
          );

          // Line items live on the order the payment paid, not on the payment
          // itself, so they are fetched in a second call. A payment with no
          // associated order records a sale with its header totals but no line
          // detail — never a fabricated placeholder item.
          const orderId = cloverPayment.order?.id;
          const saleItems =
            orderId === undefined ?
              []
            : mapCloverOrderToSaleItems(
                yield* getCloverOrder(merchantId, orderId),
              );

          const newSale = Sales.pristine(crypto.randomUUID());
          const actionPayload: typeof FromCloverPaymentSchema.Type = {
            payment: {
              merchantId,
              paymentId: message.providerObjectId,
              timestamp: new Date(cloverPayment.createdTime),
              idempotencyKey: message.idempotencyKey,
              // Normalize Clover's raw result ("SUCCESS"/"FAIL") into our own
              // payment-status vocabulary at this boundary, so the domain and
              // storage never carry vendor strings. Every payment is recorded.
              paymentStatus: toPaymentStatus(cloverPayment.result),
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
export function runPaymentsCycle(options: { readonly requestId: string }) {
  return Effect.gen(function* () {
    yield* importPayments(options);
    yield* processPayments({ requestId: options.requestId });
  });
}

const PaymentPayloadSchema = Schema.Struct({
  merchantId: Schema.String,
});

// Maps Clover's payment `result` to our normalized payment status. Clover's
// `Result` enum has 11 values; they collapse into three outcomes. The mapping is
// total (the `default` covers the in-progress states and any value added to the
// enum later) and revenue-safe: a value is only `paid` when Clover confirms the
// money was captured, so nothing ambiguous is ever counted as revenue.
//   paid:       SUCCESS, AUTH_COMPLETED
//   rejected:   FAIL, VOIDED
//   incomplete: INITIATED, VOIDING, VOID_FAILED, AUTH, DISCOUNT,
//               OFFLINE_RETRYING, PENDING
function toPaymentStatus(cloverResult: CloverPaymentResult) {
  switch (cloverResult) {
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

const decodePaymentPayload = Schema.decodeUnknown(
  Schema.parseJson(PaymentPayloadSchema),
);

function mapCloverOrderToSaleItems(
  order: CloverOrder,
): (typeof FromCloverPaymentSchema.Type)["items"] {
  const lineItems = order.lineItems?.elements ?? [];

  // Only real Clover line items become sale items. An order with no line items
  // records a sale with its header totals but no line detail — never a
  // fabricated placeholder item.
  return lineItems
    .filter((item) => item.exchanged !== true)
    .map((item) => {
      const unitPrice = item.price ?? 0;

      // Weighted (PER_UNIT) items price by quantity: extended = price ×
      // unitQty/1000. Per-each items have no unit quantity and each element is a
      // single unit, so the extended amount is just the price. Quantity is not a
      // reliable numeric field on a per-each Clover line item (each unit is its
      // own record), so each element maps to a single sale line of quantity 1;
      // multiple units of the same item arrive as multiple elements.
      const grossAmount =
        item.unitQty === undefined ?
          unitPrice
        : Math.round((unitPrice * item.unitQty) / 1000);

      const discountAmount = sumLineDiscounts(item, grossAmount);

      return {
        cloverItemId: item.item?.id ?? "",
        name: item.name ?? "",
        quantity: 1,
        grossAmount,
        discountAmount,
        taxAmount: 0,
        // Not clamped: an order whose line discounts exceed the gross is
        // malformed, and letting the net go negative fails the message (via the
        // non-negative DB check) rather than silently persisting wrong revenue.
        netAmount: grossAmount - discountAmount,
      };
    });
}

// Sums a line item's discounts into a positive cents amount. Clover expresses a
// discount as either a fixed `amount` (stored non-positive, so its magnitude is
// the reduction) or a percentage of the gross (`percentageDecimal` is percent ×
// 10000; `percentage` is a whole percent).
function sumLineDiscounts(
  item: CloverOrderLineItem,
  grossAmount: number,
): number {
  const discounts = item.discounts?.elements ?? [];

  let total = 0;
  for (const discount of discounts) {
    if (discount.amount !== undefined) {
      total += Math.abs(discount.amount);
    } else if (discount.percentageDecimal !== undefined) {
      total += Math.round(
        (grossAmount * discount.percentageDecimal) / 1_000_000,
      );
    } else if (discount.percentage !== undefined) {
      total += Math.round((grossAmount * discount.percentage) / 100);
    }
  }

  return total;
}

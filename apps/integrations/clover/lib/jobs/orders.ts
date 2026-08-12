import { CloverConfig } from "@forest-city-vault/core-config";
import { FromCloverOrderSchema, Orders } from "@forest-city-vault/domain";
import {
  type CloverOrder,
  type CloverOrderLineItem,
  getCloverOrder,
} from "@forest-city-vault/infrastructure-clover";
import {
  drain,
  RepositoriesSagaScoped,
} from "@forest-city-vault/infrastructure-database";
import { provideSagaScoped } from "@forest-city-vault/platform-saga";
import { Config, Duration, Effect, Option, Schema } from "effect";
import { ordersImportSource, runImport } from "../import/public";

const DEFAULT_BACKFILL_LOOKBACK_MS = 180 * 24 * 60 * 60 * 1000;
const DEFAULT_DRAIN_BATCH_SIZE = 30;
const DEFAULT_DRAIN_MESSAGE_DELAY_MS = 250;

export function importOrders(options: { readonly requestId: string }) {
  return Effect.gen(function* () {
    const { merchantId } = yield* CloverConfig;

    const coldStartLookbackMs = yield* Config.integer(
      "CLOVER_IMPORT_BACKFILL_LOOKBACK_MS",
    ).pipe(Config.withDefault(DEFAULT_BACKFILL_LOOKBACK_MS));

    return yield* runImport(ordersImportSource, {
      merchantId,
      requestId: options.requestId,
      coldStartLookbackMs,
    });
  });
}

export function processOrders(options: { readonly requestId: string }) {
  const { requestId } = options;

  return Effect.gen(function* () {
    yield* Effect.logInfo("clover.orders.drain.begin", {
      requestId,
      workflowStage: "drain_inbox",
      inbox: "orders",
    });

    const batchSize = yield* Config.integer("CLOVER_DRAIN_BATCH_SIZE").pipe(
      Config.withDefault(DEFAULT_DRAIN_BATCH_SIZE),
    );
    const messageDelayMs = yield* Config.integer(
      "CLOVER_DRAIN_MESSAGE_DELAY_MS",
    ).pipe(Config.withDefault(DEFAULT_DRAIN_MESSAGE_DELAY_MS));

    const processed = yield* drain({
      inbox: "orders",
      requestId,
      batchSize,
      delayBetweenMessages: Duration.millis(messageDelayMs),
      action: (message) =>
        Effect.gen(function* () {
          const { merchantId } = yield* decodeOrderPayload(message.payloadJson);
          const cloverOrder = yield* getCloverOrder(
            merchantId,
            message.providerObjectId,
          );
          const actionPayload = mapCloverOrderToActionPayload(
            cloverOrder,
            merchantId,
            message.idempotencyKey,
          );

          const current = yield* Orders.repository
            .getById(cloverOrder.id)
            .pipe(
              Effect.map(Option.some),
              Effect.catchTag(
                "core/domain/Repository/AggregateNotFoundError",
                () => Effect.succeed(Option.none()),
              ),
            );

          if (
            Option.isSome(current) &&
            current.value.snapshot.source.modifiedTime >= cloverOrder.modifiedTime
          ) {
            return;
          }

          const order = yield* Option.match(current, {
            onNone: () =>
              Orders.actions.fromCloverOrder(
                Orders.pristine(cloverOrder.id),
                actionPayload,
              ),
            onSome: (existing) =>
              Orders.actions.refreshFromCloverOrder(existing, actionPayload),
          });

          yield* Orders.repository.save(order);
        }),
    });

    yield* Effect.logInfo("clover.orders.drain.completed", {
      requestId,
      workflowStage: "completed",
      inbox: "orders",
      processedCount: processed.length,
    });

    return processed.length;
  }).pipe(Effect.provide(provideSagaScoped(RepositoriesSagaScoped)));
}

export function runOrdersCycle(options: { readonly requestId: string }) {
  return Effect.gen(function* () {
    yield* importOrders(options);
    yield* processOrders({ requestId: options.requestId });
  });
}

const OrderPayloadSchema = Schema.Struct({
  merchantId: Schema.String,
});

const decodeOrderPayload = Schema.decodeUnknown(
  Schema.parseJson(OrderPayloadSchema),
);

function mapCloverOrderToActionPayload(
  order: CloverOrder,
  merchantId: string,
  idempotencyKey: string,
): typeof FromCloverOrderSchema.Type {
  const items = mapCloverOrderToLineItems(order);
  const payments = (order.payments?.elements ?? []).map((payment) => ({
    paymentId: payment.id,
    amount: payment.amount,
    tipAmount: payment.tipAmount ?? 0,
    taxAmount: payment.taxAmount ?? 0,
    result: payment.result,
  }));

  const total = order.total ?? payments.reduce((sum, payment) => sum + payment.amount, 0);
  const tax = payments.reduce((sum, payment) => sum + payment.taxAmount, 0);
  const discount = items.reduce((sum, item) => sum + item.discountAmount, 0);
  const subtotal = total - tax;

  return {
    order: {
      merchantId,
      orderId: order.id,
      timestamp: new Date(order.createdTime),
      idempotencyKey,
      modifiedTime: order.modifiedTime,
      paymentState: order.paymentState,
      subtotal,
      tax,
      discount,
      total,
      payments,
    },
    items,
  };
}

function mapCloverOrderToLineItems(
  order: CloverOrder,
): (typeof FromCloverOrderSchema.Type)["items"] {
  const lineItems = order.lineItems?.elements ?? [];

  const allowsItemCollected = order.paymentState === "PAID";

  return lineItems
    .filter((item) => item.exchanged !== true)
    .map((item) => {
      const unitPrice = item.price ?? 0;
      const grossAmount =
        item.unitQty === undefined ?
          unitPrice
        : Math.round((unitPrice * item.unitQty) / 1000);

      const discountAmount = sumLineDiscounts(item, grossAmount);
      const netAmount = grossAmount - discountAmount;
      const refunded = item.refunded === true;
      const collectedAmount =
        allowsItemCollected && !refunded ? Math.max(0, netAmount) : 0;

      return {
        cloverItemId: item.item?.id ?? "",
        name: item.name ?? "",
        quantity: 1,
        grossAmount,
        discountAmount,
        netAmount,
        collectedAmount,
        refunded,
      };
    });
}

function sumLineDiscounts(item: CloverOrderLineItem, grossAmount: number): number {
  const discounts = item.discounts?.elements ?? [];

  let total = 0;
  for (const discount of discounts) {
    if (discount.amount !== undefined) {
      total += Math.abs(discount.amount);
    } else if (discount.percentageDecimal !== undefined) {
      total += Math.round((grossAmount * discount.percentageDecimal) / 1_000_000);
    } else if (discount.percentage !== undefined) {
      total += Math.round((grossAmount * discount.percentage) / 100);
    }
  }

  return total;
}

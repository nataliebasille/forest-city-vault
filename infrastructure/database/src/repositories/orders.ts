import {
  AggregateNotFoundError,
  AggregateType_GetId,
  AggregateType_GetSnapshot,
  MaterializedAggregateRoot,
  RepositoryError,
} from "@forest-city-vault/core-domain";
import { Orders } from "@forest-city-vault/domain";
import { Effect } from "effect";
import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Database } from "../database";
import { aggregateEvents } from "../schema/event-store";
import { orderLineItems, orderPayments, orders } from "../schema/orders";
import { tryDb } from "../utils/try-db";

type OrderId = AggregateType_GetId<typeof Orders>;
type OrderSnapshot = AggregateType_GetSnapshot<typeof Orders>;
type OrderAggregate = MaterializedAggregateRoot<OrderId, OrderSnapshot>;

export const OrdersRepositoryLive = Orders.repository.make(
  Effect.gen(function* () {
    const db = yield* Database;

    return {
      getById: (id: OrderId) =>
        Effect.gen(function* () {
          const idValue = String(id);
          const orderRows = yield* db
            .query((sql) =>
              sql.select().from(orders).where(eq(orders.id, idValue)).limit(1),
            )
            .pipe(
              Effect.mapError(
                (e) =>
                  new RepositoryError({ aggType: "Order", aggId: idValue, error: e }),
              ),
            );

          const orderRow = orderRows[0];
          if (!orderRow) {
            return yield* Effect.fail(
              new AggregateNotFoundError({ aggType: "Order", aggId: idValue }),
            );
          }

          const [itemRows, paymentRows, eventRows] = yield* Effect.all([
            db.query((sql) =>
              sql
                .select()
                .from(orderLineItems)
                .where(eq(orderLineItems.orderId, idValue)),
            ),
            db.query((sql) =>
              sql
                .select()
                .from(orderPayments)
                .where(eq(orderPayments.orderId, idValue)),
            ),
            db.query((sql) =>
              sql
                .select({ version: aggregateEvents.version })
                .from(aggregateEvents)
                .where(
                  and(
                    eq(aggregateEvents.aggregateType, "Order"),
                    eq(aggregateEvents.aggregateId, idValue),
                  ),
                )
                .orderBy(desc(aggregateEvents.version))
                .limit(1),
            ),
          ]).pipe(
            Effect.mapError(
              (e) =>
                new RepositoryError({ aggType: "Order", aggId: idValue, error: e }),
            ),
          );

          const latestVersion = eventRows[0]?.version ?? 1;

          return {
            id,
            version: latestVersion,
            snapshot: {
              source: {
                provider: "clover" as const,
                merchantId: orderRow.cloverMerchantId,
                orderId: orderRow.cloverOrderId,
                idempotencyKey: orderRow.cloverIdempotencyKey,
                modifiedTime: orderRow.modifiedAt.getTime(),
              },
              status: orderRow.status,
              items: itemRows.map((item) => ({
                cloverItemId: item.cloverItemId,
                name: item.name,
                quantity: Number(item.quantity),
                grossAmount: Number(item.grossAmountCents),
                discountAmount: Number(item.discountAmountCents),
                netAmount: Number(item.netAmountCents),
                collectedAmount: Number(item.collectedAmountCents),
                refunded: item.refunded,
              })),
              payments: paymentRows.map((payment) => ({
                paymentId: payment.cloverPaymentId,
                amount: Number(payment.amountCents),
                tipAmount: Number(payment.tipAmountCents),
                taxAmount: Number(payment.taxAmountCents),
                result: payment.result,
                status: payment.status,
              })),
              subtotal: Number(orderRow.subtotalCents),
              tax: Number(orderRow.taxCents),
              discount: Number(orderRow.discountCents),
              total: Number(orderRow.totalCents),
              collected: Number(orderRow.collectedCents),
              recordedAt: orderRow.occurredAt,
              completedAt: null,
            },
          };
        }),

      save: (aggregate: OrderAggregate) =>
        Effect.gen(function* () {
          yield* db.transaction((sql) =>
            Effect.gen(function* () {
              const id = String(aggregate.id);
              const { snapshot } = aggregate;
              const now = new Date();
              const modifiedAt = new Date(snapshot.source.modifiedTime);

              const existing = yield* tryDb(() =>
                sql.select().from(orders).where(eq(orders.id, id)).limit(1),
              );

              if (
                existing[0] !== undefined &&
                existing[0].modifiedAt.getTime() >= modifiedAt.getTime()
              ) {
                return;
              }

              yield* tryDb(() =>
                sql
                  .insert(orders)
                  .values([
                    {
                      id,
                      source: snapshot.source.provider,
                      cloverMerchantId: snapshot.source.merchantId,
                      cloverOrderId: snapshot.source.orderId,
                      cloverIdempotencyKey: snapshot.source.idempotencyKey,
                      status: snapshot.status,
                      occurredAt: snapshot.recordedAt,
                      modifiedAt,
                      subtotalCents: BigInt(snapshot.subtotal),
                      taxCents: BigInt(snapshot.tax),
                      discountCents: BigInt(snapshot.discount),
                      totalCents: BigInt(snapshot.total),
                      collectedCents: BigInt(snapshot.collected),
                      createdAt: now,
                      updatedAt: now,
                    } satisfies typeof orders.$inferInsert,
                  ])
                  .onConflictDoUpdate({
                    target: orders.id,
                    set: {
                      source: snapshot.source.provider,
                      cloverMerchantId: snapshot.source.merchantId,
                      cloverOrderId: snapshot.source.orderId,
                      cloverIdempotencyKey: snapshot.source.idempotencyKey,
                      status: snapshot.status,
                      occurredAt: snapshot.recordedAt,
                      modifiedAt,
                      subtotalCents: BigInt(snapshot.subtotal),
                      taxCents: BigInt(snapshot.tax),
                      discountCents: BigInt(snapshot.discount),
                      totalCents: BigInt(snapshot.total),
                      collectedCents: BigInt(snapshot.collected),
                      updatedAt: now,
                    },
                  }),
              );

              yield* tryDb(() =>
                sql.delete(orderLineItems).where(eq(orderLineItems.orderId, id)),
              );
              yield* tryDb(() =>
                sql.delete(orderPayments).where(eq(orderPayments.orderId, id)),
              );

              if (snapshot.items.length > 0) {
                yield* tryDb(() =>
                  sql.insert(orderLineItems).values(
                    snapshot.items.map(
                      (item: OrderSnapshot["items"][number]) =>
                        ({
                          id: randomUUID(),
                          orderId: id,
                          name: item.name,
                          quantity: BigInt(item.quantity),
                          grossAmountCents: BigInt(item.grossAmount),
                          discountAmountCents: BigInt(item.discountAmount),
                          netAmountCents: BigInt(item.netAmount),
                          collectedAmountCents: BigInt(item.collectedAmount),
                          refunded: item.refunded,
                          cloverItemId: item.cloverItemId,
                          createdAt: now,
                          updatedAt: now,
                        }) satisfies typeof orderLineItems.$inferInsert,
                    ),
                  ),
                );
              }

              if (snapshot.payments.length > 0) {
                yield* tryDb(() =>
                  sql.insert(orderPayments).values(
                    snapshot.payments.map(
                      (payment: OrderSnapshot["payments"][number]) =>
                        ({
                          id: randomUUID(),
                          orderId: id,
                          cloverPaymentId: payment.paymentId,
                          amountCents: BigInt(payment.amount),
                          tipAmountCents: BigInt(payment.tipAmount),
                          taxAmountCents: BigInt(payment.taxAmount),
                          result: payment.result,
                          status: payment.status,
                          createdAt: now,
                          updatedAt: now,
                        }) satisfies typeof orderPayments.$inferInsert,
                    ),
                  ),
                );
              }
            }),
          );
        }).pipe(
          Effect.mapError(
            (e) =>
              new RepositoryError({
                aggType: "Order",
                aggId: String(aggregate.id),
                error: e,
              }),
          ),
        ),
    };
  }),
);

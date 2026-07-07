import {
  AggregateNotFoundError,
  AggregateType_GetId,
  AggregateType_GetSnapshot,
  EventStore,
  MaterializedAggregateRoot,
  RepositoryError,
} from "@forest-city-vault/core-domain";
import { Sales } from "@forest-city-vault/domain";
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { Database } from "../database";
import { sales, salesLineItems } from "../schema/sales";
import { tryDb } from "../utils/try-db";
import { onAmbientDatabase } from "../utils/on-ambient-database";

type SaleId = AggregateType_GetId<typeof Sales>;
type SaleSnapshot = AggregateType_GetSnapshot<typeof Sales>;
type SaleAggregate = MaterializedAggregateRoot<SaleId, SaleSnapshot>;

// `Database` is resolved *inside* each method (via `onAmbientDatabase`), not
// captured when this layer is built. So the repository runs on whatever
// `Database` is ambient at call time — the base connection normally, or the
// saga's transaction-bound `Database` inside a `withSaga` boundary — without the
// layer having to be re-provided per request. That call-time requirement is
// intentionally not surfaced on the domain port; the composition root always
// provides a `Database`.
export const SalesRepositoryLive = Sales.repository.make({
  getById: (id: SaleId) =>
    onAmbientDatabase(
      Effect.gen(function* () {
        const db = yield* Database;
        const rows = yield* db
          .query((sql) =>
            sql
              .select()
              .from(sales)
              .leftJoin(salesLineItems, eq(salesLineItems.saleId, sales.id))
              .where(eq(sales.id, id)),
          )
          .pipe(
            Effect.mapError(
              (e) =>
                new RepositoryError({ aggType: "Sale", aggId: id, error: e }),
            ),
          );

        const saleRow = rows[0]?.sales;

        if (!saleRow) {
          return yield* Effect.fail(
            new AggregateNotFoundError({ aggType: "Sale", aggId: id }),
          );
        }

        const lineItemRows = rows
          .map((row) => row.sales_line_items)
          .filter((item) => item !== null);

        return {
          id,
          version: 1,
          snapshot: {
            source: {
              provider: "clover" as const,
              merchantId: saleRow.cloverMerchantId ?? "",
              paymentId: saleRow.cloverPaymentId ?? "",
              idempotencyKey: saleRow.cloverIdempotencyKey ?? "",
            },
            items: lineItemRows.map((item) => ({
              vendorId: item.vendorId ?? "",
              name: item.name,
              quantity: Number(item.quantity),
              grossAmount: Number(item.grossAmountCents),
              discountAmount: Number(item.discountAmountCents),
              taxAmount: 0,
              netAmount: Number(item.netAmountCents),
            })),
            subtotal: Number(saleRow.subtotalCents),
            tax: Number(saleRow.taxCents),
            discount: Number(saleRow.discountCents),
            total: Number(saleRow.totalCents),
            recordedAt: saleRow.occurredAt,
            completedAt: null,
          },
        };
      }),
    ),

  save: (aggregate: SaleAggregate) =>
    onAmbientDatabase(
      Effect.gen(function* () {
        const db = yield* Database;
        yield* db.transaction((sql) =>
          Effect.gen(function* () {
            const id = String(aggregate.id);
            const { snapshot } = aggregate;
            const now = new Date();

            yield* tryDb(() =>
              sql
                .insert(sales)
                .values([
                  {
                    id,
                    source: snapshot.source.provider,
                    cloverMerchantId: snapshot.source.merchantId,
                    cloverPaymentId: snapshot.source.paymentId,
                    cloverIdempotencyKey: snapshot.source.idempotencyKey,
                    occurredAt: snapshot.recordedAt,
                    subtotalCents: BigInt(snapshot.subtotal ?? 0),
                    taxCents: BigInt(snapshot.tax ?? 0),
                    discountCents: BigInt(snapshot.discount ?? 0),
                    totalCents: BigInt(snapshot.total ?? 0),
                    createdAt: now,
                    updatedAt: now,
                  } satisfies typeof sales.$inferInsert,
                ])
                .onConflictDoUpdate({
                  target: sales.id,
                  set: {
                    source: snapshot.source.provider,
                    cloverMerchantId: snapshot.source.merchantId,
                    cloverPaymentId: snapshot.source.paymentId,
                    cloverIdempotencyKey: snapshot.source.idempotencyKey,
                    occurredAt: snapshot.recordedAt,
                    subtotalCents: BigInt(snapshot.subtotal ?? 0),
                    taxCents: BigInt(snapshot.tax ?? 0),
                    discountCents: BigInt(snapshot.discount ?? 0),
                    totalCents: BigInt(snapshot.total ?? 0),
                    updatedAt: now,
                  },
                }),
            );

            yield* tryDb(() =>
              sql.delete(salesLineItems).where(eq(salesLineItems.saleId, id)),
            );

            if (snapshot.items.length > 0) {
              yield* tryDb(() =>
                sql.insert(salesLineItems).values(
                  snapshot.items.map(
                    (item: SaleSnapshot["items"][number]) =>
                      ({
                        id: crypto.randomUUID(),
                        saleId: id,
                        vendorId: item.vendorId || null,
                        name: item.name,
                        quantity: BigInt(item.quantity),
                        grossAmountCents: BigInt(item.grossAmount),
                        discountAmountCents: BigInt(item.discountAmount),
                        netAmountCents: BigInt(item.netAmount),
                        cloverItemId: null,
                        createdAt: now,
                        updatedAt: now,
                      }) satisfies typeof salesLineItems.$inferInsert,
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
              aggType: "Sale",
              aggId: String(aggregate.id),
              error: e,
            }),
        ),
      ),
    ),
});

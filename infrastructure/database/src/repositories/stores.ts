import {
  AggregateNotFoundError,
  AggregateType_GetId,
  AggregateType_GetSnapshot,
  MaterializedAggregateRoot,
  RepositoryError,
} from "@forest-city-vault/core-domain";
import { StoreAccount } from "@forest-city-vault/domain";
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { Database } from "../database";
import { stores } from "../schema/stores";
import { onAmbientDatabase } from "../utils/on-ambient-database";

type StoreId = AggregateType_GetId<typeof StoreAccount>;
type StoreSnapshot = AggregateType_GetSnapshot<typeof StoreAccount>;
type StoreAggregate = MaterializedAggregateRoot<StoreId, StoreSnapshot>;

/**
 * Persistence for the `StoreAccount` aggregate. Mirrors `SalesRepositoryLive`:
 * it reads/writes the `fcv_stores` snapshot table via the **ambient**
 * {@link Database} (so it runs on the saga transaction inside `withSaga` and the
 * base connection otherwise), while the durable event append is handled by the
 * repository's `withEventTracking` wrapper.
 */
export const StoreAccountRepositoryLive = StoreAccount.repository.make({
  getById: (id: StoreId) =>
    onAmbientDatabase(
      Effect.gen(function* () {
        const db = yield* Database;
        const rows = yield* db
          .query((sql) => sql.select().from(stores).where(eq(stores.id, id)))
          .pipe(
            Effect.mapError(
              (error) =>
                new RepositoryError({
                  aggType: "StoreAccount",
                  aggId: id,
                  error,
                }),
            ),
          );

        const row = rows[0];
        if (!row) {
          return yield* Effect.fail(
            new AggregateNotFoundError({ aggType: "StoreAccount", aggId: id }),
          );
        }

        return {
          id,
          version: row.version,
          snapshot: {
            name: row.name,
            status: row.status,
            currency: "USD" as const,
            timeZone: row.timeZone,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          },
        };
      }),
    ),

  save: (aggregate: StoreAggregate) =>
    onAmbientDatabase(
      Effect.gen(function* () {
        const db = yield* Database;
        const id = String(aggregate.id);
        const { snapshot, version } = aggregate;

        yield* db.query((sql) =>
          sql
            .insert(stores)
            .values([
              {
                id,
                name: snapshot.name,
                status: snapshot.status,
                currency: snapshot.currency,
                timeZone: snapshot.timeZone,
                version,
                createdAt: snapshot.createdAt,
                updatedAt: snapshot.updatedAt,
              } satisfies typeof stores.$inferInsert,
            ])
            .onConflictDoUpdate({
              target: stores.id,
              set: {
                name: snapshot.name,
                status: snapshot.status,
                currency: snapshot.currency,
                timeZone: snapshot.timeZone,
                version,
                updatedAt: snapshot.updatedAt,
              },
            }),
        );
      }).pipe(
        Effect.mapError(
          (error) =>
            new RepositoryError({
              aggType: "StoreAccount",
              aggId: String(aggregate.id),
              error,
            }),
        ),
      ),
    ),
});

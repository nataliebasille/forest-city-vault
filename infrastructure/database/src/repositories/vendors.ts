import {
  AggregateNotFoundError,
  AggregateType_GetId,
  AggregateType_GetSnapshot,
  MaterializedAggregateRoot,
  RepositoryError,
} from "@forest-city-vault/core-domain";
import { Vendor } from "@forest-city-vault/domain";
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { Database } from "../database";
import { vendors } from "../schema/vendors";

type VendorId = AggregateType_GetId<typeof Vendor>;
type VendorSnapshot = AggregateType_GetSnapshot<typeof Vendor>;
type VendorAggregate = MaterializedAggregateRoot<VendorId, VendorSnapshot>;

type VendorRow = typeof vendors.$inferSelect;

// `default_vendor_share` is the persisted column; the domain exposes it as
// `commissionShare`, so the mapping happens here at the storage boundary.
const toAggregate = (row: VendorRow) => ({
  id: row.id as VendorId,
  version: row.version,
  snapshot: {
    name: row.name,
    status: row.status,
    commissionShare: row.defaultVendorShare,
    cloverCategoryId: row.cloverCategoryId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  },
});

/**
 * Persistence for the `Vendor` aggregate. Follows the same build-time
 * `Database` capture as the other repositories, reading/writing the
 * `fcv_vendors` snapshot table while the durable event append is handled by the
 * repository's `withEventTracking` wrapper. The captured `Database` is named
 * honestly in the layer's requirements, so the composition root provides it:
 * the base pool on the pooled stack, or the saga's transaction-bound `Database`
 * when the layer is rebuilt per saga.
 */
export const VendorRepositoryLive = Vendor.repository.make(
  Effect.gen(function* () {
    const db = yield* Database;

    return {
      getById: (id: VendorId) =>
        Effect.gen(function* () {
          const rows = yield* db
            .query((sql) =>
              sql.select().from(vendors).where(eq(vendors.id, id)),
            )
            .pipe(
              Effect.mapError(
                (error) =>
                  new RepositoryError({
                    aggType: "Vendor",
                    aggId: id,
                    error,
                  }),
              ),
            );

          const row = rows[0];
          if (!row) {
            return yield* Effect.fail(
              new AggregateNotFoundError({ aggType: "Vendor", aggId: id }),
            );
          }

          return toAggregate(row);
        }),

      save: (aggregate: VendorAggregate) =>
        Effect.gen(function* () {
          const id = String(aggregate.id);
          const { snapshot, version } = aggregate;

          yield* db.query((sql) =>
            sql
              .insert(vendors)
              .values([
                {
                  id,
                  name: snapshot.name,
                  status: snapshot.status,
                  defaultVendorShare: snapshot.commissionShare,
                  cloverCategoryId: snapshot.cloverCategoryId,
                  version,
                  createdAt: snapshot.createdAt,
                  updatedAt: snapshot.updatedAt,
                } satisfies typeof vendors.$inferInsert,
              ])
              .onConflictDoUpdate({
                target: vendors.id,
                set: {
                  name: snapshot.name,
                  status: snapshot.status,
                  defaultVendorShare: snapshot.commissionShare,
                  cloverCategoryId: snapshot.cloverCategoryId,
                  version,
                  updatedAt: snapshot.updatedAt,
                },
              }),
          );
        }).pipe(
          Effect.mapError(
            (error) =>
              new RepositoryError({
                aggType: "Vendor",
                aggId: String(aggregate.id),
                error,
              }),
          ),
        ),
    };
  }),
);

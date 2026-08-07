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
import { vendorItems } from "../schema/vendor-items";
import { tryDb } from "../utils/try-db";

type VendorId = AggregateType_GetId<typeof Vendor>;
type VendorSnapshot = AggregateType_GetSnapshot<typeof Vendor>;
type VendorAggregate = MaterializedAggregateRoot<VendorId, VendorSnapshot>;

type VendorRow = typeof vendors.$inferSelect;
type VendorItemRow = typeof vendorItems.$inferSelect;

// `default_vendor_share` is the persisted column; the domain exposes it as
// `commissionShare`, so the mapping happens here at the storage boundary. Vendor
// items live in the child `fcv_vendor_items` table and are folded back into the
// snapshot's `items` array.
const toAggregate = (row: VendorRow, itemRows: VendorItemRow[]) => ({
  id: row.id as VendorId,
  version: row.version,
  snapshot: {
    name: row.name,
    status: row.status,
    commissionShare: row.defaultVendorShare,
    cloverCategoryId: row.cloverCategoryId,
    items: itemRows.map((item) => ({
      cloverItemId: item.cloverItemId,
      name: item.name,
      price: Number(item.priceCents),
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  },
});

/**
 * Persistence for the `Vendor` aggregate. Follows the same build-time
 * `Database` capture as the other repositories, reading/writing the
 * `fcv_vendors` snapshot table plus the `fcv_vendor_items` child table, while
 * the durable event append is handled by the repository's `withEventTracking`
 * wrapper. The captured `Database` is named honestly in the layer's
 * requirements, so the composition root provides it: the base pool on the pooled
 * stack, or the saga's transaction-bound `Database` when the layer is rebuilt
 * per saga.
 */
export const VendorRepositoryLive = Vendor.repository.make(
  Effect.gen(function* () {
    const db = yield* Database;

    return {
      getById: (id: VendorId) =>
        Effect.gen(function* () {
          const vendorRows = yield* db
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

          const row = vendorRows[0];
          if (!row) {
            return yield* Effect.fail(
              new AggregateNotFoundError({ aggType: "Vendor", aggId: id }),
            );
          }

          const itemRows = yield* db
            .query((sql) =>
              sql
                .select()
                .from(vendorItems)
                .where(eq(vendorItems.vendorId, id)),
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

          return toAggregate(row, itemRows);
        }),

      save: (aggregate: VendorAggregate) =>
        Effect.gen(function* () {
          yield* db.transaction((sql) =>
            Effect.gen(function* () {
              const id = String(aggregate.id);
              const { snapshot, version } = aggregate;

              yield* tryDb(() =>
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

              yield* tryDb(() =>
                sql.delete(vendorItems).where(eq(vendorItems.vendorId, id)),
              );

              if (snapshot.items.length > 0) {
                yield* tryDb(() =>
                  sql.insert(vendorItems).values(
                    snapshot.items.map(
                      (item: VendorSnapshot["items"][number]) =>
                        ({
                          id: crypto.randomUUID(),
                          vendorId: id,
                          cloverItemId: item.cloverItemId,
                          name: item.name,
                          priceCents: BigInt(item.price),
                          createdAt: snapshot.createdAt,
                          updatedAt: snapshot.updatedAt,
                        }) satisfies typeof vendorItems.$inferInsert,
                    ),
                  ),
                );
              }
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

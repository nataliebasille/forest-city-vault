import {
  AggregateNotFoundError,
  AggregateType_GetId,
  AggregateType_GetSnapshot,
  MaterializedAggregateRoot,
  RepositoryError,
} from "@forest-city-vault/core-domain";
import { Vendor } from "@forest-city-vault/domain";
import { Effect } from "effect";
import { eq, getTableColumns, sql as sqlExpr } from "drizzle-orm";
import { Database } from "../database";
import { vendors } from "../schema/vendors";
import { vendorItems } from "../schema/vendor-items";
import { tryDb } from "../utils/try-db";

type VendorId = AggregateType_GetId<typeof Vendor>;
type VendorSnapshot = AggregateType_GetSnapshot<typeof Vendor>;
type VendorAggregate = MaterializedAggregateRoot<VendorId, VendorSnapshot>;

type VendorRow = typeof vendors.$inferSelect;

// `default_vendor_share` is the persisted column; the domain exposes it as
// `commissionShare`, so the mapping happens here at the storage boundary. Vendor
// items live in the child `fcv_vendor_items` table and are folded back into the
// snapshot's `items` array.
const toAggregate = (row: VendorRow, items: VendorSnapshot["items"]) => ({
  id: row.id as VendorId,
  version: row.version,
  snapshot: {
    name: row.name,
    status: row.status,
    commissionShare: row.defaultVendorShare,
    cloverCategoryId: row.cloverCategoryId,
    items,
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
          // Vendor + items load in a single `leftJoin`. Two details make it work
          // over the effect-sql/drizzle driver, which maps result columns by
          // name rather than position:
          //  - Both `fcv_vendors` and `fcv_vendor_items` have a `name` column, so
          //    the item's is aliased to `item_name` to avoid the two colliding in
          //    the returned row. `${vendorItems}."name"` keeps the reference
          //    qualified (a bare `sql` column reference would be emitted
          //    unqualified and bind ambiguously across the joined tables).
          //  - `price_cents` is cast to text so drizzle's `bigint` column mapper
          //    is not applied to the NULL the left join produces for a vendor
          //    with no items; that mapper would otherwise throw "Cannot convert
          //    undefined to a BigInt" on the unmatched row.
          const rows = yield* db
            .query((sql) =>
              sql
                .select({
                  ...getTableColumns(vendors),
                  itemCloverItemId: vendorItems.cloverItemId,
                  itemName: sqlExpr<string | null>`${vendorItems}."name"`.as(
                    "item_name",
                  ),
                  itemPrice: sqlExpr<
                    string | null
                  >`${vendorItems}."price_cents"::text`.as("item_price"),
                })
                .from(vendors)
                .leftJoin(vendorItems, eq(vendorItems.vendorId, vendors.id))
                .where(eq(vendors.id, id))
                .orderBy(vendorItems.cloverItemId),
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

          const first = rows[0];
          if (!first) {
            return yield* Effect.fail(
              new AggregateNotFoundError({ aggType: "Vendor", aggId: id }),
            );
          }

          const items = rows
            .filter((row) => row.itemCloverItemId !== null)
            .map((row) => ({
              cloverItemId: row.itemCloverItemId as string,
              name: row.itemName as string,
              price: Number(row.itemPrice),
            }));

          return toAggregate(first, items);
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

import {
  AggregateNotFoundError,
  AggregateType_GetId,
  AggregateType_GetSnapshot,
  MaterializedAggregateRoot,
  RepositoryError,
} from "@forest-city-vault/core-domain";
import { StoreMembership } from "@forest-city-vault/domain";
import { Effect, Option } from "effect";
import { and, count, eq, sql } from "drizzle-orm";
import { Database } from "../database";
import { storeMemberships } from "../schema/store-memberships";

type MembershipId = AggregateType_GetId<typeof StoreMembership>;
type MembershipSnapshot = AggregateType_GetSnapshot<typeof StoreMembership>;
type MembershipAggregate = MaterializedAggregateRoot<
  MembershipId,
  MembershipSnapshot
>;

type MembershipRow = typeof storeMemberships.$inferSelect;

const toAggregate = (row: MembershipRow) => ({
  id: row.id as MembershipId,
  version: row.version,
  snapshot: {
    storeId: row.storeId,
    userId: row.userId,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  },
});

/**
 * Persistence for the `StoreMembership` aggregate. Follows the same build-time
 * `Database` capture as the other repositories, reading/writing the
 * `fcv_store_memberships` snapshot table while the durable event append is
 * handled by the repository's `withEventTracking` wrapper. The captured
 * `Database` is named honestly in the layer's requirements.
 */
export const StoreMembershipRepositoryLive = StoreMembership.repository.make(
  Effect.gen(function* () {
    const db = yield* Database;

    return {
      getById: (id: MembershipId) =>
        Effect.gen(function* () {
          const rows = yield* db
            .query((sql) =>
              sql
                .select()
                .from(storeMemberships)
                .where(eq(storeMemberships.id, id)),
            )
            .pipe(
              Effect.mapError(
                (error) =>
                  new RepositoryError({
                    aggType: "StoreMembership",
                    aggId: id,
                    error,
                  }),
              ),
            );

          const row = rows[0];
          if (!row) {
            return yield* Effect.fail(
              new AggregateNotFoundError({
                aggType: "StoreMembership",
                aggId: id,
              }),
            );
          }

          return toAggregate(row);
        }),

      save: (aggregate: MembershipAggregate) =>
        Effect.gen(function* () {
          const id = String(aggregate.id);
          const { snapshot, version } = aggregate;

          yield* db.query((sql) =>
            sql
              .insert(storeMemberships)
              .values([
                {
                  id,
                  storeId: snapshot.storeId,
                  userId: snapshot.userId,
                  email: snapshot.email,
                  role: snapshot.role,
                  status: snapshot.status,
                  version,
                  createdAt: snapshot.createdAt,
                  updatedAt: snapshot.updatedAt,
                } satisfies typeof storeMemberships.$inferInsert,
              ])
              .onConflictDoUpdate({
                target: storeMemberships.id,
                set: {
                  email: snapshot.email,
                  role: snapshot.role,
                  status: snapshot.status,
                  version,
                  updatedAt: snapshot.updatedAt,
                },
              }),
          );
        }).pipe(
          Effect.mapError(
            (error) =>
              new RepositoryError({
                aggType: "StoreMembership",
                aggId: String(aggregate.id),
                error,
              }),
          ),
        ),
    };
  }),
);

/**
 * Read-model queries later authorization work needs. They live beside the
 * repository (like `CloverTokenRepository`'s bespoke queries) and read the
 * {@link Database} at call time, naming it honestly in their requirements. So
 * inside a saga they run on the same transaction as the membership mutation —
 * which is what makes the owner-preservation count consistent under
 * concurrency — while the composition root discharges the `Database`
 * requirement.
 */
export const StoreMembershipQueries = {
  /**
   * Looks up the single membership a user has in a store, keyed by the
   * `(store_id, user_id)` unique index. Returns `None` when absent — used to
   * make owner-membership bootstrap idempotent.
   */
  findByStoreAndUser: (storeId: string, userId: string) =>
    Effect.gen(function* () {
      const db = yield* Database;
      const rows = yield* db.query((sql) =>
        sql
          .select()
          .from(storeMemberships)
          .where(
            and(
              eq(storeMemberships.storeId, storeId),
              eq(storeMemberships.userId, userId),
            ),
          )
          .limit(1),
      );

      return Option.fromNullable(rows[0]).pipe(Option.map(toAggregate));
    }),

  /**
   * Looks up the single membership an email has in a store, matched
   * case-insensitively. This is the admin portal's auth gate key: the identity
   * provider (Better Auth) proves email ownership, and the membership resolved
   * here — not the provider's user id — is what grants access. Returns `None`
   * when the store has no membership for that email.
   */
  findByStoreAndEmail: (storeId: string, email: string) =>
    Effect.gen(function* () {
      const db = yield* Database;
      const rows = yield* db.query((query) =>
        query
          .select()
          .from(storeMemberships)
          .where(
            and(
              eq(storeMemberships.storeId, storeId),
              eq(
                sql`lower(${storeMemberships.email})`,
                email.trim().toLowerCase(),
              ),
            ),
          )
          .limit(1),
      );

      return Option.fromNullable(rows[0]).pipe(Option.map(toAggregate));
    }),

  /**
   * Counts the store's active `owner` memberships without loading them into
   * memory (a SQL `count(*)`), so the owner-preservation policy can be evaluated
   * cheaply and transactionally.
   */
  countActiveOwners: (storeId: string) =>
    Effect.gen(function* () {
      const db = yield* Database;
      const rows = yield* db.query((sql) =>
        sql
          .select({ value: count() })
          .from(storeMemberships)
          .where(
            and(
              eq(storeMemberships.storeId, storeId),
              eq(storeMemberships.status, "active"),
              eq(storeMemberships.role, "owner"),
            ),
          ),
      );

      return Number(rows[0]?.value ?? 0);
    }),
} as const;

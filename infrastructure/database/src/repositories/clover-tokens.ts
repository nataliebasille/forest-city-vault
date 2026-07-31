import { Data, Effect, Option } from "effect";
import { eq, sql } from "drizzle-orm";
import { Database, DatabaseError, type DatabaseService } from "../database";
import { cloverMerchantTokens } from "../schema/clover-tokens";

export type CloverMerchantTokenRow = typeof cloverMerchantTokens.$inferSelect;
export type CloverMerchantTokenInsert =
  typeof cloverMerchantTokens.$inferInsert;

/**
 * Namespace (classid) for every Clover merchant-token refresh advisory lock.
 *
 * PostgreSQL advisory locks share a single global space, so an explicit
 * namespace keeps these locks from ever colliding with advisory locks taken
 * elsewhere: we use the two-key form `pg_advisory_xact_lock(classid, objid)`
 * with this constant as `classid`. The value is the ASCII bytes of `"clvr"`
 * (`0x63='c' 0x6c='l' 0x76='v' 0x72='r'`), which is a positive `int4`
 * (1_668_052_594 < 2^31), chosen only to be memorable and stable.
 */
const REFRESH_LOCK_NAMESPACE = 0x63_6c_76_72;

/** Default bound on how long a caller waits for a contended refresh lock. */
const DEFAULT_LOCK_TIMEOUT_MS = 10_000;

/**
 * A caller waited longer than the configured `lock_timeout` for another
 * instance's in-flight refresh of the same merchant. This is **retryable** — the
 * other refresh is simply taking a while — and must never be conflated with
 * {@link ReauthorizationRequiredError}: the merchant is still connected, we just
 * did not get our turn in time.
 */
export class MerchantTokenRefreshLockTimeoutError extends Data.TaggedError(
  "MerchantTokenRefreshLockTimeoutError",
)<{
  readonly merchantId: string;
  readonly lockTimeoutMs: number;
}> {}

/**
 * Persistence for per-merchant Clover OAuth tokens.
 *
 * Like the other repositories, every method reads the {@link Database} at call
 * time and names it honestly in its requirements, so it runs on the saga's
 * transaction inside a `withSaga` boundary and on the base connection otherwise,
 * without the caller re-providing `Database`. Call-time resolution is load
 * bearing here: {@link withMerchantTokenRefreshLock} swaps the ambient
 * `Database` mid-flight to a lock-pinned transaction, and these methods must
 * pick that up so the reread and write run on the locked connection.
 *
 * Token values are opaque strings here — encryption/decryption is the caller's
 * responsibility (the Clover app encrypts before `upsert` and decrypts after
 * `getByMerchantId`), so ciphertext is all that ever touches the database.
 */
export const CloverTokenRepository = {
  getByMerchantId: (merchantId: string) =>
    Effect.gen(function* () {
      const db = yield* Database;
      const rows = yield* db.query((sql) =>
        sql
          .select()
          .from(cloverMerchantTokens)
          .where(eq(cloverMerchantTokens.merchantId, merchantId))
          .limit(1),
      );

      return Option.fromNullable(rows[0]);
    }),

  /**
   * Inserts the merchant's tokens, or overwrites them when the merchant
   * re-authorizes or the tokens are refreshed. `merchant_id` is the primary key,
   * so a conflict updates the token columns and bumps `updated_at`.
   */
  upsert: (row: CloverMerchantTokenInsert) =>
    Effect.gen(function* () {
      const db = yield* Database;
      yield* db.query((sql) =>
        sql
          .insert(cloverMerchantTokens)
          .values([row])
          .onConflictDoUpdate({
            target: cloverMerchantTokens.merchantId,
            set: {
              appId: row.appId,
              accessToken: row.accessToken,
              accessTokenExpiresAt: row.accessTokenExpiresAt,
              refreshToken: row.refreshToken,
              refreshTokenExpiresAt: row.refreshTokenExpiresAt,
              updatedAt: row.updatedAt,
            },
          }),
      );
    }),
} as const;

/**
 * Runs `effect` while holding a transaction-scoped advisory lock for
 * `merchantId`, so at most one refresh per merchant runs at a time — across
 * every application instance, since the lock lives in PostgreSQL rather than in
 * process memory.
 *
 * The lock is deliberately packaged with the transaction it protects: this opens
 * its **own** database transaction (a fresh reserved connection via
 * {@link DatabaseService.withPinnedTransaction}, independent of any ambient
 * request/saga transaction) and provides that transaction-bound {@link Database}
 * as the ambient one for `effect`. `withPinnedTransaction` guarantees every query
 * `effect` runs is pinned to that one reserved connection, so a token reread and
 * the token write done inside `effect` (via {@link CloverTokenRepository}) run on
 * the **same** locked connection — it is not possible to acquire the lock on one
 * connection and then read or persist on an unrelated pooled connection.
 *
 * Keeping this a separate short-lived transaction (rather than the caller's
 * request transaction) means the refreshed tokens are committed — and the lock
 * released — as soon as the refresh finishes, instead of being held for the rest
 * of the request. Because the transaction is advisory-lock scoped it does hold
 * one pooled connection while the Clover refresh HTTP call runs; that is an
 * accepted tradeoff (refreshes are rare, per-merchant, and correctness matters
 * more than releasing the connection a little sooner). Do **not** wrap ordinary
 * Clover API calls in this.
 *
 * Locking guarantees:
 * - Same merchant serializes; different merchants never block each other (their
 *   `hashtext` keys differ, barring a benign hash collision that would only make
 *   two unrelated merchants take turns).
 * - The lock is transaction-scoped, so PostgreSQL releases it automatically on
 *   commit, rollback, failure or fiber interruption.
 * - A contended wait longer than `lockTimeoutMs` fails with
 *   {@link MerchantTokenRefreshLockTimeoutError} (retryable) rather than blocking
 *   forever.
 *
 * All SQL is parameterized; the merchant id is never interpolated into a query
 * string, and the 64-bit advisory key never round-trips through a JS number
 * (the hash is computed by PostgreSQL's `hashtext`).
 */
export const withMerchantTokenRefreshLock = <A, E, R>(
  merchantId: string,
  effect: Effect.Effect<A, E, R>,
  options?: { readonly lockTimeoutMs?: number },
): Effect.Effect<
  A,
  E | DatabaseError | MerchantTokenRefreshLockTimeoutError,
  R | Database
> => {
  const lockTimeoutMs = options?.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;

  return Effect.gen(function* () {
    const database = yield* Database;

    return yield* database.withPinnedTransaction((tx) =>
      Effect.gen(function* () {
        const waitStartedAt = Date.now();
        yield* Effect.logInfo("database.clover_token_refresh_lock.waiting", {
          workflowStage: "await_lock",
          merchantId,
          lockTimeoutMs,
        });

        yield* acquireRefreshLock(tx, merchantId, lockTimeoutMs).pipe(
          Effect.tapError((error) =>
            error._tag === "MerchantTokenRefreshLockTimeoutError" ?
              Effect.logWarning("database.clover_token_refresh_lock.timeout", {
                workflowStage: "lock_timeout",
                merchantId,
                lockTimeoutMs,
                failureCategory: "lock_timeout",
                failureDisposition: "retryable",
              })
            : Effect.logWarning("database.clover_token_refresh_lock.failed", {
                workflowStage: "lock_failed",
                merchantId,
                failureCategory: "database_error",
                failureDisposition: "retryable",
              }),
          ),
        );

        const lockWaitMs = Date.now() - waitStartedAt;
        yield* Effect.logInfo("database.clover_token_refresh_lock.acquired", {
          workflowStage: "lock_acquired",
          merchantId,
          lockWaitMs,
        });

        // The reread and any write the caller does run on `tx` — the same locked
        // connection — because `Effect.provideService` swaps the `Database` the
        // effect reads to the lock-pinned transaction.
        return yield* Effect.provideService(effect, Database, tx);
      }),
    );
  });
};

/**
 * Sets a transaction-local `lock_timeout` and takes the merchant's
 * transaction-scoped advisory lock, mapping a lock-timeout abort to the typed,
 * retryable {@link MerchantTokenRefreshLockTimeoutError}.
 */
const acquireRefreshLock = (
  tx: DatabaseService,
  merchantId: string,
  lockTimeoutMs: number,
): Effect.Effect<void, DatabaseError | MerchantTokenRefreshLockTimeoutError> =>
  Effect.gen(function* () {
    // `set_config(name, value, is_local=true)` == `SET LOCAL`, so the timeout is
    // scoped to this transaction and reset on commit/rollback. Value is passed as
    // a bind parameter (a millisecond count is a valid `lock_timeout` value).
    yield* tx.query((db) =>
      db.execute(
        sql`select set_config('lock_timeout', ${String(lockTimeoutMs)}, true)`,
      ),
    );

    yield* tx
      .query((db) =>
        db.execute(
          sql`select pg_advisory_xact_lock(${REFRESH_LOCK_NAMESPACE}, hashtext(${merchantId}))`,
        ),
      )
      .pipe(
        Effect.mapError((error) =>
          isLockTimeout(error) ?
            new MerchantTokenRefreshLockTimeoutError({
              merchantId,
              lockTimeoutMs,
            })
          : error,
        ),
      );
  });

/**
 * Recognizes a PostgreSQL lock-timeout abort (SQLSTATE `55P03`, "canceling
 * statement due to lock timeout") anywhere in the error/cause chain, so a
 * contended advisory lock surfaces as a retryable timeout rather than an opaque
 * database error.
 */
const isLockTimeout = (error: unknown): boolean => {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current != null; depth += 1) {
    if (typeof current === "object") {
      const record = current as {
        code?: unknown;
        message?: unknown;
        cause?: unknown;
      };
      if (record.code === "55P03") {
        return true;
      }
      if (
        typeof record.message === "string" &&
        record.message.toLowerCase().includes("lock timeout")
      ) {
        return true;
      }
      current = record.cause;
      continue;
    }
    break;
  }
  return false;
};

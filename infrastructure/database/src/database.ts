import { make as makeDrizzle } from "@effect/sql-drizzle/Pg";
import { PgClient } from "@effect/sql-pg";
import * as SqlClientModule from "@effect/sql/SqlClient";
import { SqlError } from "@effect/sql/SqlError";
import { SupabaseConfig } from "@forest-city-vault/core-config";
import {
  ConfigError,
  Context,
  Data,
  Effect,
  Layer,
  Redacted,
  Scope,
} from "effect";
import { PgRemoteDatabase } from "drizzle-orm/pg-proxy";
import * as schema from "./schema";

export type SapphoDatabase = PgRemoteDatabase<typeof schema>;

export type DatabaseTransaction = SapphoDatabase;

export class DatabaseError extends Data.TaggedError("DatabaseError")<{
  message: string;
  cause: unknown;
}> {}

/**
 * A handle to an open database transaction bound to a single reserved
 * connection.
 *
 * `database` is a transaction-bound {@link DatabaseService}: every query it runs
 * is routed through this open transaction. `commit`/`rollback` finish the
 * transaction and release the connection. The handle deliberately exposes only
 * these capabilities so the caller can treat the transaction as an opaque saga
 * participant without touching SQL or `@effect/sql` APIs.
 */
export type DatabaseTransactionHandle = {
  readonly database: DatabaseService;
  readonly commit: Effect.Effect<void, DatabaseError>;
  readonly rollback: Effect.Effect<void>;
};

export type DatabaseService = {
  readonly schema: typeof schema;

  readonly query: <A>(
    operation: (db: SapphoDatabase) => Promise<A>,
    options?: {
      readonly errorMessage?: string;
    },
  ) => Effect.Effect<A, DatabaseError>;

  readonly transaction: <A, E, R>(
    operation: (tx: DatabaseTransaction) => Effect.Effect<A, E, R>,
    options?: {
      readonly errorMessage?: string;
    },
  ) => Effect.Effect<A, DatabaseError, R>;

  /**
   * Opens a new database transaction on a connection reserved into the ambient
   * {@link Scope} and returns a {@link DatabaseTransactionHandle} to drive it.
   *
   * Unlike {@link transaction} — a self-contained bracket that begins, commits
   * and rolls back around one effect — `beginTransaction` splits those steps so
   * the commit/rollback can be deferred to a surrounding saga. It reserves a
   * connection into the caller's scope (so its release is a finalizer of that
   * scope) and begins immediately, then hands back a transaction-bound
   * `database` (whose queries all run on this transaction) plus `commit`/
   * `rollback` (which finish it). The reserved connection is released when the
   * scope closes — after commit or rollback has run — so a saga can extend that
   * scope to keep the transaction open across its whole lifetime.
   */
  readonly beginTransaction: Effect.Effect<
    DatabaseTransactionHandle,
    DatabaseError,
    Scope.Scope
  >;
};

export class Database extends Context.Tag("sappho/Database")<
  Database,
  DatabaseService
>() {}

const makeSapphoDatabase = makeDrizzle<typeof schema>();

const createDatabaseService = Effect.gen(function* () {
  const db = yield* makeSapphoDatabase;
  const sql = yield* SqlClientModule.SqlClient;

  // Builds the service methods, threading every query-running effect through
  // `pin`. For the base service `pin` is the identity; a transaction-bound
  // service passes a `pin` that routes each query onto its reserved connection.
  const buildService = (
    pin: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>,
  ): DatabaseService => ({
    schema,

    query: <A>(
      operation: (db: SapphoDatabase) => Promise<A>,
      options?: {
        readonly errorMessage?: string;
      },
    ) =>
      pin(
        tryDatabasePromise(
          () => operation(db),
          options?.errorMessage ?? "Database query failed",
        ),
      ),

    transaction: <A, E, R>(
      operation: (tx: DatabaseTransaction) => Effect.Effect<A, E, R>,
      options?: {
        readonly errorMessage?: string;
      },
    ) =>
      pin(
        sql
          .withTransaction(
            Effect.gen(function* () {
              const txDb = yield* Effect.provideService(
                makeDrizzle<typeof schema>(),
                SqlClientModule.SqlClient,
                sql,
              );

              return yield* operation(txDb).pipe(
                Effect.catchAll(
                  (cause) =>
                    new DatabaseError({
                      message:
                        options?.errorMessage ?? "Database transaction failed",
                      cause,
                    }),
                ),
              );
            }),
          )
          .pipe(
            Effect.mapError((err) =>
              err instanceof DatabaseError ? err : (
                new DatabaseError({
                  message:
                    options?.errorMessage ?? "Database transaction failed",
                  cause: err,
                })
              ),
            ),
          ),
      ),

    beginTransaction,
  });

  const beginTransaction: Effect.Effect<
    DatabaseTransactionHandle,
    DatabaseError,
    Scope.Scope
  > = Effect.gen(function* () {
    // Reserve a connection into the ambient scope. Its release is registered as
    // a finalizer of that scope, so the connection lives until the scope closes
    // — which, for a saga, is after commit/rollback has run.
    const connection = yield* sql.reserve.pipe(
      Effect.mapError(
        (cause) =>
          new DatabaseError({
            message: "Failed to reserve a database connection",
            cause,
          }),
      ),
    );

    yield* connection.executeUnprepared("BEGIN", [], undefined).pipe(
      Effect.mapError(
        (cause) =>
          new DatabaseError({
            message: "Failed to begin database transaction",
            cause,
          }),
      ),
    );

    // Route every query the transaction-bound service runs onto this
    // connection: the SqlClient consults the TransactionConnection tag before
    // falling back to the pool, so all work runs on this open transaction.
    const pin = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.provideService(effect, SqlClientModule.TransactionConnection, [
        connection,
        0,
      ] as const);

    return {
      database: buildService(pin),

      commit: connection.executeUnprepared("COMMIT", [], undefined).pipe(
        Effect.mapError(
          (cause) =>
            new DatabaseError({
              message: "Failed to commit database transaction",
              cause,
            }),
        ),
        Effect.asVoid,
      ),

      rollback: Effect.ignore(
        connection.executeUnprepared("ROLLBACK", [], undefined),
      ),
    } satisfies DatabaseTransactionHandle;
  });

  return buildService((effect) => effect);
});

/**
 * Base database layer. Requires `SqlClient.SqlClient` to be provided externally.
 * Use this layer in tests by injecting a test SQL client (e.g. via PgClient.layer or a test adapter).
 */
export const DatabaseLayer: Layer.Layer<
  Database,
  never,
  SqlClientModule.SqlClient
> = Layer.effect(Database, createDatabaseService);

const PgLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const { databaseUrl } = yield* SupabaseConfig;

    return PgClient.layer({
      url: Redacted.make(databaseUrl),
    });
  }),
);

export const DatabaseLive: Layer.Layer<
  Database,
  SqlError | ConfigError.ConfigError,
  never
> = DatabaseLayer.pipe(
  Layer.provide(PgLive),
  Layer.provide(SupabaseConfig.Default),
);

export { SupabaseConfig } from "@forest-city-vault/core-config";
export * as dbSchema from "./schema";

function tryDatabasePromise<A>(
  operation: () => Promise<A>,
  errorMessage: string,
) {
  return Effect.tryPromise({
    try: operation,
    catch: (cause) => new DatabaseError({ message: errorMessage, cause }),
  });
}

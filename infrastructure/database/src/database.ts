import { make as makeDrizzle } from "@effect/sql-drizzle/Pg";
import { PgClient } from "@effect/sql-pg";
import * as SqlClientModule from "@effect/sql/SqlClient";
import { SqlError } from "@effect/sql/SqlError";
import { SupabaseConfig } from "@forest-city-vault/core-config";
import { ConfigError, Context, Data, Effect, Layer, Redacted } from "effect";
import { PgRemoteDatabase } from "drizzle-orm/pg-proxy";
import * as schema from "./schema";

export type SapphoDatabase = PgRemoteDatabase<typeof schema>;

export type DatabaseTransaction = SapphoDatabase;

export class DatabaseError extends Data.TaggedError("DatabaseError")<{
  message: string;
  cause: unknown;
}> {}

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
};

export class Database extends Context.Tag("sappho/Database")<
  Database,
  DatabaseService
>() {}

const makeSapphoDatabase = makeDrizzle<typeof schema>();

const createDatabaseService = Effect.gen(function* () {
  const db = yield* makeSapphoDatabase;
  const sql = yield* SqlClientModule.SqlClient;

  return {
    schema,

    query: <A>(
      operation: (db: SapphoDatabase) => Promise<A>,
      options?: {
        readonly errorMessage?: string;
      },
    ) =>
      tryDatabasePromise(
        () => operation(db),
        options?.errorMessage ?? "Database query failed",
      ),

    transaction: <A, E, R>(
      operation: (tx: DatabaseTransaction) => Effect.Effect<A, E, R>,
      options?: {
        readonly errorMessage?: string;
      },
    ) =>
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
            err instanceof DatabaseError
              ? err
              : new DatabaseError({
                  message:
                    options?.errorMessage ?? "Database transaction failed",
                  cause: err,
                }),
          ),
        ),
  } satisfies DatabaseService;
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

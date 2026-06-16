import { make as makeDrizzle } from "@effect/sql-drizzle/Pg";
import { PgClient } from "@effect/sql-pg";
import * as SqlClientModule from "@effect/sql/SqlClient";
import { SqlError } from "@effect/sql/SqlError";
import { SupabaseConfig } from "@forest-city-vault/core-config";
import { ConfigError, Context, Data, Effect, Layer, Redacted } from "effect";
import * as schema from "./schema";
import { PgRemoteDatabase } from "drizzle-orm/pg-proxy";

type SapphoDatabase = PgRemoteDatabase<typeof schema>;

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

  readonly transaction: <A>(
    operation: (tx: DatabaseTransaction) => Promise<A>,
    options?: {
      readonly errorMessage?: string;
    },
  ) => Effect.Effect<A, DatabaseError>;
};

export class Database extends Context.Tag("sappho/Database")<
  Database,
  DatabaseService
>() {}

const makeSapphoDatabase = makeDrizzle<typeof schema>({ schema });

const createDatabaseService = Effect.gen(function* () {
  const db = yield* makeSapphoDatabase;
  const sql = yield* PgClient.PgClient;

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

    transaction: <A>(
      operation: (tx: DatabaseTransaction) => Promise<A>,
      options?: {
        readonly errorMessage?: string;
      },
    ) =>
      sql
        .withTransaction(
          Effect.gen(function* () {
            const txDb = yield* Effect.provideService(
              makeDrizzle<typeof schema>({ schema }),
              SqlClientModule.SqlClient,
              sql,
            );
            return yield* Effect.tryPromise({
              try: () => operation(txDb),
              catch: (cause) =>
                new DatabaseError({
                  message:
                    options?.errorMessage ?? "Database transaction failed",
                  cause,
                }),
            });
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
> = Layer.effect(Database, createDatabaseService).pipe(
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

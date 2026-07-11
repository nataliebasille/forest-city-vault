import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as SqlClientModule from "@effect/sql/SqlClient";
import type { Connection } from "@effect/sql/SqlConnection";
import { SqlError } from "@effect/sql/SqlError";
import { makeCompiler } from "@effect/sql-pg/PgClient";
import * as Reactivity from "@effect/experimental/Reactivity";
import { Effect, Layer, Stream } from "effect";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { DatabaseLayer } from "./index";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const defaultMigrationsFolder = resolve(__dirname, "../drizzle");

/**
 * Adapts a PGlite instance to the @effect/sql Connection interface so it can
 * be used as the backing store for a SqlClient.
 */
class PGliteConnection implements Connection {
  constructor(private readonly client: PGlite) {}

  execute(
    sql: string,
    params: ReadonlyArray<unknown>,
    transformRows:
      | (<A extends object>(rows: ReadonlyArray<A>) => ReadonlyArray<A>)
      | undefined,
  ) {
    return Effect.tryPromise({
      try: async () => {
        const { rows } = await this.client.query(sql, params as unknown[]);
        const typed = rows as ReadonlyArray<{ [k: string]: unknown }>;
        return (
          transformRows ? transformRows(typed) : typed
        ) as ReadonlyArray<never>;
      },
      catch: (cause) =>
        new SqlError({ cause, message: "Failed to execute statement" }),
    });
  }

  executeRaw(sql: string, params: ReadonlyArray<unknown>) {
    return Effect.tryPromise({
      try: () => this.client.query(sql, params as unknown[]),
      catch: (cause) =>
        new SqlError({ cause, message: "Failed to execute raw statement" }),
    });
  }

  executeValues(sql: string, params: ReadonlyArray<unknown>) {
    return Effect.tryPromise({
      try: async () => {
        const { rows } = await this.client.query(sql, params as unknown[]);
        return rows.map((row) =>
          Object.values(row as Record<string, unknown>),
        ) as ReadonlyArray<ReadonlyArray<unknown>>;
      },
      catch: (cause) =>
        new SqlError({ cause, message: "Failed to execute values" }),
    });
  }

  executeUnprepared(
    sql: string,
    params: ReadonlyArray<unknown>,
    transformRows:
      | (<A extends object>(rows: ReadonlyArray<A>) => ReadonlyArray<A>)
      | undefined,
  ) {
    return this.execute(sql, params, transformRows);
  }

  executeStream(
    sql: string,
    params: ReadonlyArray<unknown>,
    transformRows:
      | (<A extends object>(rows: ReadonlyArray<A>) => ReadonlyArray<A>)
      | undefined,
  ) {
    return Stream.unwrap(
      Effect.map(this.execute(sql, params, transformRows), Stream.fromIterable),
    );
  }
}

/**
 * Builds a SqlClient-providing Layer backed by a PGlite instance obtained from
 * `acquireClient`. The client is created lazily when the layer is built, so each
 * layer build gets its own isolated database. Runs migrations on startup and
 * provides Reactivity internally.
 */
const makePGliteClientLayer = (
  acquireClient: () => PGlite,
  migrationsFolder: string,
) =>
  Layer.effect(
    SqlClientModule.SqlClient,
    Effect.gen(function* () {
      const client = acquireClient();
      const migrationDb = drizzle(client);
      yield* Effect.promise(() => migrate(migrationDb, { migrationsFolder }));

      return yield* SqlClientModule.make({
        acquirer: Effect.succeed(new PGliteConnection(client)),
        compiler: makeCompiler(),
        spanAttributes: [["db.system", "pglite"]],
      });
    }),
  ).pipe(Layer.provide(Reactivity.layer));

/**
 * Creates an in-memory PGlite database Layer for testing.
 * Injects a PGlite-backed SqlClient into the shared DatabaseLayer — all
 * service logic is reused without reimplementing it.
 *
 * @param migrationsFolder Path to the drizzle migrations folder.
 *   Defaults to `packages/database/drizzle`.
 */
export const makeDatabaseTest = (migrationsFolder = defaultMigrationsFolder) =>
  DatabaseLayer.pipe(
    Layer.provide(makePGliteClientLayer(() => new PGlite(), migrationsFolder)),
  );

/**
 * Builds a testing {@link Database} layer alongside a drizzle handle to the same
 * in-memory PGlite instance.
 *
 * Migrations are run eagerly on `client` before returning, so a test can read
 * and seed the database directly via `db` immediately — before any route or
 * effect builds the `layer`. The returned `layer` provides the real
 * {@link DatabaseService} (including a working `beginTransaction`, so saga-scoped
 * code can run); its own migration step is an idempotent no-op on the
 * already-migrated `client`.
 */
export const makeDatabaseTestContext = async (
  migrationsFolder = defaultMigrationsFolder,
) => {
  const client = new PGlite();
  const db = drizzle(client);
  await migrate(db, { migrationsFolder });
  const layer = DatabaseLayer.pipe(
    Layer.provide(makePGliteClientLayer(() => client, migrationsFolder)),
  );

  return { layer, db, client };
};

/**
 * A ready-to-use in-memory database Layer for tests.
 * Each Layer instantiation gets a fresh, isolated PGlite database.
 */
export const DatabaseTest = makeDatabaseTest();

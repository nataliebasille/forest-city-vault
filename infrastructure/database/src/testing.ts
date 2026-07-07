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
 * Builds a SqlClient-providing Layer backed by an already-constructed PGlite
 * instance. Unlike {@link makePGliteClientLayer} this neither creates the client
 * nor runs migrations, so a caller can share one PGlite instance between the
 * Effect `Database` service and a plain drizzle handle (e.g. for test
 * assertions) and control migration itself.
 */
const makePGliteClientLayerFromClient = (client: PGlite) =>
  Layer.effect(
    SqlClientModule.SqlClient,
    SqlClientModule.make({
      acquirer: Effect.succeed(new PGliteConnection(client)),
      compiler: makeCompiler(),
      spanAttributes: [["db.system", "pglite"]],
    }),
  ).pipe(Layer.provide(Reactivity.layer));

/**
 * Builds a SqlClient-providing Layer backed by an in-memory PGlite instance.
 * Runs migrations on startup. Provides Reactivity internally.
 */
const makePGliteClientLayer = (migrationsFolder: string) =>
  Layer.unwrapEffect(
    Effect.gen(function* () {
      const pgClient = new PGlite();
      const migrationDb = drizzle(pgClient);
      yield* Effect.promise(() => migrate(migrationDb, { migrationsFolder }));

      return makePGliteClientLayerFromClient(pgClient);
    }),
  );

/**
 * Creates an in-memory PGlite database Layer for testing.
 * Injects a PGlite-backed SqlClient into the shared DatabaseLayer — all
 * service logic is reused without reimplementing it.
 *
 * @param migrationsFolder Path to the drizzle migrations folder.
 *   Defaults to `packages/database/drizzle`.
 */
export const makeDatabaseTest = (migrationsFolder = defaultMigrationsFolder) =>
  DatabaseLayer.pipe(Layer.provide(makePGliteClientLayer(migrationsFolder)));

/**
 * A ready-to-use in-memory database Layer for tests.
 * Each Layer instantiation gets a fresh, isolated PGlite database.
 */
export const DatabaseTest = makeDatabaseTest();

/**
 * Builds a full {@link Database} Layer over an already-constructed PGlite
 * instance. The caller owns the client (and is responsible for running
 * migrations against it), so the same in-memory database can also be reached
 * through a plain drizzle handle for assertions. This exposes the *real*
 * `Database` service — including saga-capable `beginTransaction` — so tests
 * exercise commit/rollback exactly as production does.
 */
export const makeDatabaseTestLayerFromClient = (client: PGlite) =>
  DatabaseLayer.pipe(Layer.provide(makePGliteClientLayerFromClient(client)));

/**
 * A fresh, migrated in-memory database for a single test, bundling everything a
 * caller needs so no test has to re-implement PGlite setup, migration or layer
 * wiring:
 *
 * - `layer` — the *real* transactional {@link Database} service (including the
 *   saga's `beginTransaction`), suitable for providing to the code under test;
 * - `db` — a plain drizzle handle to the **same** instance, for seeding and
 *   assertions (it observes exactly what the code under test committed, and
 *   nothing it rolled back);
 * - `client` — the underlying PGlite instance, should a caller need it.
 */
export interface TestDatabase {
  readonly layer: ReturnType<typeof makeDatabaseTestLayerFromClient>;
  readonly db: ReturnType<typeof drizzle>;
  readonly client: PGlite;
  /**
   * Empties every application table, restoring the database to its freshly
   * migrated (but seedless) state. It discovers the tables from the live schema
   * — `TRUNCATE ... RESTART IDENTITY CASCADE` over every `public` table — so a
   * test never has to name tables by hand and new tables are covered
   * automatically. The drizzle migration bookkeeping (in the `drizzle` schema)
   * is left untouched, so no re-migration is needed between tests.
   */
  readonly reset: () => Promise<void>;
}

/**
 * Builds a {@link TestDatabase.reset} bound to a PGlite client. Kept as its own
 * factory so every entry point that hands out a test database resets it the same
 * way.
 */
const makeReset = (client: PGlite) => async () => {
  const { rows } = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
  );

  if (rows.length === 0) {
    return;
  }

  const tables = rows.map((row) => `"${row.tablename}"`).join(", ");
  await client.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
};

/**
 * Creates a {@link TestDatabase}: spins up a fresh in-memory PGlite instance,
 * runs the drizzle migrations against it and returns the shared layer/handle.
 *
 * This is the single entry point tests (in this package or downstream apps)
 * should use to get a working database, so migration-folder resolution and
 * client/layer wiring live in exactly one place.
 *
 * @param migrationsFolder Path to the drizzle migrations folder.
 *   Defaults to this package's `drizzle` folder.
 */
export const createTestDatabase = async (
  migrationsFolder = defaultMigrationsFolder,
): Promise<TestDatabase> => {
  const client = new PGlite();
  const db = drizzle(client);
  await migrate(db, { migrationsFolder });

  return {
    client,
    db,
    layer: makeDatabaseTestLayerFromClient(client),
    reset: makeReset(client),
  };
};

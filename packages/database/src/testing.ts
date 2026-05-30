import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { Effect, Layer } from "effect";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Database, DatabaseError, type DatabaseService } from "./index";
import * as schema from "./schema";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const defaultMigrationsFolder = resolve(__dirname, "../drizzle");

/**
 * Creates an in-memory PGlite database Layer for testing.
 * Runs all Drizzle migrations automatically on setup.
 *
 * @param migrationsFolder Path to the drizzle migrations folder.
 *   Defaults to `packages/database/drizzle`.
 */
export const makeDatabaseTest = (migrationsFolder = defaultMigrationsFolder) =>
  Layer.effect(
    Database,
    Effect.gen(function* () {
      const client = new PGlite();
      const db = drizzle(client, { schema });
      yield* Effect.promise(() => migrate(db, { migrationsFolder }));

      return {
        schema,

        query: <A>(
          operation: (
            db: Parameters<DatabaseService["query"]>[0] extends (
              db: infer D,
            ) => unknown
              ? D
              : never,
          ) => Promise<A>,
          options?: { readonly errorMessage?: string },
        ) =>
          Effect.tryPromise({
            // PgliteDatabase shares the PgDatabase query interface
            try: () => operation(db as never),
            catch: (cause) =>
              new DatabaseError({
                message: options?.errorMessage ?? "Database query failed",
                cause,
              }),
          }),

        transaction: <A>(
          operation: (
            tx: Parameters<DatabaseService["transaction"]>[0] extends (
              tx: infer T,
            ) => unknown
              ? T
              : never,
          ) => Promise<A>,
          options?: { readonly errorMessage?: string },
        ) =>
          Effect.tryPromise({
            try: () => db.transaction((tx) => operation(tx as never)),
            catch: (cause) =>
              new DatabaseError({
                message: options?.errorMessage ?? "Database transaction failed",
                cause,
              }),
          }),
      } satisfies DatabaseService;
    }),
  );

/**
 * A ready-to-use in-memory database Layer for tests.
 * Each Layer instantiation gets a fresh, isolated PGlite database.
 */
export const DatabaseTest = makeDatabaseTest();

import { Layer } from "effect";
import { Database } from "./index";
/**
 * Creates an in-memory PGlite database Layer for testing.
 * Runs all Drizzle migrations automatically on setup.
 *
 * @param migrationsFolder Path to the drizzle migrations folder.
 *   Defaults to `packages/database/drizzle`.
 */
export declare const makeDatabaseTest: (migrationsFolder?: string) => Layer.Layer<Database, never, never>;
/**
 * A ready-to-use in-memory database Layer for tests.
 * Each Layer instantiation gets a fresh, isolated PGlite database.
 */
export declare const DatabaseTest: Layer.Layer<Database, never, never>;

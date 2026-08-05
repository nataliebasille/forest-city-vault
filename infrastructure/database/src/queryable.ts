import {
  makeQueryable,
  type Queryable,
} from "@forest-city-vault/core-queryable";
import { Context, Effect } from "effect";
import { Database, DatabaseError, type SapphoDatabase } from "./database";

/**
 * The read-only slice of the drizzle {@link SapphoDatabase} handle: only the
 * query-builder entry points (`select` and the `with`/`$with` CTE builders).
 * `insert`/`update`/`delete` and the raw `execute` escape hatch are absent, so a
 * caller given this handle cannot compile a mutation.
 */
export type SapphoReadDatabase = Pick<
  SapphoDatabase,
  "select" | "with" | "$with"
>;

/**
 * This project's {@link Queryable}: the generic read-only capability bound to
 * the read-only drizzle handle and the shared {@link DatabaseError} channel.
 */
export type SapphoQueryable = Queryable<SapphoReadDatabase, DatabaseError>;

/**
 * Service tag for the app's read-only query capability. Handlers `yield*` it and
 * call `query((db) => db.select()…)`; the layer ({@link QueryableLive}) supplies
 * the implementation.
 */
export const SapphoQueryable =
  Context.GenericTag<SapphoQueryable>("sappho/Queryable");

/**
 * Provides {@link SapphoQueryable} by wrapping the mutation-capable
 * {@link Database}: it reuses the same pooled connection, `query` machinery and
 * {@link DatabaseError} channel, but narrows the handle handed to callers to the
 * read-only {@link SapphoReadDatabase}. Requires `Database`, so it is built on
 * whatever `Database` the composition root provides.
 */
export const QueryableLive = makeQueryable(
  SapphoQueryable,
  // `Database.query` runs the read on the pooled connection and maps failures to
  // `DatabaseError`; its full handle satisfies the narrowed read surface, so it
  // is the read-only `query` unchanged.
  Effect.map(Database, (db) => db.query),
);

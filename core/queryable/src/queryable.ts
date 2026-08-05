import type { Effect } from "effect";

/**
 * A read-only query capability over some concrete database handle `DB`, generic
 * in both the handle it hands to callers and the error `E` its queries fail
 * with.
 *
 * `DB` is deliberately open: point it at a driver's full handle, or at a
 * read-only slice of one, and callers can reach only whatever `DB` exposes — so
 * narrowing `DB` to a read-only surface makes mutations impossible to compile.
 * The abstraction knows nothing about any specific driver, ORM, or pool; an
 * adapter binds `DB`/`E` to a concrete stack and supplies the implementation.
 */
export interface Queryable<DB, E> {
  readonly query: <A>(
    operation: (db: DB) => Promise<A>,
    options?: { readonly errorMessage?: string },
  ) => Effect.Effect<A, E>;
}

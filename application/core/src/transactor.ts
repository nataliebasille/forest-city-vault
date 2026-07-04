import { Context, Data, Effect } from "effect";

/**
 * Failure raised when the underlying storage cannot commit (or roll back) the
 * work run inside a transaction.
 *
 * This is the application-level stand-in for a persistence failure: the concrete
 * infrastructure adapter maps its own errors (e.g. a database error) onto this
 * type, so the application layer never has to know about—or depend on—the
 * infrastructure that actually runs the transaction.
 */
export class TransactorError extends Data.TaggedError(
  "application/TransactorError",
)<{
  message: string;
  cause: unknown;
}> {}

/**
 * The storage abstraction the application uses to run work atomically.
 *
 * `transaction` runs the given effect inside a single storage transaction:
 *
 * - the effect **succeeds** → the transaction commits and its value is returned.
 * - the effect **fails or dies** → the transaction rolls back and the original
 *   typed error/defect is re-raised unchanged.
 * - the transaction itself can't commit/roll back → a {@link TransactorError} is
 *   raised.
 *
 * Anything the effect does through the shared database connection (repositories,
 * the event store, ad-hoc queries) automatically participates in the same
 * transaction, so it all commits or rolls back together.
 *
 * This is an application-owned port. The concrete implementation lives in the
 * infrastructure layer (which depends inward on the application), keeping the
 * dependency flow domain → application → infrastructure intact.
 */
export class Transactor extends Context.Tag("application/Transactor")<
  Transactor,
  Transactor.Service
>() {}

export namespace Transactor {
  export type Service = {
    readonly transaction: <A, E, R>(
      effect: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E | TransactorError, R>;
  };
}

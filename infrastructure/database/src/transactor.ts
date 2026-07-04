import {
  Transactor,
  TransactorError,
} from "@forest-city-vault/application-core";
import { Effect, Exit, Layer } from "effect";
import { Database, DatabaseError } from "./database";

/**
 * Marker used to smuggle the original {@link Exit} of the wrapped effect out of
 * a database transaction.
 *
 * `Database.transaction` collapses every failure into a {@link DatabaseError},
 * which would erase the caller's typed error/defect. To keep the original error
 * intact we always let the wrapped effect *succeed* (capturing its outcome as an
 * {@link Exit}) and, when that outcome is a failure, deliberately fail the
 * transaction with this marker so the database still rolls back. Afterwards we
 * unwrap the captured exit and re-raise it unchanged.
 */
class Rollback<A, E> {
  constructor(readonly exit: Exit.Exit<A, E>) {}
}

/**
 * Concrete {@link Transactor} backed by the shared {@link Database} service.
 *
 * Each run opens one database transaction. Every query issued through the same
 * database connection while the effect runs — including the event store's
 * persistence and any repository — automatically participates in that
 * transaction. On success it commits; on failure or defect it rolls back and
 * re-raises the original typed error/defect unchanged. A genuine commit/roll
 * back failure surfaces as a {@link TransactorError}.
 *
 * This layer lives in the infrastructure package and depends inward on the
 * application-owned {@link Transactor} port, keeping the dependency flow
 * domain → application → infrastructure intact.
 */
export const TransactorLive = Layer.effect(
  Transactor,
  Effect.gen(function* () {
    const database = yield* Database;

    const transaction: Transactor.Service["transaction"] = <A, E, R>(
      effect: Effect.Effect<A, E, R>,
    ) =>
      database
        .transaction(() =>
          // Capture the outcome instead of letting it fail: a failure/defect
          // would otherwise be rewritten as a `DatabaseError`, losing the
          // caller's typed error. On failure we re-fail with `Rollback` so the
          // transaction still rolls back.
          Effect.exit(effect).pipe(
            Effect.flatMap((exit) =>
              Exit.isSuccess(exit)
                ? Effect.succeed(exit)
                : Effect.fail(new Rollback(exit)),
            ),
          ),
        )
        .pipe(
          // Intentional rollback: recover back into the success channel so the
          // captured exit can be re-raised below. Uses a plain predicate so the
          // remaining (genuine) `DatabaseError` stays in the type for the next
          // handler.
          Effect.catchIf(
            (error) =>
              error instanceof DatabaseError && error.cause instanceof Rollback,
            (error) =>
              Effect.succeed(
                ((error as DatabaseError).cause as Rollback<A, E>)
                  .exit as Exit.Exit<A, E>,
              ),
          ),
          // Any remaining database error is a genuine commit/rollback failure.
          Effect.catchIf(
            (error): error is DatabaseError => error instanceof DatabaseError,
            (cause) =>
              Effect.fail(
                new TransactorError({
                  message: "Transaction failed to commit",
                  cause,
                }),
              ),
          ),
          // Re-raise the captured outcome, restoring the original success value
          // or typed error/defect.
          Effect.flatMap((exit) => exit),
        );

    return { transaction } satisfies Transactor.Service;
  }),
);

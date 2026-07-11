import { Effect, Exit, Scope } from "effect";
import { Participant, Saga, SagaError } from "./saga";

/**
 * Runs `effect` as a single saga.
 *
 * The saga *is* a {@link Scope}. This combinator opens one fresh scope, provides
 * a {@link Saga} service backed by it, then closes the scope with the wrapped
 * effect's `Exit` to drive finalization once that effect has settled:
 *
 * - the effect **succeeds** → every registered participant is committed in
 *   registration order, *before* the value is returned, so callers build their
 *   result from the committed outcome. A participant that cannot commit raises a
 *   {@link SagaError} in the error channel. The scope is then closed
 *   *successfully*, so rollbacks stay dormant while any acquired resources
 *   (reserved connections, …) are still released by their finalizers.
 * - the effect **fails, dies or is interrupted** → the scope is closed with that
 *   failure, so every participant's rollback finalizer runs in reverse
 *   registration order (best-effort) and the original typed error/defect is
 *   re-raised unchanged.
 *
 * It owns **only** the saga's scope and its commit queue. Every other
 * saga-scoped service (a database transaction, the `EventTracker`, an event
 * broker, …) is provided uniformly by the caller as a layer on `effect`:
 * participants join via {@link sagaScoped}, flush-through buffers are provided
 * as plain scoped layers. The combinator never names a database, SQL,
 * `EventTracker` or any concrete service — participants are opaque — keeping the
 * dependency flow domain → application → infrastructure intact.
 */
export const withSaga = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    // The saga's scope, plus the ordered commits registered against it. The
    // service closes over both so participants can register while `effect` runs.
    const scope = yield* Scope.make();
    const commits: Participant["commit"][] = [];
    const saga = Saga.make(scope, commits);

    const exit = yield* Effect.exit(Effect.provideService(effect, Saga, saga));

    if (Exit.isSuccess(exit)) {
      // Commit in registration order in the value channel, so a commit failure
      // becomes a typed SagaError rather than a scope-close defect.
      const commitExit = yield* Effect.exit(
        Effect.forEach(
          commits,
          (commit) =>
            commit.pipe(
              Effect.mapError(
                (cause) =>
                  new SagaError({
                    message: "Failed to commit saga",
                    cause,
                  }),
              ),
            ),
          { discard: true },
        ),
      );

      // Close the scope successfully: rollbacks (gated on failure) stay dormant,
      // but any resources acquired for the saga are still released. Done even
      // when a commit failed, matching "commit failure does not roll back".
      yield* Scope.close(scope, Exit.void);

      if (Exit.isFailure(commitExit)) {
        return yield* commitExit;
      }

      return exit.value;
    }

    // Close the scope with the failure so rollback finalizers run in reverse
    // registration order (best-effort), then re-raise the original cause.
    yield* Scope.close(scope, exit);

    return yield* exit;
  });

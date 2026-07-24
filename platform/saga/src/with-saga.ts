import { Effect, Exit, Layer, Scope } from "effect";
import { Participant, Saga, SagaError } from "./saga";
import { SagaScopedLayer } from "./saga-scoped-layer";

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
 * Saga-scoped services are **not** handed in by the caller. The application
 * declares them once at the boundary via {@link provideSagaScoped}; this
 * combinator reads that ambient {@link SagaScopedLayer} and re-materialises it
 * against the saga's own fresh {@link Saga}, so every saga (each request, each
 * drained message, …) gets its own transaction-bound services that commit or
 * roll back with it. When no such layer is declared the default is empty and
 * there is simply nothing to rebuild.
 *
 * Beyond that rebuild the combinator owns **only** the saga's scope and its
 * commit queue. Every saga-scoped service (a database transaction, the
 * `EventTracker`, an event broker, …) joins uniformly through {@link sagaScoped}
 * within the layer it rebuilds. The combinator never names a database, SQL,
 * `EventTracker` or any concrete service — participants are opaque — keeping the
 * dependency flow domain → application → infrastructure intact.
 */
export const withSaga = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    // The layer of saga-scoped services to rebuild for this saga, declared at
    // the boundary (empty when none). Rebuilt below so its services bind to
    // this saga's fresh Saga rather than being shared across sagas.
    const sagaScopedLayer = yield* SagaScopedLayer;

    // The saga's scope, plus the ordered commits registered against it. The
    // service closes over both so participants can register while `effect` runs.
    const scope = yield* Scope.make();
    const commits: Participant["commit"][] = [];
    const saga = Saga.make(scope, commits);

    // Provide the fresh Saga both to `effect` and to the saga-scoped layer it
    // depends on, then build that layer here so its transaction/services bind to
    // this saga.
    const sagaLayer = Layer.provideMerge(
      sagaScopedLayer,
      Layer.succeed(Saga, saga),
    );

    const exit = yield* Effect.exit(Effect.provide(effect, sagaLayer));

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

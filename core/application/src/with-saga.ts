import { Effect, Exit } from "effect";
import { Saga, SagaError } from "./saga";

/**
 * Runs `effect` as a single saga.
 *
 * This combinator owns exactly one thing: a fresh {@link Saga} registry for the
 * scope, which it drives once the wrapped effect has settled:
 *
 * - the effect **succeeds** → every registered participant is committed in
 *   registration order, *before* the value is returned, so callers build their
 *   result from the committed outcome. A participant that cannot commit raises a
 *   {@link SagaError} in the error channel.
 * - the effect **fails, dies or is interrupted** → every registered participant
 *   is rolled back in reverse order (best-effort) and the original typed
 *   error/defect is re-raised unchanged.
 *
 * It provides **only** `Saga.make` — the registry is the saga. Every other
 * saga-scoped service (a database transaction, the `EventTracker`, an event
 * broker, …) is provided uniformly by the caller as a layer on `effect`:
 * participants join via {@link sagaScoped}, flush-through buffers are provided
 * as plain scoped layers. The combinator never names a database, SQL,
 * `EventTracker` or any concrete service — participants are opaque — keeping the
 * dependency flow domain → application → infrastructure intact.
 */
export const withSaga = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const saga = yield* Saga;

    const exit = yield* Effect.exit(effect);
    const participants = yield* saga.participants;

    if (Exit.isSuccess(exit)) {
      // Commit before returning so the caller's result reflects the committed
      // outcome. A commit failure becomes a typed error, not a defect.
      for (const participant of participants) {
        yield* participant.commit.pipe(
          Effect.mapError(
            (cause) =>
              new SagaError({
                message: "Failed to commit saga",
                cause,
              }),
          ),
        );
      }

      return exit.value;
    }

    // Roll back in reverse registration order, best-effort, then re-raise the
    // original typed error/defect unchanged.
    for (const participant of [...participants].reverse()) {
      yield* Effect.ignore(participant.rollback);
    }

    return yield* exit;
  }).pipe(Effect.provide(Saga.make));

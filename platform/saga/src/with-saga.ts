import { Effect, Exit } from "effect";
import { Saga, SagaError } from "./saga";

/**
 * Drives the **ambient** {@link Saga} around `effect`.
 *
 * This is the raw combinator: it reads the {@link Saga} registry from the
 * surrounding context — it does **not** provide one — and drives it once the
 * wrapped effect has settled:
 *
 * - the effect **succeeds** → every registered participant is committed in
 *   registration order, *before* the value is returned, so callers build their
 *   result from the committed outcome. A participant that cannot commit raises a
 *   {@link SagaError} in the error channel.
 * - the effect **fails, dies or is interrupted** → every registered participant
 *   is rolled back in reverse order (best-effort) and the original typed
 *   error/defect is re-raised unchanged.
 *
 * Because the registry is ambient, the caller decides where it comes from and
 * what else shares it. This is what lets a request boundary provide `Saga.make`
 * *together with* its saga-scoped participants (a transaction-bound `Database`,
 * an event broker, …) at one seam, so those participants register into the very
 * registry `runSaga` drains. The combinator never names a database, SQL,
 * `EventTracker` or any concrete service — participants are opaque — keeping the
 * dependency flow domain → application → infrastructure intact.
 *
 * Prefer {@link withSaga} for a self-contained saga that owns its own registry.
 */
export const runSaga = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
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
  });

/**
 * Runs `effect` as a single, self-contained saga.
 *
 * Provides a fresh {@link Saga} registry (`Saga.make`) and drives it via
 * {@link runSaga}: the registry *is* the saga. Every other saga-scoped service
 * (a database transaction, the `EventTracker`, an event broker, …) is provided
 * uniformly by the caller as a layer on `effect` — participants join via
 * {@link sagaScoped}, flush-through buffers are provided as plain scoped layers.
 *
 * Use this when the saga owns its registry (standalone effects, tests, a nested
 * saga). When the registry must be shared with saga-scoped participants provided
 * at the same boundary (e.g. a request that provides `Saga.make` alongside a
 * transaction-bound `Database`), drive the ambient registry with {@link runSaga}
 * and provide `Saga.make` yourself so both sides see the same registry.
 */
export const withSaga = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  runSaga(effect).pipe(Effect.provide(Saga.make));

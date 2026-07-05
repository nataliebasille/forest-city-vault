import { Context, Data, Effect, Layer } from "effect";

/**
 * Failure raised when a participant cannot commit the work run inside a saga.
 *
 * This is the application-level stand-in for a finalization failure: a concrete
 * scoped service (e.g. a database transaction) maps its own errors onto this
 * type through its {@link Participant}, so the application layer surfaces a
 * commit failure in the error channel without ever depending on—or knowing
 * about—the infrastructure that actually ran the work.
 */
export class SagaError extends Data.TaggedError("platform/SagaError")<{
  message: string;
  cause: unknown;
}> {}

/**
 * A scoped service that needs finalization when the saga ends.
 *
 * A participant does real work during the saga (e.g. a database transaction)
 * and hands the saga two effects to run when it finishes:
 *
 * - `commit` runs when the saga **succeeds**. It may fail (e.g. the underlying
 *   storage cannot commit); the combinator maps that failure onto a
 *   {@link SagaError} so it surfaces in the error channel rather than as a
 *   defect.
 * - `rollback` runs when the saga **fails, dies or is interrupted**. It is
 *   best-effort: its own failures are ignored so the original error/defect is
 *   re-raised unchanged.
 *
 * The type is deliberately opaque: it says nothing about databases, SQL or any
 * concrete persistence technology, so the application never has to know what a
 * participant actually is.
 */
export type Participant = {
  readonly commit: Effect.Effect<void, unknown>;
  readonly rollback: Effect.Effect<void>;
};

/**
 * The registry for the current saga.
 *
 * Scoped services that need commit/rollback semantics {@link Service.register}
 * themselves here when they are built. Flush-through buffers (e.g. the
 * `EventTracker`) do **not** register: their atomicity is inherited from a
 * transactional participant they drain into during the saga.
 *
 * The boundary combinator ({@link withSaga}) provides a fresh registry per saga,
 * then drains {@link Service.participants} to drive commit or rollback once the
 * wrapped effect has settled.
 */
export class Saga extends Context.Tag("platform/Saga")<
  Saga,
  Saga.Service
>() {}

export namespace Saga {
  export type Service = {
    /**
     * Registers a participant to be committed (on success) or rolled back (on
     * failure) when the saga finishes. Participants are committed in
     * registration order and rolled back in reverse.
     */
    readonly register: (participant: Participant) => Effect.Effect<void>;

    /**
     * The participants registered so far, in registration order. Drained by the
     * combinator once the wrapped effect has settled.
     */
    readonly participants: Effect.Effect<readonly Participant[]>;
  };

  /**
   * Builds a fresh, in-memory registry. A new instance is created for each
   * saga, so concurrent sagas never see each other's participants and any
   * participant left unregistered simply disappears when the scope ends.
   */
  export const make = Layer.sync(Saga, () => {
    const registered: Participant[] = [];

    return {
      register: (participant) =>
        Effect.sync(() => {
          registered.push(participant);
        }),

      participants: Effect.sync(() => [...registered]),
    } satisfies Service;
  });
}

/**
 * Provides a scoped service that takes part in the current {@link Saga}.
 *
 * `acquire` performs the service's **own setup** and returns the `service` value
 * plus its **teardown** effects: `commit` (run when the saga succeeds) and
 * `rollback` (run when it fails). Both are optional — a service that only needs
 * to commit, only needs to roll back, or needs neither simply omits them, and
 * the missing side is treated as a no-op. `sagaScoped` wraps this into a `Layer`
 * that both provides the service for the scope and registers its teardown with
 * the surrounding saga. {@link withSaga} then drives that commit/rollback
 * uniformly alongside every other participant's.
 *
 * This is the single seam every scoped resource uses to take part in a saga — a
 * database transaction, an event publisher, an outbox, etc. — so the
 * application coordinates them all identically without knowing what any of them
 * actually is. Requiring {@link Saga} makes "must run inside a saga" a
 * compile-time guarantee.
 *
 * Flush-through buffers that need no finalization (e.g. the `EventTracker`) do
 * not need `sagaScoped`; they are provided as plain scoped services and inherit
 * atomicity from a participant they drain into.
 */
export const sagaScoped = <I, S, E, R>(
  tag: Context.Tag<I, S>,
  acquire: Effect.Effect<
    {
      readonly service: S;
      readonly commit?: Effect.Effect<void, unknown>;
      readonly rollback?: Effect.Effect<void>;
    },
    E,
    R
  >,
) =>
  Layer.effect(
    tag,
    Effect.gen(function* () {
      const saga = yield* Saga;
      const { service, commit, rollback } = yield* acquire;

      yield* saga.register({
        commit: commit ?? Effect.void,
        rollback: rollback ?? Effect.void,
      });

      return service;
    }),
  );

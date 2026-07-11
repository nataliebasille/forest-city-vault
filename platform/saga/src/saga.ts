import { Context, Data, Effect, Exit, Layer, Scope } from "effect";

/**
 * Failure raised when a participant cannot commit the work run inside a saga.
 *
 * This is the application-level stand-in for a finalization failure: a concrete
 * scoped service (e.g. a database transaction) maps its own errors onto this
 * type through its {@link Participant}, so the application layer surfaces a
 * commit failure in the error channel without ever depending on—or knowing
 * about—the infrastructure that actually ran the work.
 */
export class SagaError extends Data.TaggedError("application/SagaError")<{
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
 * The handle to the current saga's {@link Scope}.
 *
 * A saga *is* a scope: {@link withSaga} opens a fresh {@link Scope} per saga and
 * exposes it through this service so scoped services can bind their lifetime and
 * their finalization to it.
 *
 * Scoped services that need commit/rollback semantics {@link Service.register}
 * themselves here when they are built, and run their setup through
 * {@link Service.extend} so any resources they acquire (a reserved connection, a
 * file handle, …) are released as finalizers when the saga's scope closes.
 * Flush-through buffers (e.g. the `EventTracker`) do **not** register: their
 * atomicity is inherited from a transactional participant they drain into during
 * the saga.
 *
 * The boundary combinator ({@link withSaga}) provides a fresh service per saga,
 * then closes the scope with the wrapped effect's `Exit` to drive commit or
 * rollback once that effect has settled.
 */
export class Saga extends Context.Tag("application/Saga")<
  Saga,
  Saga.Service
>() {}

export namespace Saga {
  export type Service = {
    /**
     * Registers a participant to be committed (on success) or rolled back (on
     * failure) when the saga finishes.
     *
     * `commit` runs in registration order in the value channel, so a commit
     * failure surfaces as a typed error. `rollback` is installed as a
     * finalizer on the saga's scope, so it runs in reverse registration order
     * (and only when the saga does not succeed) when the scope is closed.
     */
    readonly register: (participant: Participant) => Effect.Effect<void>;

    /**
     * Runs `effect` with the saga's {@link Scope} provided, so any resource it
     * acquires lives for the rest of the saga and is released as a finalizer
     * when the scope closes — rather than being torn down the moment `effect`
     * itself completes. This lets a participant split acquisition (now) from
     * release (at saga end), e.g. reserving a database connection that must
     * outlive the begin/commit boundary.
     */
    readonly extend: <A, E, R>(
      effect: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E, Exclude<R, Scope.Scope>>;
  };

  /**
   * Builds a saga service backed by an existing {@link Scope}. A new scope (and
   * service) is created per saga by {@link withSaga}, so concurrent sagas never
   * see each other's participants and every acquired resource is released when
   * that saga's scope closes.
   *
   * `register` queues each participant's `commit` (drained by {@link withSaga}
   * in registration order on success) and installs its `rollback` as an
   * exit-aware finalizer that runs, best-effort, only when the scope closes with
   * a failure.
   */
  export const make = (
    scope: Scope.Scope,
    commits: Participant["commit"][],
  ): Service => ({
    register: (participant) =>
      Effect.gen(function* () {
        commits.push(participant.commit);

        yield* Scope.addFinalizerExit(scope, (exit) =>
          Exit.isFailure(exit)
            ? Effect.ignore(participant.rollback)
            : Effect.void,
        );
      }),

    extend: (effect) => Scope.extend(effect, scope),
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
 * `acquire` is run through {@link Saga.Service.extend}, so it may require a
 * {@link Scope} and any resource it acquires there (a reserved connection, a
 * file handle, …) lives for the rest of the saga and is released as a finalizer
 * when the saga's scope closes — after `commit`/`rollback` have run. This is
 * what lets a participant defer teardown to the saga boundary without hand-
 * managing a scope of its own.
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
      const { service, commit, rollback } = yield* saga.extend(acquire);

      yield* saga.register({
        commit: commit ?? Effect.void,
        rollback: rollback ?? Effect.void,
      });

      return service;
    }),
  );

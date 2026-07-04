import { Effect } from "effect";
import { EventTracker } from "@forest-city-vault/core-domain";
import { Transactor } from "./transactor";

/**
 * Runs `effect` atomically within a single commit scope.
 *
 * The work is executed inside one storage transaction (via the {@link Transactor}),
 * so everything it does through the shared database connection — repositories,
 * the event store, ad-hoc queries — commits or rolls back together:
 *
 * - the effect **succeeds** → the scope commits and the value is returned.
 * - the effect **fails or dies** → the scope rolls back and the original typed
 *   error/defect is re-raised unchanged.
 *
 * The scope also provides a fresh, per-request {@link EventTracker}: the events
 * applied to aggregates within this unit of work are staged in a tracker that is
 * private to this scope and discarded when it ends. Because a new tracker is
 * built for each call, concurrent commit scopes never see each other's staged
 * events, and any events left undrained (e.g. after a rollback) cannot leak into
 * a later request.
 *
 * @example
 * ```ts
 * const program = withCommitScope(
 *   Effect.gen(function* () {
 *     // repository saves, event appends and ad-hoc queries run here and
 *     // commit (or roll back) as a single unit, tracking events on this
 *     // scope's own EventTracker
 *     return yield* doTransactionalWork();
 *   }),
 * );
 * ```
 */
export const withCommitScope = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.flatMap(Transactor, (transactor) =>
    transactor.transaction(Effect.provide(effect, EventTracker.make)),
  );

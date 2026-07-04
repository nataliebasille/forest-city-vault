import { Effect } from "effect";
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
 * @example
 * ```ts
 * const program = withCommitScope(
 *   Effect.gen(function* () {
 *     const eventStore = yield* EventStore;
 *     yield* eventStore.append("sale", sale, events);
 *     yield* eventStore.save("sale", sale);
 *     return sale.id;
 *   }),
 * );
 * ```
 */
export const withCommitScope = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.flatMap(Transactor, (transactor) => transactor.transaction(effect));

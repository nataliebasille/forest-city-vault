import { Effect } from "effect";
import { Database } from "../database";

/**
 * Marks a port method as running against the **ambient** {@link Database} — the
 * one present in the fiber's context when the method runs, resolved per call
 * rather than captured when the enclosing layer is built.
 *
 * Repositories and the event store read `Database` *inside* each method (like
 * the `EventTracker` is resolved at call time) so that, inside a `withSaga`
 * boundary, every query runs on the saga's transaction-bound `Database` (which
 * shadows the base connection), while outside a saga they run on the base
 * connection — without the repositories ever being re-provided per request.
 *
 * That call-time `Database` requirement is intentionally **not** surfaced on the
 * domain ports: `Database` is infrastructure the domain must never name, and the
 * composition root always provides one. This helper drops the `Database`
 * requirement from the port-facing method type while the read still happens at
 * call time. It is sound because `R` is contravariant — an effect needing
 * `Database` is used exactly where the port declares no requirement, and the
 * runtime always has a `Database` in scope.
 */
export const onAmbientDatabase = <A, E>(
  effect: Effect.Effect<A, E, Database>,
): Effect.Effect<A, E> => effect as Effect.Effect<A, E>;

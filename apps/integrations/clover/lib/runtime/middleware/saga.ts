import { runSaga } from "@forest-city-vault/application-core";
import { Effect } from "effect";

/**
 * Runs every request inside a single saga.
 *
 * The middleware itself provides *nothing* — it only drives the ambient
 * {@link runSaga saga}. The saga scope (the `Saga` registry and the request's
 * transaction-bound `Database`) is supplied by the route's dependency layer via
 * `SagaScopeLive`, so no caller ever has to call `Saga.make` or wire
 * `databaseSagaScoped` by hand. Because that transaction-bound `Database`
 * shadows the base one for the wrapped handler, every service that reads
 * `Database` at call time — the repositories, the event store and any ad-hoc
 * `yield* Database` — runs on the one transaction registered with the registry
 * `runSaga` drives.
 *
 * `runSaga` then drives the transaction once the handler settles:
 *
 * - handler **succeeds** → the transaction is committed before the response is
 *   built (a commit failure surfaces as a `SagaError`);
 * - handler **fails, dies or is interrupted** (including HTTP failures such as
 *   `badRequest`/`unauthorized`) → the transaction is rolled back and the
 *   original error is re-raised unchanged so the route still maps it to the
 *   right status.
 *
 * The middleware only *needs* the `Saga` registry, which `defineRoute` supplies
 * from the route's dependency layer after the middleware is applied.
 */
export const SagaMiddleware = <A, E, R>(handler: Effect.Effect<A, E, R>) =>
  runSaga(handler);

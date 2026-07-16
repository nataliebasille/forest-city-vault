import { EventStore, EventTracker } from "@forest-city-vault/core-domain";
import { Layer } from "effect";
import { EventStorePersistenceLive } from "../event-store";
import { databaseSagaScoped } from "../database-saga-scoped";
import { SalesRepositoryLive } from "./sales";

export * from "./sales";
export * from "./clover-tokens";

/**
 * App-level repository stack bound to the base (pool) {@link Database}. Built
 * once when provided, its repositories run each `getById`/`save` as their own
 * self-contained database transaction. Used by the existing inbox `drain` flow.
 */
export const RepositoriesLive = SalesRepositoryLive.pipe(
  Layer.provideMerge(EventStore.make(EventStorePersistenceLive)),
  Layer.provideMerge(EventTracker.make),
);

/**
 * Saga-scoped repository stack.
 *
 * Provided on an effect that runs inside `withSaga`, it builds a **fresh
 * repository instance per saga, bound to that saga's database transaction**:
 * `databaseSagaScoped` opens one transaction and provides the transaction-bound
 * {@link Database} for the saga's scope, and `SalesRepositoryLive`'s backing
 * effect (`yield* Database`) captures that transaction when the layer is built
 * at saga start. Every `getById`/`save` therefore runs on the saga's
 * transaction and commits or rolls back atomically with it. A per-saga
 * {@link EventTracker} and {@link EventStore} are built alongside, so concurrent
 * sagas never share staged events.
 *
 * Requires `Saga` (provided by `withSaga`) and the base {@link Database} (from
 * `DatabaseLive`/`DatabaseTest`) to open the transaction on.
 */
export const RepositoriesSagaScoped = SalesRepositoryLive.pipe(
  Layer.provideMerge(EventStore.make(EventStorePersistenceLive)),
  Layer.provideMerge(EventTracker.make),
  Layer.provideMerge(databaseSagaScoped),
);

import { Context, Data, Effect, Layer } from "effect";
import { AggregateEvent } from "./event";

export class ConcurrencyError extends Data.TaggedError(
  "core/domain/EventStore/ConcurrencyError",
)<{
  aggType: string;
  aggId: string;
  expectedVersion: number;
  actualVersion: number;
}> {}

export class StreamNotFoundError extends Data.TaggedError(
  "core/domain/EventStore/StreamNotFoundError",
)<{
  aggType: string;
  aggId: string;
}> {}

export class UnknownEventStoreError extends Data.TaggedError(
  "core/domain/EventStore/UnknownError",
)<{
  aggType: string;
  aggId: string;
  error: unknown;
}> {}

/**
 * A single event as it lives in durable storage: the aggregate stream it
 * belongs to plus its assigned version. Versions are assigned by the event
 * store (domain) before handing events to the persistence port.
 */
export type PersistedEvent = {
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly version: number;
  readonly type: string;
  readonly payload: unknown;
};

/**
 * Persistence port for the event store. Implemented by infrastructure — it is
 * only responsible for *how* events are durably stored and retrieved. All
 * buffering, version assignment and concurrency logic lives in the domain
 * ({@link EventStore.make}).
 */
export class EventStorePersistence extends Context.Tag(
  "core/domain/EventStorePersistence",
)<EventStorePersistence, EventStorePersistence.Service>() {}

export namespace EventStorePersistence {
  export type Service = {
    persist: (
      events: readonly PersistedEvent[],
    ) => Effect.Effect<void, UnknownEventStoreError>;

    read: (
      aggType: string,
      aggId: string,
    ) => Effect.Effect<readonly PersistedEvent[], UnknownEventStoreError>;
  };
}

export class EventStore extends Context.Tag("core/domain/EventStore")<
  EventStore,
  EventStore.Service
>() {
  /**
   * Builds the {@link EventStore} layer. The event store is purely a durable
   * append log: {@link EventStore.Service.append} assigns sequential versions to
   * the given events (starting after `baseVersion`) and hands them to the
   * {@link EventStorePersistence} port. Staging of applied events and
   * concurrency detection live in the {@link EventTracker}.
   */
  static make<E = never, RIn = never>(
    persistenceLayer: Layer.Layer<EventStorePersistence, E, RIn>,
  ): Layer.Layer<EventStore, E, RIn> {
    return Layer.effect(
      EventStore,
      Effect.gen(function* () {
        const persistence = yield* EventStorePersistence;

        return {
          append: (aggType, aggId, baseVersion, events) =>
            Effect.gen(function* () {
              if (events.length === 0) {
                return;
              }

              const persistedEvents = events.map(
                (event, index) =>
                  ({
                    aggregateType: aggType,
                    aggregateId: aggId,
                    version: baseVersion + index + 1,
                    type: event.type,
                    payload: event.payload,
                  }) satisfies PersistedEvent,
              );

              yield* persistence.persist(persistedEvents);
            }),

          read: (aggType, aggId) =>
            Effect.gen(function* () {
              const persisted = yield* persistence.read(aggType, aggId);

              if (persisted.length === 0) {
                return yield* Effect.fail(
                  new StreamNotFoundError({ aggType, aggId }),
                );
              }

              return persisted.map(
                (event) =>
                  ({
                    type: event.type,
                    payload: event.payload,
                  }) satisfies AggregateEvent<string, unknown>,
              );
            }),
        } satisfies EventStore.Service;
      }),
    ).pipe(Layer.provide(persistenceLayer));
  }
}

export namespace EventStore {
  export type Service = {
    append: (
      aggType: string,
      aggId: string,
      baseVersion: number,
      events: readonly AggregateEvent<string, any>[],
    ) => Effect.Effect<void, UnknownEventStoreError>;

    read: (
      aggType: string,
      aggId: string,
    ) => Effect.Effect<
      AggregateEvent<string, unknown>[],
      StreamNotFoundError | UnknownEventStoreError
    >;
  };
}

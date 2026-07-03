import { Context, Data, Effect, Layer } from "effect";
import { AggregateEvent } from "./event";
import { AnyAggregateRoot } from "../aggregates/aggregate-root";

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

type PendingStream = {
  baseVersion: number;
  events: AggregateEvent<string, unknown>[];
};

const streamKey = (aggType: string, aggId: string) => `${aggType}:${aggId}`;

export class EventStore extends Context.Tag("core/domain/EventStore")<
  EventStore,
  EventStore.Service
>() {
  /**
   * Builds the {@link EventStore} layer. The returned event store stages
   * appended events per aggregate in memory until the aggregate is saved via
   * its repository, at which point the buffered events are versioned, handed to
   * the given {@link EventStorePersistence} for durable storage, and drained.
   */
  static make<E = never, RIn = never>(
    persistenceLayer: Layer.Layer<EventStorePersistence, E, RIn>,
  ): Layer.Layer<EventStore, E, RIn> {
    return Layer.effect(
      EventStore,
      Effect.gen(function* () {
        const persistence = yield* EventStorePersistence;
        const pendingStreams = new Map<string, PendingStream>();

        return {
          append: (aggType, fromAgg, events) =>
            Effect.gen(function* () {
              const aggId = String(fromAgg.id);
              const key = streamKey(aggType, aggId);
              const existing = pendingStreams.get(key);

              if (!existing) {
                pendingStreams.set(key, {
                  baseVersion: fromAgg.version,
                  events: [...events],
                });

                return;
              }

              const expectedVersion =
                existing.baseVersion + existing.events.length;
              if (fromAgg.version !== expectedVersion) {
                return yield* Effect.fail(
                  new ConcurrencyError({
                    aggType,
                    aggId,
                    expectedVersion,
                    actualVersion: fromAgg.version,
                  }),
                );
              }

              existing.events.push(...events);
            }),

          save: (aggType, aggregate) =>
            Effect.gen(function* () {
              const aggId = String(aggregate.id);
              const key = streamKey(aggType, aggId);
              const pending = pendingStreams.get(key);

              if (!pending || pending.events.length === 0) {
                return;
              }

              const expectedVersion =
                pending.baseVersion + pending.events.length;
              if (aggregate.version !== expectedVersion) {
                return yield* Effect.fail(
                  new ConcurrencyError({
                    aggType,
                    aggId,
                    expectedVersion,
                    actualVersion: aggregate.version,
                  }),
                );
              }

              const persistedEvents = pending.events.map(
                (event, index) =>
                  ({
                    aggregateType: aggType,
                    aggregateId: aggId,
                    version: pending.baseVersion + index + 1,
                    type: event.type,
                    payload: event.payload,
                  }) satisfies PersistedEvent,
              );

              yield* persistence.persist(persistedEvents);

              pendingStreams.delete(key);
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
      fromAgg: AnyAggregateRoot,
      events: AggregateEvent<string, any>[],
    ) => Effect.Effect<void, ConcurrencyError | UnknownEventStoreError>;

    save: (
      aggType: string,
      aggregate: AnyAggregateRoot,
    ) => Effect.Effect<void, ConcurrencyError | UnknownEventStoreError>;

    read: (
      aggType: string,
      aggId: string,
    ) => Effect.Effect<
      AggregateEvent<string, unknown>[],
      StreamNotFoundError | UnknownEventStoreError
    >;
  };
}

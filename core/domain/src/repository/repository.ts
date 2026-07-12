import { Context, Data, Effect, Layer } from "effect";
import {
  AggregateType_GetId,
  AggregateType_GetName,
  AggregateType_GetSnapshot,
  AnyAggregateMetadata,
  WithAggregateMetadata,
} from "../aggregate-type-factory";
import { MaterializedAggregateRoot } from "../aggregates/aggregate-root";
import { AggregateEvent } from "../events/event";
import { EventStore } from "../events/event-store";
import { EventTracker } from "../events/event-tracker";
import { Reducer } from "../events/events.internal";

export class AggregateNotFoundError extends Data.TaggedError(
  "core/domain/Repository/AggregateNotFoundError",
)<{
  aggType: string;
  aggId: string;
}> {}

export class RepositoryError extends Data.TaggedError(
  "core/domain/Repository/RepositoryError",
)<{
  aggType: string;
  aggId: string;
  error: unknown;
}> {}

export namespace Repository {
  export type ServiceIdentifier<Name extends string> = {
    readonly Repository: unique symbol;
    readonly Aggregate: Name;
  };

  export type Service<M extends WithAggregateMetadata<AnyAggregateMetadata>> = {
    getById: (
      id: AggregateType_GetId<M>,
    ) => Effect.Effect<
      MaterializedAggregateRoot<
        AggregateType_GetId<M>,
        AggregateType_GetSnapshot<M>
      >,
      AggregateNotFoundError | RepositoryError
    >;

    save: (
      aggregate: MaterializedAggregateRoot<
        AggregateType_GetId<M>,
        AggregateType_GetSnapshot<M>
      >,
    ) => Effect.Effect<void, RepositoryError>;
  };

  export type Definition<
    M extends WithAggregateMetadata<AnyAggregateMetadata>,
  > = {
    readonly make: {
      (
        service: Service<M>,
      ): Layer.Layer<
        ServiceIdentifier<AggregateType_GetName<M>>,
        never,
        EventStore
      >;

      <E, R>(
        service: Effect.Effect<Service<M>, E, R>,
      ): Layer.Layer<
        ServiceIdentifier<AggregateType_GetName<M>>,
        E,
        EventStore | R
      >;
    };

    readonly getById: (
      id: AggregateType_GetId<M>,
    ) => Effect.Effect<
      MaterializedAggregateRoot<
        AggregateType_GetId<M>,
        AggregateType_GetSnapshot<M>
      >,
      AggregateNotFoundError | RepositoryError,
      ServiceIdentifier<AggregateType_GetName<M>> | EventTracker
    >;

    readonly save: (
      aggregate: MaterializedAggregateRoot<
        AggregateType_GetId<M>,
        AggregateType_GetSnapshot<M>
      >,
    ) => Effect.Effect<
      void,
      RepositoryError,
      ServiceIdentifier<AggregateType_GetName<M>> | EventTracker
    >;
  };
}

export function createRepository<
  M extends WithAggregateMetadata<AnyAggregateMetadata>,
>(
  name: AggregateType_GetName<M>,
  reducer: Reducer<M>,
): Repository.Definition<M> {
  const RepositoryTag = Context.GenericTag<
    Repository.ServiceIdentifier<AggregateType_GetName<M>>,
    TrackedService
  >(`core/domain/Repository/${name}`);

  type Materialized = MaterializedAggregateRoot<
    AggregateType_GetId<M>,
    AggregateType_GetSnapshot<M>
  >;

  // The service held by the repository tag. Unlike the caller-supplied backing
  // service, its methods resolve the {@link EventTracker} at call time (rather
  // than capturing one when the layer is built), so each unit of work — e.g. a
  // commit scope — replays and drains its own per-request tracker instance.
  type TrackedService = {
    getById: (
      id: AggregateType_GetId<M>,
    ) => Effect.Effect<
      Materialized,
      AggregateNotFoundError | RepositoryError,
      EventTracker
    >;
    save: (
      aggregate: Materialized,
    ) => Effect.Effect<void, RepositoryError, EventTracker>;
  };

  // Erases the reducer's create/update union: tracked events are drained as a
  // generic list, so they are replayed with the same fold applyEvents uses.
  const foldTrackedEvents = reducer as (
    agg: Materialized,
    event: AggregateEvent<string, unknown>,
  ) => Materialized;

  const withEventTracking = (
    service: Repository.Service<M>,
    eventStore: EventStore.Service,
  ): TrackedService => ({
    getById: (id) =>
      Effect.gen(function* () {
        const aggregate = yield* service.getById(id);
        const tracker = yield* EventTracker;
        const tracked = yield* tracker.peek(name, String(id));

        return tracked.reduce(foldTrackedEvents, aggregate);
      }),

    save: (aggregate) =>
      Effect.gen(function* () {
        yield* service.save(aggregate);

        const tracker = yield* EventTracker;
        const drained = yield* tracker.drain(name, String(aggregate.id));

        if (drained && drained.events.length > 0) {
          yield* eventStore.append(
            name,
            String(aggregate.id),
            drained.baseVersion,
            drained.events,
          );
        }
      }).pipe(
        Effect.mapError((error) =>
          error instanceof RepositoryError ? error : (
            new RepositoryError({
              aggType: name,
              aggId: String(aggregate.id),
              error,
            })
          ),
        ),
      ),
  });

  function make(
    service: Repository.Service<M>,
  ): Layer.Layer<
    Repository.ServiceIdentifier<AggregateType_GetName<M>>,
    never,
    EventStore
  >;

  function make<E, R>(
    service: Effect.Effect<Repository.Service<M>, E, R>,
  ): Layer.Layer<
    Repository.ServiceIdentifier<AggregateType_GetName<M>>,
    E,
    EventStore | R
  >;

  function make(
    serviceOrEffect:
      | Repository.Service<M>
      | Effect.Effect<Repository.Service<M>, unknown, unknown>,
  ): Layer.Layer<
    Repository.ServiceIdentifier<AggregateType_GetName<M>>,
    unknown,
    unknown
  > {
    return Layer.effect(
      RepositoryTag,
      Effect.gen(function* () {
        const eventStore = yield* EventStore;
        const service =
          Effect.isEffect(serviceOrEffect) ?
            yield* serviceOrEffect
          : serviceOrEffect;

        return withEventTracking(service, eventStore);
      }),
    );
  }

  return {
    make,

    getById: (id) =>
      Effect.gen(function* () {
        const repo = yield* RepositoryTag;
        return yield* repo.getById(id);
      }),

    save: (aggregate) =>
      Effect.gen(function* () {
        const repo = yield* RepositoryTag;
        yield* repo.save(aggregate);
      }),
  };
}

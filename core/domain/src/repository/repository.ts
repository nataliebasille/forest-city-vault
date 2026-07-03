import { Context, Data, Effect, Layer } from "effect";
import {
  AggregateType_GetId,
  AggregateType_GetName,
  AggregateType_GetSnapshot,
  AnyAggregateMetadata,
  WithAggregateMetadata,
} from "../aggregate-type-factory";
import { MaterializedAggregateRoot } from "../aggregates/aggregate-root";
import { EventStore } from "../events/event-store";

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
      ServiceIdentifier<AggregateType_GetName<M>>
    >;

    readonly save: (
      aggregate: MaterializedAggregateRoot<
        AggregateType_GetId<M>,
        AggregateType_GetSnapshot<M>
      >,
    ) => Effect.Effect<
      void,
      RepositoryError,
      ServiceIdentifier<AggregateType_GetName<M>>
    >;
  };
}

export function createRepository<
  M extends WithAggregateMetadata<AnyAggregateMetadata>,
>(name: AggregateType_GetName<M>): Repository.Definition<M> {
  const RepositoryTag = Context.GenericTag<
    Repository.ServiceIdentifier<AggregateType_GetName<M>>,
    Repository.Service<M>
  >(`core/domain/Repository/${name}`);

  const withEventStore = (
    service: Repository.Service<M>,
    eventStore: EventStore.Service,
  ): Repository.Service<M> => ({
    ...service,
    save: (aggregate) =>
      Effect.gen(function* () {
        yield* service.save(aggregate);
        yield* eventStore.save(name, aggregate);
      }).pipe(
        Effect.mapError((error) =>
          error instanceof RepositoryError
            ? error
            : new RepositoryError({
                aggType: name,
                aggId: String(aggregate.id),
                error,
              }),
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
        const service = Effect.isEffect(serviceOrEffect)
          ? yield* serviceOrEffect
          : serviceOrEffect;

        return withEventStore(service, eventStore);
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

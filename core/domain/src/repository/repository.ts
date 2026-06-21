import { Context, Data, Effect, Layer } from "effect";
import {
  AggregateType_GetId,
  AggregateType_GetName,
  AggregateType_GetSnapshot,
  AnyAggregateMetadata,
  WithAggregateMetadata,
} from "../aggregate-type-factory";
import { MaterializedAggregateRoot } from "../aggregates/aggregate-root";

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

  export interface Key<M extends WithAggregateMetadata<AnyAggregateMetadata>> {
    readonly Repository: unique symbol;
    readonly Metadata: M;
  }

  export type Definition<
    M extends WithAggregateMetadata<AnyAggregateMetadata>,
  > = {
    readonly make: {
      (service: Service<M>): Layer.Layer<Key<M>>;

      <E, R>(
        service: Effect.Effect<Service<M>, E, R>,
      ): Layer.Layer<Key<M>, E, R>;
    };

    readonly getById: (
      id: AggregateType_GetId<M>,
    ) => Effect.Effect<
      MaterializedAggregateRoot<
        AggregateType_GetId<M>,
        AggregateType_GetSnapshot<M>
      >,
      AggregateNotFoundError | RepositoryError,
      Key<M>
    >;

    readonly save: (
      aggregate: MaterializedAggregateRoot<
        AggregateType_GetId<M>,
        AggregateType_GetSnapshot<M>
      >,
    ) => Effect.Effect<void, RepositoryError, Key<M>>;
  };
}

export function createRepository<
  M extends WithAggregateMetadata<AnyAggregateMetadata>,
>(name: AggregateType_GetName<M>): Repository.Definition<M> {
  const RepositoryTag = Context.GenericTag<
    Repository.Key<M>,
    Repository.Service<M>
  >(`core/domain/Repository/${name}`);

  function make(service: Repository.Service<M>): Layer.Layer<Repository.Key<M>>;

  function make<E, R>(
    service: Effect.Effect<Repository.Service<M>, E, R>,
  ): Layer.Layer<Repository.Key<M>, E, R>;

  function make(
    serviceOrEffect:
      | Repository.Service<M>
      | Effect.Effect<Repository.Service<M>, unknown, unknown>,
  ): Layer.Layer<Repository.Key<M>, unknown, unknown> {
    return Effect.isEffect(serviceOrEffect)
      ? Layer.effect(RepositoryTag, serviceOrEffect)
      : Layer.succeed(RepositoryTag, serviceOrEffect);
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

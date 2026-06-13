import { Data, Effect } from "effect";
import {
  AggregateType_GetId,
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

export type Repository<M extends WithAggregateMetadata<AnyAggregateMetadata>> =
  {
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

import { Context, Data, Effect } from "effect";
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

export class EventStore extends Context.Tag("core/domain/EventStore")<
  EventStore,
  EventStore.Service
>() {}

export namespace EventStore {
  export type Service = {
    append: (
      aggType: string,
      fromAgg: AnyAggregateRoot,
      events: AggregateEvent<string, any>[],
    ) => Effect.Effect<void, ConcurrencyError | UnknownEventStoreError>;

    read: (
      aggType: string,
      aggId: string,
    ) => Effect.Effect<
      AggregateEvent<string, unknown>[],
      StreamNotFoundError | UnknownEventStoreError,
      AggregateEvent<string, any>[]
    >;
  };
}

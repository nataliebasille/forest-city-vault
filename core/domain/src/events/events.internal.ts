import { Effect, Schema } from "effect";
import {
  AggregateType_GetEventDefinitions,
  AggregateType_GetId,
  AggregateType_GetMetadata,
  AggregateType_GetSchema,
  AnyAggregateMetadata,
  WithAggregateMetadata,
} from "../aggregate-type-factory";
import {
  AggregateRoot,
  AnyAggregateId,
  isPristineAggregateRoot,
  MaterializedAggregateRoot,
  PristineAggregateRoot,
} from "../aggregates/aggregate-root";
import { IsNever } from "../type-helpers";
import {
  All_Events_From_EventDefinitions,
  Create_Events_From_EventDefinitions,
  EventDefinitions,
  Update_Events_From_EventDefinitions,
} from "./event-handler";
import { AggregateEvent } from "./event";
import { ParseError } from "effect/ParseResult";

export type InitializingReducer<
  M extends WithAggregateMetadata<AnyAggregateMetadata>,
> = <Id extends AggregateType_GetMetadata<M>["id"]>(
  agg: PristineAggregateRoot<Id>,
  event: Create_Events_From_EventDefinitions<
    AggregateType_GetSchema<M>,
    AggregateType_GetEventDefinitions<M>
  >,
) => MaterializedAggregateRoot<Id, AggregateType_GetSchema<M>["Type"]>;

type UpdatingReducer<M extends WithAggregateMetadata<AnyAggregateMetadata>> = <
  Id extends AggregateType_GetId<M>,
  Schema extends AggregateType_GetSchema<M>,
>(
  agg: AggregateRoot<Id, Schema["Type"]>,
  event: Update_Events_From_EventDefinitions<
    Schema,
    AggregateType_GetEventDefinitions<M>
  >,
) => MaterializedAggregateRoot<Id, Schema["Type"]>;

export type Reducer<M extends WithAggregateMetadata<AnyAggregateMetadata>> =
  IsNever<
    Create_Events_From_EventDefinitions<
      AggregateType_GetSchema<M>,
      AggregateType_GetEventDefinitions<M>
    >
  > extends true
    ? IsNever<
        Update_Events_From_EventDefinitions<
          AggregateType_GetSchema<M>,
          AggregateType_GetEventDefinitions<M>
        >
      > extends true
      ? never
      : UpdatingReducer<M>
    : IsNever<
          Update_Events_From_EventDefinitions<
            AggregateType_GetSchema<M>,
            AggregateType_GetEventDefinitions<M>
          >
        > extends true
      ? InitializingReducer<M>
      : InitializingReducer<M> & UpdatingReducer<M>;

export function createReducer<
  M extends WithAggregateMetadata<AnyAggregateMetadata>,
  E extends AggregateType_GetEventDefinitions<M>,
>(events: E) {
  return (<Id extends AnyAggregateId>(
    agg: AggregateRoot<Id, AggregateType_GetSchema<M>["Type"]>,
    event: All_Events_From_EventDefinitions<AggregateType_GetSchema<M>, E>,
  ) => {
    type Snapshot = AggregateType_GetSchema<M>["Type"];
    type Payload = typeof event.payload;

    const eventType = event.type as keyof E;
    const handler = events[eventType].handler;

    const nextSnapshot = isPristineAggregateRoot(agg)
      ? (handler as (payload: Payload) => Snapshot)(event.payload)
      : (handler as (snapshot: Snapshot, payload: Payload) => Snapshot)(
          (agg as Extract<typeof agg, { snapshot: unknown }>).snapshot,
          event.payload,
        );

    return {
      id: agg.id,
      version: agg.version + 1,
      snapshot: nextSnapshot,
    };
  }) as Reducer<M>;
}

type EventDefinitions_To_Creators<
  M extends WithAggregateMetadata<AnyAggregateMetadata>,
  E extends AggregateType_GetEventDefinitions<M>,
> = {
  [K in keyof E & string]: (
    payload: E[K]["schema"]["Type"],
  ) => Effect.Effect<AggregateEvent<K, E[K]["schema"]["Type"]>, ParseError>;
};

export function createEventCreators<
  M extends WithAggregateMetadata<AnyAggregateMetadata>,
  E extends AggregateType_GetEventDefinitions<M>,
>(events: E) {
  return Object.fromEntries(
    Object.entries(events).map(([key, { schema }]) => {
      const decoder = Schema.decodeUnknown(schema);
      return [
        key,
        (payload: typeof schema.Type) =>
          Effect.map(decoder(payload), (result) => ({
            type: key,
            payload: result,
          })),
      ] as const;
    }),
  ) as EventDefinitions_To_Creators<M, E>;
}

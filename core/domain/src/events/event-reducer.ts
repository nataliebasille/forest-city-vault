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
import { AnyStruct, IsNever } from "../type-helpers";
import {
  AggregateEventHandler,
  All_Events_From_EventDefinitions,
  Create_Events_From_EventDefinitions,
  CreateEventHandler,
  EventDefinitions,
  Update_Events_From_EventDefinitions,
  UpdateEventHandler,
} from "./event-handler";

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
  Id extends AggregateType_GetMetadata<M>["id"],
  Schema extends AggregateType_GetMetadata<M>["schema"],
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
    const eventType = (event as { type: string }).type;
    const eventPayload = (event as { payload: unknown }).payload;
    const handler = events[eventType] as AggregateEventHandler<
      AggregateType_GetSchema<M>,
      unknown
    >;

    const nextSnapshot = isPristineAggregateRoot(agg)
      ? (handler as CreateEventHandler<AggregateType_GetSchema<M>, unknown>)(
          eventPayload,
        )
      : (handler as UpdateEventHandler<AggregateType_GetSchema<M>, unknown>)(
          (agg as Extract<typeof agg, { snapshot: unknown }>).snapshot,
          eventPayload,
        );

    return {
      id: agg.id,
      version: agg.version + 1,
      snapshot: nextSnapshot,
    };
  }) as Reducer<M>;
}

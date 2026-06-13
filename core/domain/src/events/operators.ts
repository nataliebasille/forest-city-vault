import {
  AggregateType,
  AggregateType_GetEventDefinitions,
  AggregateType_GetSchema,
  EnsureAggregateType,
  type AggregateType_GetEvents,
  type AggregateType_GetInstance,
} from "../aggregate-type-factory";
import {
  AggregateRoot_MaterializedVariant,
  AggregateRoot_PristineVariant,
} from "../aggregates/aggregate-root";
import {
  Create_Events_From_EventDefinitions,
  Update_Events_From_EventDefinitions,
} from "./event-handler";

export function applyEvents<AT, I extends AggregateType_GetInstance<AT>>(
  Type: AT & EnsureAggregateType<AT>,
  instance: I,
  events: [],
): I;
export function applyEvents<AT>(
  Type: AT & EnsureAggregateType<AT>,
  instance: AggregateRoot_PristineVariant<AggregateType_GetInstance<AT>>,
  events: [
    Create_Events_From_EventDefinitions<
      AggregateType_GetSchema<AT>,
      AggregateType_GetEventDefinitions<AT>
    >,
    ...Update_Events_From_EventDefinitions<
      AggregateType_GetSchema<AT>,
      AggregateType_GetEventDefinitions<AT>
    >[],
  ],
): AggregateRoot_MaterializedVariant<AggregateType_GetInstance<AT>>;
export function applyEvents<AT>(
  Type: AT & EnsureAggregateType<AT>,
  instance: AggregateRoot_MaterializedVariant<AggregateType_GetInstance<AT>>,
  events: [
    Update_Events_From_EventDefinitions<
      AggregateType_GetSchema<AT>,
      AggregateType_GetEventDefinitions<AT>
    >,
    ...Update_Events_From_EventDefinitions<
      AggregateType_GetSchema<AT>,
      AggregateType_GetEventDefinitions<AT>
    >[],
  ],
): AggregateRoot_MaterializedVariant<AggregateType_GetInstance<AT>>;

export function applyEvents<AggType>(
  Type: AggType & EnsureAggregateType<AggType>,
  instance: AggregateType_GetInstance<AggType>,
  events: AggregateType_GetEvents<AggType>[],
) {
  return events.reduce<AggregateType_GetInstance<AggType>>(
    Type.reducer,
    instance,
  );
}

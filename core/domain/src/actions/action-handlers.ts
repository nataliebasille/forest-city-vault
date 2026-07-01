import { Effect } from "effect";
import {
  Create_Events_From_EventDefinitions,
  EventDefinitions,
  Update_Events_From_EventDefinitions,
} from "../events/event-handler";
import { AnyStruct } from "../type-helpers";

export type CreateActionHandler<
  Schema extends AnyStruct,
  ED extends EventDefinitions<Schema>,
  Payload,
> = <E, R>(
  payload: Payload,
) => Effect.Effect<
  NoInfer<
    | Create_Events_From_EventDefinitions<Schema, ED>
    | [
        Create_Events_From_EventDefinitions<Schema, ED>,
        ...Update_Events_From_EventDefinitions<Schema, ED>[],
      ]
  >,
  E,
  R
>;

export type UpdateActionHandler<
  Schema extends AnyStruct,
  ED extends EventDefinitions<Schema>,
  Payload,
> = <E, R>(
  entity: Schema["Type"],
  payload: Payload,
) => Effect.Effect<
  NoInfer<
    | Update_Events_From_EventDefinitions<Schema, ED>
    | [
        Update_Events_From_EventDefinitions<Schema, ED>,
        ...Update_Events_From_EventDefinitions<Schema, ED>[],
      ]
  >,
  E,
  R
>;

export type AggregateActionHandler<
  Schema extends AnyStruct,
  ED extends EventDefinitions<Schema>,
  Payload,
> =
  | CreateActionHandler<Schema, ED, Payload>
  | UpdateActionHandler<Schema, ED, Payload>;

export type ActionDefinitions<
  Schema extends AnyStruct,
  ED extends EventDefinitions<Schema>,
> = Record<string, AggregateActionHandler<Schema, ED, any>>;

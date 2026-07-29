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
  E = never,
  R = never,
> = (
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
  E = never,
  R = never,
> = (
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
  E = never,
  R = never,
> =
  | CreateActionHandler<Schema, ED, Payload, E, R>
  | UpdateActionHandler<Schema, ED, Payload, E, R>;

export type ActionDefinitions<
  Schema extends AnyStruct,
  ED extends EventDefinitions<Schema>,
> = Record<string, AggregateActionHandler<Schema, ED, any, any, any>>;

export type ActionHandler_Success<Handler> =
  Handler extends (
    (...args: never[]) => Effect.Effect<infer A, unknown, unknown>
  ) ?
    A
  : never;

export type ActionHandler_Error<Handler> =
  Handler extends (
    (...args: never[]) => Effect.Effect<unknown, infer E, unknown>
  ) ?
    E
  : never;

export type ActionHandler_Context<Handler> =
  Handler extends (
    (...args: never[]) => Effect.Effect<unknown, unknown, infer R>
  ) ?
    R
  : never;

import { AnyStruct } from "../type-helpers";
import { AggregateEvent } from "./event";

export type CreateEventHandler<Schema extends AnyStruct, Payload> = (
  payload: Payload,
) => Schema["Type"];

export type UpdateEventHandler<Schema extends AnyStruct, Payload> = (
  snapshot: Schema["Type"],
  payload: Payload,
) => Schema["Type"];

export type AggregateEventHandler<Schema extends AnyStruct, Payload> =
  | CreateEventHandler<Schema, Payload>
  | UpdateEventHandler<Schema, Payload>;

export type EventDefinitions<Schema extends AnyStruct> = Record<
  string,
  AggregateEventHandler<Schema, any>
>;

export type Create_Events_From_EventDefinitions<
  Schema extends AnyStruct,
  ED extends EventDefinitions<Schema>,
> = {
  [K in keyof ED]: ED[K] extends (...args: infer Args) => Schema["Type"]
    ? Args extends [payload: infer Payload]
      ? AggregateEvent<K & string, Payload>
      : never
    : never;
}[keyof ED];

export type Update_Events_From_EventDefinitions<
  Schema extends AnyStruct,
  ED extends EventDefinitions<Schema>,
> = {
  [K in keyof ED]: ED[K] extends (...args: infer Args) => Schema["Type"]
    ? Args extends [snapshot: Schema["Type"], payload: infer Payload]
      ? AggregateEvent<K & string, Payload>
      : never
    : never;
}[keyof ED];

export type All_Events_From_EventDefinitions<
  Schema extends AnyStruct,
  ED extends EventDefinitions<Schema>,
> =
  | Create_Events_From_EventDefinitions<Schema, ED>
  | Update_Events_From_EventDefinitions<Schema, ED>;

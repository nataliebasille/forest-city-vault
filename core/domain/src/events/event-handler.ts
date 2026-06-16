import { AnyStruct } from "../type-helpers";
import { AggregateEvent } from "./event";

export type EventDefinition<
  AggSnapshot extends Record<string, unknown>,
  PayloadSchema extends AnyStruct,
> =
  | {
      schema: PayloadSchema;
      handler: CreateEventHandler<AggSnapshot, PayloadSchema["Type"]>;
    }
  | {
      schema: PayloadSchema;
      handler: UpdateEventHandler<AggSnapshot, PayloadSchema["Type"]>;
    };

export type EventDefinitions<AggStruct extends AnyStruct> = Record<
  string,
  {
    schema: AnyStruct;
    handler: AggregateEventHandler<AggStruct["Type"], any>;
  }
>;

export type CreateEventHandler<
  AggSnapshot extends Record<string, unknown>,
  Payload extends Record<string, unknown>,
> = (payload: Payload) => AggSnapshot;

export type UpdateEventHandler<
  AggSnapshot extends Record<string, unknown>,
  Payload extends Record<string, unknown>,
> = (snapshot: AggSnapshot, payload: Payload) => AggSnapshot;

export type AggregateEventHandler<
  AggSnapshot extends Record<string, unknown>,
  Payload extends Record<string, unknown>,
> =
  | CreateEventHandler<AggSnapshot, Payload>
  | UpdateEventHandler<AggSnapshot, Payload>;

export type Create_Events_From_EventDefinitions<
  Schema extends AnyStruct,
  ED extends EventDefinitions<Schema>,
> = {
  [K in keyof ED]: ED[K] extends {
    schema: infer PayloadSchema extends AnyStruct;
    handler: (payload: any) => Schema["Type"];
  }
    ? AggregateEvent<K & string, PayloadSchema["Type"]>
    : never;
}[keyof ED];

export type Update_Events_From_EventDefinitions<
  Schema extends AnyStruct,
  ED extends EventDefinitions<Schema>,
> = {
  [K in keyof ED]: ED[K] extends {
    schema: infer PayloadSchema extends AnyStruct;
    handler: (snapshot: Schema["Type"], payload: any) => Schema["Type"];
  }
    ? AggregateEvent<K & string, PayloadSchema["Type"]>
    : never;
}[keyof ED];

export type All_Events_From_EventDefinitions<
  Schema extends AnyStruct,
  ED extends EventDefinitions<Schema>,
> =
  | Create_Events_From_EventDefinitions<Schema, ED>
  | Update_Events_From_EventDefinitions<Schema, ED>;

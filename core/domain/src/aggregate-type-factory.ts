import { Brand, Effect, Schema } from "effect";
import {
  AggregateId,
  AggregateIdValue,
  AggregateRoot,
  AnyAggregateId,
  PristineAggregateRoot,
} from "./aggregates/aggregate-root";
import {
  All_Events_From_EventDefinitions,
  EventDefinitions,
} from "./events/event-handler";
import { createEventCreators, createReducer } from "./events/events.internal";
import { AnyStruct, IsNever } from "./type-helpers";
import { ActionDefinitions } from "./actions/action-handlers";
import { createActionDispatchers } from "./actions/action-dispatcher";

const AggregateMetadata: unique symbol = Symbol("AggregateMetadata");

type AggregateTypeMetadata<
  out Id extends AnyAggregateId,
  out Name extends string,
  out Schema extends AnyStruct,
  out Events extends EventDefinitions<Schema>,
  out Actions extends ActionDefinitions<Schema, Events>,
> = {
  readonly id: Id;
  readonly name: Name;
  readonly schema: Schema;
  readonly snapshot: Schema["Type"];
  readonly events: Events;
  readonly actions: Actions;
};

export type WithAggregateMetadata<out Metadata extends AnyAggregateMetadata> = {
  [AggregateMetadata]: Metadata;
};

export type AnyAggregateMetadata = AggregateTypeMetadata<
  AnyAggregateId,
  string,
  any,
  any,
  any
>;

export type AggregateType<
  Id extends Schema.Number | Schema.String,
  Name extends string,
  Schema extends AnyStruct,
  Events extends EventDefinitions<Schema>,
  Actions extends ActionDefinitions<Schema, Events>,
> = ReturnType<typeof defineAggregateType<Name, Id, Schema, Events, Actions>>;

export type EnsureAggregateType<AT> = [AT] extends [never]
  ? never
  : AT extends { [AggregateMetadata]: AnyAggregateMetadata }
    ? AT
    : never;

export type AggregateType_GetMetadata<AT> = AT extends {
  [AggregateMetadata]: infer Metadata;
}
  ? Metadata
  : never;

export type AggregateType_GetName<AT> =
  IsNever<AggregateType_GetMetadata<AT>> extends true
    ? never
    : AggregateType_GetMetadata<AT> extends {
          name: infer Name extends string;
        }
      ? Name
      : never;

export type AggregateType_GetId<AT> =
  IsNever<AggregateType_GetMetadata<AT>> extends true
    ? never
    : AggregateType_GetMetadata<AT> extends {
          id: infer Id extends AnyAggregateId;
        }
      ? Id
      : never;

export type AggregateType_GetSnapshot<AT> =
  IsNever<AggregateType_GetMetadata<AT>> extends true
    ? never
    : AggregateType_GetMetadata<AT> extends {
          snapshot: infer Snapshot extends Record<string, unknown>;
        }
      ? Snapshot
      : never;

export type AggregateType_GetEvents<AT> =
  AggregateType_GetMetadata<AT> extends {
    readonly schema: infer Schema;
    readonly events: infer Events;
  }
    ? Schema extends AnyStruct
      ? Events extends EventDefinitions<Schema>
        ? All_Events_From_EventDefinitions<Schema, Events>
        : never
      : never
    : never;

export type AggregateType_GetInstance<AT> = AggregateRoot<
  AggregateType_GetId<AT>,
  AggregateType_GetSnapshot<AT>
>;

export type AggregateType_GetSchema<AT> =
  AggregateType_GetMetadata<AT> extends {
    readonly schema: infer Schema extends AnyStruct;
  }
    ? Schema
    : never;

export type AggregateType_GetEventDefinitions<AT> =
  AggregateType_GetMetadata<AT> extends {
    readonly events: infer EventDefs extends EventDefinitions<any>;
  }
    ? EventDefs
    : never;

export type AggregateType_GetActionDefinitions<AT> =
  AggregateType_GetMetadata<AT> extends {
    readonly actions: infer Actions extends ActionDefinitions<any, any>;
  }
    ? Actions
    : never;

// Domain Factory
type DefineAggregateTypeOptions<
  Id extends Schema.Number | Schema.String,
  Schema extends AnyStruct,
  Events extends EventDefinitions<Schema>,
  Actions extends ActionDefinitions<Schema, Events>,
> = {
  id: Id;
  schema: Schema;
  events: Events;
  actions: Actions;
};

export function defineAggregateType<
  Name extends string,
  Id extends Schema.Number | Schema.String,
  Schema extends AnyStruct,
  Events extends EventDefinitions<Schema>,
  Actions extends ActionDefinitions<Schema, Events>,
>(
  name: Name,
  definition: DefineAggregateTypeOptions<Id, Schema, Events, Actions>,
) {
  type AggId = AggregateId<Schema.Schema.Type<Id>, Name>;
  type Metadata = AggregateTypeMetadata<AggId, Name, Schema, Events, Actions>;
  const reducer = createReducer<WithAggregateMetadata<Metadata>, Events>(
    definition.events,
  );

  const runtime = Object.freeze({
    pristine: (id: Brand.Brand.Unbranded<AggId>) =>
      ({
        id: Brand.nominal<AggId>()(id),
        version: 0,
      }) satisfies PristineAggregateRoot<AggId>,
    reducer,
    events: createEventCreators<WithAggregateMetadata<Metadata>, Events>(
      definition.events,
    ),
    actions: createActionDispatchers<WithAggregateMetadata<Metadata>, Actions>(
      name,
      reducer,
      definition.actions,
    ),
  } as const);

  return runtime as typeof runtime & {
    [AggregateMetadata]: Metadata;
  };
}

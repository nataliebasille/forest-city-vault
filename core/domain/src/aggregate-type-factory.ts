import { Effect } from "effect";
import {
  AggregateIdValue,
  AggregateRoot,
  AnyAggregateId,
  createAggregateIdFactory,
  PristineAggregateRoot,
} from "./aggregates/aggregate-root";
import {
  All_Events_From_EventDefinitions,
  EventDefinitions,
} from "./events/event-handler";
import { createReducer } from "./events/event-reducer";
import { AnyStruct, IsNever } from "./type-helpers";
import { ActionDefinitions } from "./actions/action-handlers";
import { createActionDispatchers } from "./actions/action-dispatcher";

// Domain Factory
type DefineAggregateTypeOptions<
  Name extends string,
  RawId,
  Schema extends AnyStruct,
  Events extends EventDefinitions<Schema>,
  Actions extends ActionDefinitions<Schema, Events>,
> = {
  name: Name;
  raw: () => Effect.Effect<RawId, never, never>;
  schema: Schema;
  events: Events;
  actions: Actions;
};

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
  Name extends string,
  RawId extends AggregateIdValue,
  Schema extends AnyStruct,
  Events extends EventDefinitions<Schema>,
  Actions extends ActionDefinitions<Schema, Events>,
> = ReturnType<
  typeof defineAggregateType<Name, RawId, Schema, Events, Actions>
>;

export type EnsureAggregateType<AT> =
  AT extends AggregateType<
    infer Name,
    infer RawId,
    infer Schema,
    infer Events,
    infer Actions
  >
    ? AggregateType<Name, RawId, Schema, Events, Actions>
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
    readonly events: infer Events extends EventDefinitions<any>;
  }
    ? Events
    : never;

export type AggregateType_GetActionDefinitions<AT> =
  AggregateType_GetMetadata<AT> extends {
    readonly actions: infer Actions extends ActionDefinitions<any, any>;
  }
    ? Actions
    : never;

export function defineAggregateType<
  Name extends string,
  RawId extends AggregateIdValue,
  Schema extends AnyStruct,
  Events extends EventDefinitions<Schema>,
  Actions extends ActionDefinitions<Schema, Events>,
>(
  definition: DefineAggregateTypeOptions<Name, RawId, Schema, Events, Actions>,
) {
  const nextId = createAggregateIdFactory(definition.name)(definition.raw);
  type Id = Effect.Effect.Success<ReturnType<typeof nextId>>;

  type Metadata = AggregateTypeMetadata<Id, Name, Schema, Events, Actions>;

  const reducer = createReducer<WithAggregateMetadata<Metadata>, Events>(
    definition.events,
  );

  const runtime = Object.freeze({
    nextId,
    pristine: (id: Id) =>
      ({
        id,
        version: 0,
      }) satisfies PristineAggregateRoot<Id>,
    reducer,
    actions: createActionDispatchers<WithAggregateMetadata<Metadata>, Actions>(
      definition.name,
      reducer,
      definition.actions,
    ),
  } as const);

  return runtime as typeof runtime & {
    [AggregateMetadata]: Metadata;
  };
}

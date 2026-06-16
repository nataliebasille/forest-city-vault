import { describe, it } from "node:test";
import { Schema } from "effect";
import { expectTypeOf } from "expect-type";
import type { AggregateEvent } from "./event";
import type {
  AggregateEventHandler,
  All_Events_From_EventDefinitions,
  Create_Events_From_EventDefinitions,
  CreateEventHandler,
  EventDefinition,
  EventDefinitions,
  Update_Events_From_EventDefinitions,
  UpdateEventHandler,
} from "./event-handler";

const CounterSchema = Schema.Struct({
  count: Schema.Number,
  label: Schema.String,
});
type CounterSchema = typeof CounterSchema;
type CounterData = CounterSchema["Type"];

const CounterCreatedSchema = Schema.Struct({
  initialCount: Schema.Number,
  label: Schema.String,
});

const CounterRenamedSchema = Schema.Struct({
  nextLabel: Schema.String,
});

const createHandler = ((payload: { initialCount: number; label: string }) => ({
  count: payload.initialCount,
  label: payload.label,
})) satisfies CreateEventHandler<
  CounterData,
  { initialCount: number; label: string }
>;

const updateHandler = ((
  snapshot: CounterData,
  payload: { nextLabel: string },
) => ({
  ...snapshot,
  label: payload.nextLabel,
})) satisfies UpdateEventHandler<CounterData, { nextLabel: string }>;

const counterEventDefinitions = {
  CounterCreated: {
    schema: CounterCreatedSchema,
    handler: createHandler,
  },
  CounterRenamed: {
    schema: CounterRenamedSchema,
    handler: updateHandler,
  },
};

describe("event-handler types", () => {
  it("EventDefinition ties the payload schema to a create handler", () => {
    const definition = {
      schema: CounterCreatedSchema,
      handler: createHandler,
    } satisfies EventDefinition<CounterData, typeof CounterCreatedSchema>;

    type Actual = Parameters<typeof definition.handler>[0];
    type Expected = {
      initialCount: number;
      label: string;
    };

    expectTypeOf<Actual>().toEqualTypeOf<Expected>();
  });

  it("EventDefinitions preserves keyed create and update definitions", () => {
    type Actual = typeof counterEventDefinitions;
    type Expected = EventDefinitions<CounterSchema>;

    expectTypeOf<Actual>().toExtend<Expected>();
  });

  it("CreateEventHandler models a payload-only event handler", () => {
    type Actual = typeof createHandler;
    type Expected = CreateEventHandler<
      CounterData,
      { initialCount: number; label: string }
    >;

    expectTypeOf<Actual>().toExtend<Expected>();
  });

  it("UpdateEventHandler models a snapshot-plus-payload handler", () => {
    type Actual = typeof updateHandler;
    type Expected = UpdateEventHandler<CounterData, { nextLabel: string }>;

    expectTypeOf<Actual>().toExtend<Expected>();
  });

  it("AggregateEventHandler accepts both create and update handlers", () => {
    {
      type Actual = typeof createHandler;
      type Expected = AggregateEventHandler<
        CounterData,
        { initialCount: number; label: string }
      >;

      expectTypeOf<Actual>().toExtend<Expected>();
    }

    {
      type Actual = typeof updateHandler;
      type Expected = AggregateEventHandler<CounterData, { nextLabel: string }>;

      expectTypeOf<Actual>().toExtend<Expected>();
    }
  });

  it("Create_Events_From_EventDefinitions extracts only create events", () => {
    type Actual = Create_Events_From_EventDefinitions<
      CounterSchema,
      typeof counterEventDefinitions
    >;
    type Expected = AggregateEvent<
      "CounterCreated",
      Readonly<{ initialCount: number; label: string }>
    >;

    expectTypeOf<Actual>().toEqualTypeOf<Expected>();
  });

  it("Update_Events_From_EventDefinitions extracts only update events", () => {
    type Actual = Update_Events_From_EventDefinitions<
      CounterSchema,
      typeof counterEventDefinitions
    >;
    type Expected = AggregateEvent<
      "CounterRenamed",
      Readonly<{ nextLabel: string }>
    >;

    expectTypeOf<Actual>().toEqualTypeOf<Expected>();
  });

  it("All_Events_From_EventDefinitions unions create and update events", () => {
    type Actual = All_Events_From_EventDefinitions<
      CounterSchema,
      typeof counterEventDefinitions
    >;
    type Expected =
      | AggregateEvent<
          "CounterCreated",
          Readonly<{ initialCount: number; label: string }>
        >
      | AggregateEvent<"CounterRenamed", Readonly<{ nextLabel: string }>>;

    expectTypeOf<Actual>().toEqualTypeOf<Expected>();
  });

  it("rejects a handler whose payload does not match the schema", () => {
    const _check = () => {
      const definition: EventDefinition<
        CounterData,
        typeof CounterCreatedSchema
      > = {
        schema: CounterCreatedSchema,
        // @ts-expect-error payload must match CounterCreatedSchema
        handler: (_: { notcorrect: false }) => ({
          count: 1,
          label: "test",
        }),
      };

      void definition;
    };

    void _check;
  });

  it("rejects a handler that does not return the aggregate snapshot shape", () => {
    const _check = () => {
      const definition: EventDefinition<
        CounterData,
        typeof CounterRenamedSchema
      > = {
        schema: CounterRenamedSchema,
        // @ts-expect-error handler must return CounterData
        handler: (snapshot: CounterData, payload: { nextLabel: string }) => ({
          nextLabel: payload.nextLabel,
          count: snapshot.count,
        }),
      };

      void definition;
    };

    void _check;
  });
});

import { describe, it } from "node:test";
import { Schema } from "effect";
import { expect } from "expect";
import { expectTypeOf } from "expect-type";
import type { MaterializedAggregateRoot } from "../aggregates/aggregate-root";
import {
  defineAggregateType,
  type AggregateType_GetId,
} from "../aggregate-type-factory";

// ─── Test fixtures ────────────────────────────────────────────────────────────

const CounterSchema = Schema.Struct({ count: Schema.Number });
type CounterSchema = typeof CounterSchema;
type CounterData = CounterSchema["Type"];

const CounterCreatedSchema = Schema.Struct({
  initialCount: Schema.Number,
});

const CounterIncrementedSchema = Schema.Struct({
  by: Schema.Number,
});

// Event definitions covering all three Reducer shapes
const bothEvents = {
  CounterCreated: {
    schema: CounterCreatedSchema,
    handler: (payload: { initialCount: number }) => ({
      count: payload.initialCount,
    }),
  },
  CounterIncremented: {
    schema: CounterIncrementedSchema,
    handler: (snapshot: CounterData, payload: { by: number }) => ({
      count: snapshot.count + payload.by,
    }),
  },
};

const createOnlyEvents = {
  CounterCreated: {
    schema: CounterCreatedSchema,
    handler: (payload: { initialCount: number }) => ({
      count: payload.initialCount,
    }),
  },
};

const updateOnlyEvents = {
  CounterIncremented: {
    schema: CounterIncrementedSchema,
    handler: (snapshot: CounterData, payload: { by: number }) => ({
      count: snapshot.count + payload.by,
    }),
  },
};

const BothAgg = defineAggregateType("Counter", {
  id: Schema.String,
  schema: CounterSchema,
  events: bothEvents,
  actions: {},
});

const CreateOnlyAgg = defineAggregateType("Counter", {
  id: Schema.String,
  schema: CounterSchema,
  events: createOnlyEvents,
  actions: {},
});

const UpdateOnlyAgg = defineAggregateType("Counter", {
  id: Schema.String,
  schema: CounterSchema,
  events: updateOnlyEvents,
  actions: {},
});

const bothUninitialized = BothAgg.pristine("counter-both-1");
const bothMaterialized = BothAgg.reducer(bothUninitialized, {
  type: "CounterCreated",
  payload: { initialCount: 5 },
});

const createOnlyUninitialized = CreateOnlyAgg.pristine("counter-create-1");

type UpdateOnlyId = AggregateType_GetId<typeof UpdateOnlyAgg>;
const updateOnlyMaterialized: MaterializedAggregateRoot<
  UpdateOnlyId,
  CounterData
> = {
  id: UpdateOnlyAgg.pristine("counter-update-1").id,
  version: 3,
  snapshot: { count: 5 },
};

// ─── Functional tests ─────────────────────────────────────────────────────────

describe("createReducer - functional", () => {
  it("applies a create event to an uninitialized aggregate", () => {
    const result = BothAgg.reducer(bothUninitialized, {
      type: "CounterCreated",
      payload: { initialCount: 10 },
    });

    expect(result).toEqual({
      id: bothUninitialized.id,
      version: 1,
      snapshot: { count: 10 },
    });
  });

  it("sets version to 1 after the first event", () => {
    const result = CreateOnlyAgg.reducer(createOnlyUninitialized, {
      type: "CounterCreated",
      payload: { initialCount: 0 },
    });

    expect(result.version).toBe(1);
  });

  it("applies an update event to a materialized aggregate", () => {
    const result = BothAgg.reducer(bothMaterialized, {
      type: "CounterIncremented",
      payload: { by: 3 },
    });

    expect(result).toEqual({
      id: bothMaterialized.id,
      version: bothMaterialized.version + 1,
      snapshot: { count: 8 },
    });
  });

  it("increments version by 1 on each update", () => {
    const result = UpdateOnlyAgg.reducer(updateOnlyMaterialized, {
      type: "CounterIncremented",
      payload: { by: 0 },
    });

    expect(result.version).toBe(updateOnlyMaterialized.version + 1);
  });

  it("preserves the aggregate id through create", () => {
    const result = CreateOnlyAgg.reducer(createOnlyUninitialized, {
      type: "CounterCreated",
      payload: { initialCount: 0 },
    });

    expect(result.id).toBe(createOnlyUninitialized.id);
  });

  it("preserves the aggregate id through update", () => {
    const result = UpdateOnlyAgg.reducer(updateOnlyMaterialized, {
      type: "CounterIncremented",
      payload: { by: 0 },
    });

    expect(result.id).toBe(updateOnlyMaterialized.id);
  });

  it("can chain multiple update events by feeding output back as input", () => {
    const after1 = UpdateOnlyAgg.reducer(updateOnlyMaterialized, {
      type: "CounterIncremented",
      payload: { by: 10 },
    });
    const after2 = UpdateOnlyAgg.reducer(after1, {
      type: "CounterIncremented",
      payload: { by: 5 },
    });

    expect(after2.snapshot).toEqual({ count: 20 });
    expect(after2.version).toBe(updateOnlyMaterialized.version + 2);
  });

  it("passes only the payload (not snapshot) to a create handler", () => {
    const calls: unknown[] = [];
    const Agg = defineAggregateType("Counter", {
      id: Schema.String,
      schema: CounterSchema,
      events: {
        Created: {
          schema: Schema.Struct({ x: Schema.Number }),
          handler: (...args: [payload: { x: number }]) => {
            calls.push(args);
            return { count: args[0].x };
          },
        },
      },
      actions: {},
    });
    const uninitialized = Agg.pristine("counter-create-call-1");

    Agg.reducer(uninitialized, { type: "Created", payload: { x: 7 } });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([{ x: 7 }]);
  });

  it("passes snapshot and payload to an update handler", () => {
    const calls: unknown[] = [];
    const Agg = defineAggregateType("Counter", {
      id: Schema.String,
      schema: CounterSchema,
      events: {
        Updated: {
          schema: CounterIncrementedSchema,
          handler: (snapshot: CounterData, payload: { by: number }) => {
            calls.push([snapshot, payload]);
            return { count: snapshot.count + payload.by };
          },
        },
      },
      actions: {},
    });
    const materialized: MaterializedAggregateRoot<
      AggregateType_GetId<typeof Agg>,
      CounterData
    > = {
      id: Agg.pristine("counter-update-call-1").id,
      version: 3,
      snapshot: { count: 5 },
    };

    Agg.reducer(materialized, { type: "Updated", payload: { by: 2 } });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([{ count: 5 }, { by: 2 }]);
  });
});

// ─── Typing tests ─────────────────────────────────────────────────────────────

describe("createReducer - typing", () => {
  it("reducer with only create events accepts a pristine aggregate and create event", () => {
    const reducer: (
      agg: typeof createOnlyUninitialized,
      event: {
        type: "CounterCreated";
        payload: { initialCount: number };
      },
    ) => MaterializedAggregateRoot<
      AggregateType_GetId<typeof CreateOnlyAgg>,
      CounterData
    > = CreateOnlyAgg.reducer;

    void reducer;
  });

  it("reducer with both events can initialize from a pristine aggregate", () => {
    const reducer: (
      agg: typeof bothUninitialized,
      event: {
        type: "CounterCreated";
        payload: { initialCount: number };
      },
    ) => MaterializedAggregateRoot<
      AggregateType_GetId<typeof BothAgg>,
      CounterData
    > = BothAgg.reducer;

    void reducer;
  });

  it("create event payload is inferred from the event schema", () => {
    type Event = Parameters<typeof CreateOnlyAgg.reducer>[1];

    expectTypeOf<{
      type: "CounterCreated";
      payload: { initialCount: number };
    }>().toExtend<Event>();
  });

  it("update event payload is inferred from the event schema", () => {
    type Event = Parameters<typeof UpdateOnlyAgg.reducer>[1];

    expectTypeOf<{
      type: "CounterIncremented";
      payload: { by: number };
    }>().toExtend<Event>();
  });

  it("event parameter is the union of create and update events when both are defined", () => {
    // Both event shapes must compile without error — if either were rejected, TS would error here
    const _checkCreate = () =>
      BothAgg.reducer(bothUninitialized, {
        type: "CounterCreated",
        payload: { initialCount: 0 },
      });
    const _checkUpdate = () =>
      BothAgg.reducer(bothMaterialized, {
        type: "CounterIncremented",
        payload: { by: 1 },
      });
    void _checkCreate;
    void _checkUpdate;
  });

  it("result snapshot type matches the schema", () => {
    const result = CreateOnlyAgg.reducer(createOnlyUninitialized, {
      type: "CounterCreated",
      payload: { initialCount: 0 },
    });

    expectTypeOf(result.snapshot).toExtend<CounterData>();
  });

  it("result id type matches the input aggregate id type", () => {
    const result = CreateOnlyAgg.reducer(createOnlyUninitialized, {
      type: "CounterCreated",
      payload: { initialCount: 0 },
    });

    expectTypeOf(result.id).toEqualTypeOf<
      AggregateType_GetId<typeof CreateOnlyAgg>
    >();
  });

  it("wrong event type is rejected at compile time", () => {
    // Wrap in a never-called function so TypeScript checks types without running it
    const _check = () => {
      const event = {
        type: "CounterIncremented",
        payload: { by: 1 },
      } as const;
      // @ts-expect-error — "CounterIncremented" is not a valid event for createOnlyEvents
      CreateOnlyAgg.reducer(createOnlyUninitialized, event);
    };

    void _check;
  });

  it("wrong payload shape is rejected at compile time", () => {
    const _check = () => {
      const event = {
        type: "CounterCreated",
        payload: { count: 0 },
      } as const;

      // @ts-expect-error — payload should have initialCount, not count
      CreateOnlyAgg.reducer(createOnlyUninitialized, event);
    };

    void _check;
  });
});

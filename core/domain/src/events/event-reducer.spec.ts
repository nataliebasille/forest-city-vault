import { describe, it } from "node:test";
import { Effect, Schema } from "effect";
import { expect } from "expect";
import { expectTypeOf } from "expect-type";
import { type InitializingReducer } from "./event-reducer";
import type { MaterializedAggregateRoot } from "../aggregates/aggregate-root";
import {
  defineAggregateType,
  type AggregateType_GetId,
} from "../aggregate-type-factory";

// ─── Test fixtures ────────────────────────────────────────────────────────────

const CounterSchema = Schema.Struct({ count: Schema.Number });
type CounterSchema = typeof CounterSchema;
type CounterData = CounterSchema["Type"];

// Event definitions covering all three Reducer shapes
const bothEvents = {
  CounterCreated: (payload: { initialCount: number }) => ({
    count: payload.initialCount,
  }),
  CounterIncremented: (snapshot: CounterData, payload: { by: number }) => ({
    count: snapshot.count + payload.by,
  }),
};

const createOnlyEvents = {
  CounterCreated: (payload: { initialCount: number }) => ({
    count: payload.initialCount,
  }),
};

const updateOnlyEvents = {
  CounterIncremented: (snapshot: CounterData, payload: { by: number }) => ({
    count: snapshot.count + payload.by,
  }),
};

const BothAgg = defineAggregateType({
  name: "Counter",
  schema: CounterSchema,
  raw: () => Effect.succeed("counter-both-1"),
  events: bothEvents,
  actions: {},
});

const CreateOnlyAgg = defineAggregateType({
  name: "Counter",
  schema: CounterSchema,
  raw: () => Effect.succeed("counter-create-1"),
  events: createOnlyEvents,
  actions: {},
});

const UpdateOnlyAgg = defineAggregateType({
  name: "Counter",
  schema: CounterSchema,
  raw: () => Effect.succeed("counter-update-1"),
  events: updateOnlyEvents,
  actions: {},
});

const bothUninitialized = BothAgg.pristine(Effect.runSync(BothAgg.nextId()));
const bothMaterialized = BothAgg.reducer(bothUninitialized, {
  type: "CounterCreated",
  payload: { initialCount: 5 },
});

const createOnlyUninitialized = CreateOnlyAgg.pristine(
  Effect.runSync(CreateOnlyAgg.nextId()),
);

type UpdateOnlyId = AggregateType_GetId<typeof UpdateOnlyAgg>;
const updateOnlyMaterialized: MaterializedAggregateRoot<
  UpdateOnlyId,
  CounterData
> = {
  id: Effect.runSync(UpdateOnlyAgg.nextId()),
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
    const Agg = defineAggregateType({
      name: "Counter",
      schema: CounterSchema,
      raw: () => Effect.succeed("counter-create-call-1"),
      events: {
        Created: (...args: [payload: { x: number }]) => {
          calls.push(args);
          return { count: args[0].x };
        },
      },
      actions: {},
    });
    const uninitialized = Agg.pristine(Effect.runSync(Agg.nextId()));

    Agg.reducer(uninitialized, { type: "Created", payload: { x: 7 } });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([{ x: 7 }]);
  });

  it("passes snapshot and payload to an update handler", () => {
    const calls: unknown[] = [];
    const Agg = defineAggregateType({
      name: "Counter",
      schema: CounterSchema,
      raw: () => Effect.succeed("counter-update-call-1"),
      events: {
        Updated: (snapshot: CounterData, payload: { by: number }) => {
          calls.push([snapshot, payload]);
          return { count: snapshot.count + payload.by };
        },
      },
      actions: {},
    });
    const materialized: MaterializedAggregateRoot<
      AggregateType_GetId<typeof Agg>,
      CounterData
    > = {
      id: Effect.runSync(Agg.nextId()),
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
  it("reducer with only create events is assignable to InitializingReducer", () => {
    expectTypeOf(CreateOnlyAgg.reducer).toExtend<
      InitializingReducer<typeof CreateOnlyAgg>
    >();
  });

  it("reducer with both events is assignable to InitializingReducer", () => {
    expectTypeOf(BothAgg.reducer).toExtend<
      InitializingReducer<typeof BothAgg>
    >();
  });

  it("create event payload is inferred from handler signature", () => {
    type Event = Parameters<typeof CreateOnlyAgg.reducer>[1];

    expectTypeOf<{
      type: "CounterCreated";
      payload: { initialCount: number };
    }>().toExtend<Event>();
  });

  it("update event payload is inferred from handler signature", () => {
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

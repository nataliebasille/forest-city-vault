import { describe, it } from "node:test";
import { Effect, Schema } from "effect";
import { expect } from "expect";
import { expectTypeOf } from "expect-type";
import { type ActionDispatcher } from "./action-dispatcher";
import type {
  InitializingActionDispatcher,
  UpdatingActionDispatcher,
} from "./action-dispatcher";
import type { MaterializedAggregateRoot } from "../aggregates/aggregate-root";
import {
  defineAggregateType,
  type AggregateType_GetId,
  type AggregateType_GetActionDefinitions,
} from "../aggregate-type-factory";
import { EventTracker } from "../events/event-tracker";

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

// Actions are defined inline inside defineAggregateType (rather than as
// standalone consts) because ActionDefinitions expects generic function types
// <Payload, E, R>(...) — a concrete function signature inferred from a
// standalone const is not assignable to that polymorphic shape.
const CreateOnlyAgg = defineAggregateType({
  idType: Schema.String,
  name: "Counter",
  schema: CounterSchema,
  events: {
    CounterCreated: {
      schema: CounterCreatedSchema,
      handler: (payload: { initialCount: number }) => ({
        count: payload.initialCount,
      }),
    },
  },
  actions: {
    create: (payload: { initialCount: number }) =>
      Effect.succeed({
        type: "CounterCreated" as const,
        payload: { initialCount: payload.initialCount },
      }),
  },
});

const UpdateOnlyAgg = defineAggregateType({
  idType: Schema.String,
  name: "Counter",
  schema: CounterSchema,
  events: {
    CounterIncremented: {
      schema: CounterIncrementedSchema,
      handler: (snapshot: CounterData, payload: { by: number }) => ({
        count: snapshot.count + payload.by,
      }),
    },
  },
  actions: {
    increment: (snapshot: CounterData, payload: { by: number }) =>
      Effect.succeed({
        type: "CounterIncremented" as const,
        payload: { by: payload.by },
      }),
  },
});

const BothAgg = defineAggregateType({
  idType: Schema.String,
  name: "Counter",
  schema: CounterSchema,
  events: {
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
  },
  actions: {
    create: (payload: { initialCount: number }) =>
      Effect.succeed({
        type: "CounterCreated" as const,
        payload: { initialCount: payload.initialCount },
      }),
    increment: (snapshot: CounterData, payload: { by: number }) =>
      Effect.succeed({
        type: "CounterIncremented" as const,
        payload: { by: payload.by },
      }),
  },
});

const createOnlyUninitialized = CreateOnlyAgg.pristine("counter-create-1");

type UpdateOnlyId = AggregateType_GetId<typeof UpdateOnlyAgg>;
const updateOnlyId = UpdateOnlyAgg.pristine("counter-update-1").id;
const updateOnlyMaterialized: MaterializedAggregateRoot<
  UpdateOnlyId,
  CounterData
> = {
  id: updateOnlyId,
  version: 3,
  snapshot: { count: 5 },
};

const bothUninitialized = BothAgg.pristine("counter-both-1");
const bothMaterialized: MaterializedAggregateRoot<
  AggregateType_GetId<typeof BothAgg>,
  CounterData
> = {
  id: bothUninitialized.id,
  version: 2,
  snapshot: { count: 10 },
};

// ─── EventTracker test helper ─────────────────────────────────────────────────

type AppendCall = {
  aggType: string;
  fromAgg: unknown;
  events: unknown[];
};

function makeTestEventStore() {
  const calls: AppendCall[] = [];
  const store: EventTracker.Service = {
    track: (aggType, fromAgg, events) => {
      calls.push({ aggType, fromAgg, events: [...events] });
      return Effect.succeed(undefined as void);
    },
    drain: () => Effect.succeed(undefined),
    peek: () => Effect.succeed([]),
  };
  return { store, calls };
}

function runWithStore<A>(
  effect: Effect.Effect<A, unknown, EventTracker>,
  store: EventTracker.Service,
): A {
  return Effect.runSync(Effect.provideService(effect, EventTracker, store));
}

// ─── Functional tests ─────────────────────────────────────────────────────────

describe("createActionDispatchers - functional", () => {
  it("dispatches a create action on a pristine aggregate", () => {
    const { store } = makeTestEventStore();
    const result = runWithStore(
      BothAgg.actions.create(bothUninitialized, { initialCount: 42 }),
      store,
    );

    expect(result.snapshot).toEqual({ count: 42 });
  });

  it("sets version to 1 after a create action", () => {
    const { store } = makeTestEventStore();
    const result = runWithStore(
      CreateOnlyAgg.actions.create(createOnlyUninitialized, {
        initialCount: 0,
      }),
      store,
    );

    expect(result.version).toBe(1);
  });

  it("preserves aggregate id through a create action", () => {
    const { store } = makeTestEventStore();
    const result = runWithStore(
      CreateOnlyAgg.actions.create(createOnlyUninitialized, {
        initialCount: 0,
      }),
      store,
    );

    expect(result.id).toBe(createOnlyUninitialized.id);
  });

  it("dispatches an update action on a materialized aggregate", () => {
    const { store } = makeTestEventStore();
    const result = runWithStore(
      UpdateOnlyAgg.actions.increment(updateOnlyMaterialized, { by: 3 }),
      store,
    );

    expect(result.snapshot).toEqual({ count: 8 });
  });

  it("increments version by 1 on each update action", () => {
    const { store } = makeTestEventStore();
    const result = runWithStore(
      UpdateOnlyAgg.actions.increment(updateOnlyMaterialized, { by: 0 }),
      store,
    );

    expect(result.version).toBe(updateOnlyMaterialized.version + 1);
  });

  it("preserves aggregate id through an update action", () => {
    const { store } = makeTestEventStore();
    const result = runWithStore(
      UpdateOnlyAgg.actions.increment(updateOnlyMaterialized, { by: 0 }),
      store,
    );

    expect(result.id).toBe(updateOnlyMaterialized.id);
  });

  it("passes only payload (not snapshot) to a create action handler", () => {
    const calls: unknown[] = [];
    const Agg = defineAggregateType({
      idType: Schema.String,
      name: "Counter",
      schema: CounterSchema,
      events: {
        Created: {
          schema: Schema.Struct({ x: Schema.Number }),
          handler: (payload: { x: number }) => ({ count: payload.x }),
        },
      },
      actions: {
        create: (...args: [payload: { x: number }]) => {
          calls.push(args);
          return Effect.succeed({ type: "Created" as const, payload: args[0] });
        },
      },
    });
    const { store } = makeTestEventStore();
    const uninitialized = Agg.pristine("counter-create-call-1");

    runWithStore(Agg.actions.create(uninitialized, { x: 7 }), store);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([{ x: 7 }]);
  });

  it("passes snapshot and payload to an update action handler", () => {
    const calls: unknown[] = [];
    const Agg = defineAggregateType({
      idType: Schema.String,
      name: "Counter",
      schema: CounterSchema,
      events: {
        Incremented: {
          schema: CounterIncrementedSchema,
          handler: (snapshot: CounterData, payload: { by: number }) => ({
            count: snapshot.count + payload.by,
          }),
        },
      },
      actions: {
        increment: (
          ...args: [snapshot: CounterData, payload: { by: number }]
        ) => {
          calls.push(args);
          return Effect.succeed({
            type: "Incremented" as const,
            payload: args[1],
          });
        },
      },
    });
    const { store } = makeTestEventStore();
    const materialized: MaterializedAggregateRoot<
      AggregateType_GetId<typeof Agg>,
      CounterData
    > = {
      id: Agg.pristine("counter-update-call-1").id,
      version: 1,
      snapshot: { count: 5 },
    };

    runWithStore(Agg.actions.increment(materialized, { by: 2 }), store);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([{ count: 5 }, { by: 2 }]);
  });

  it("appends events to the event store after a create action", () => {
    const { store, calls } = makeTestEventStore();

    runWithStore(
      BothAgg.actions.create(bothUninitialized, { initialCount: 1 }),
      store,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].aggType).toBe("Counter");
    expect(calls[0].fromAgg).toBe(bothUninitialized);
    expect(calls[0].events).toEqual([
      { type: "CounterCreated", payload: { initialCount: 1 } },
    ]);
  });

  it("appends events to the event store after an update action", () => {
    const { store, calls } = makeTestEventStore();

    runWithStore(BothAgg.actions.increment(bothMaterialized, { by: 5 }), store);

    expect(calls).toHaveLength(1);
    expect(calls[0].aggType).toBe("Counter");
    expect(calls[0].fromAgg).toBe(bothMaterialized);
    expect(calls[0].events).toEqual([
      { type: "CounterIncremented", payload: { by: 5 } },
    ]);
  });

  it("handles an action that returns an array of events", () => {
    const Agg = defineAggregateType({
      idType: Schema.String,
      name: "Counter",
      schema: CounterSchema,
      events: {
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
      },
      actions: {
        createAndIncrement: (payload: { initialCount: number; by: number }) => {
          const events: [
            {
              type: "CounterCreated";
              payload: { initialCount: number };
            },
            {
              type: "CounterIncremented";
              payload: { by: number };
            },
          ] = [
            {
              type: "CounterCreated",
              payload: { initialCount: payload.initialCount },
            },
            {
              type: "CounterIncremented",
              payload: { by: payload.by },
            },
          ];

          return Effect.succeed(events);
        },
      },
    });
    const { store, calls } = makeTestEventStore();
    const uninitialized = Agg.pristine("counter-multi-1");

    const result = runWithStore(
      Agg.actions.createAndIncrement(uninitialized, {
        initialCount: 10,
        by: 5,
      }),
      store,
    );

    expect(result.snapshot).toEqual({ count: 15 });
    expect(result.version).toBe(2);
    expect(calls[0].events).toHaveLength(2);
  });

  it("can chain multiple actions by feeding output back as input", () => {
    const { store } = makeTestEventStore();
    const after1 = runWithStore(
      BothAgg.actions.create(bothUninitialized, { initialCount: 0 }),
      store,
    );
    const after2 = runWithStore(
      BothAgg.actions.increment(after1, { by: 7 }),
      store,
    );
    const after3 = runWithStore(
      BothAgg.actions.increment(after2, { by: 3 }),
      store,
    );

    expect(after3.snapshot).toEqual({ count: 10 });
    expect(after3.version).toBe(3);
  });
});

// ─── Typing tests ─────────────────────────────────────────────────────────────

describe("createActionDispatchers - typing", () => {
  it("create action is typed as InitializingActionDispatcher", () => {
    expectTypeOf(CreateOnlyAgg.actions.create).toExtend<
      InitializingActionDispatcher<
        typeof CreateOnlyAgg,
        { initialCount: number }
      >
    >();
  });

  it("update action is typed as UpdatingActionDispatcher", () => {
    expectTypeOf(UpdateOnlyAgg.actions.increment).toExtend<
      UpdatingActionDispatcher<typeof UpdateOnlyAgg, { by: number }>
    >();
  });

  it("actions object is assignable to ActionDispatcher for the aggregate", () => {
    type BothActions = AggregateType_GetActionDefinitions<typeof BothAgg>;
    expectTypeOf(BothAgg.actions).toExtend<
      ActionDispatcher<typeof BothAgg, BothActions>
    >();
  });

  it("create action result snapshot matches the schema", () => {
    const { store } = makeTestEventStore();
    const result = runWithStore(
      CreateOnlyAgg.actions.create(createOnlyUninitialized, {
        initialCount: 0,
      }),
      store,
    );

    expectTypeOf(result.snapshot).toExtend<CounterData>();
  });

  it("create action result id matches the aggregate id type", () => {
    const { store } = makeTestEventStore();
    const result = runWithStore(
      CreateOnlyAgg.actions.create(createOnlyUninitialized, {
        initialCount: 0,
      }),
      store,
    );

    expectTypeOf(result.id).toEqualTypeOf<
      AggregateType_GetId<typeof CreateOnlyAgg>
    >();
  });

  it("wrong payload shape is rejected at compile time", () => {
    const _check = () => {
      // @ts-expect-error — payload should have initialCount, not count
      CreateOnlyAgg.actions.create(createOnlyUninitialized, { count: 0 });
    };

    void _check;
  });

  it("passing a materialized aggregate to a create action is rejected at compile time", () => {
    const _check = () => {
      // @ts-expect-error — create action expects a pristine aggregate
      CreateOnlyAgg.actions.create(updateOnlyMaterialized, {
        initialCount: 0,
      });
    };

    void _check;
  });
});

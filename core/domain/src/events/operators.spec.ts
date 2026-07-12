import { describe, it } from "node:test";
import { Schema } from "effect";
import { expect } from "expect";
import { expectTypeOf } from "expect-type";
import { applyEvents } from "./operators";
import {
  AggregateType,
  defineAggregateType,
  type AggregateType_GetInstance,
} from "../aggregate-type-factory";
import { AggregateRoot_MaterializedVariant } from "../aggregates/aggregate-root";

// ─── Test fixtures ────────────────────────────────────────────────────────────

const CounterSchema = Schema.Struct({ count: Schema.Number });

const CounterCreatedSchema = Schema.Struct({
  initialCount: Schema.Number,
});

const CounterIncrementedSchema = Schema.Struct({
  by: Schema.Number,
});

const Counter = defineAggregateType("Counter", {
  id: Schema.String,
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
      handler: (snapshot: { count: number }, payload: { by: number }) => ({
        count: snapshot.count + payload.by,
      }),
    },
  },
  actions: {},
});

const pristine = Counter.pristine("counter-1");
const counterId = pristine.id;
const materialized: AggregateRoot_MaterializedVariant<
  AggregateType_GetInstance<typeof Counter>
> = {
  id: counterId,
  version: 3,
  snapshot: { count: 5 },
};

type EnsureAgg<AggType> =
  AggType extends (
    AggregateType<
      infer IdSchema,
      infer Name,
      infer Schema,
      infer Events,
      infer Actions
    >
  ) ?
    AggregateType<IdSchema, Name, Schema, Events, Actions>
  : never;

// ─── Functional tests ─────────────────────────────────────────────────────────

describe("applyEvents - functional", () => {
  it("returns the original instance unchanged when events array is empty", () => {
    const result = applyEvents(Counter, pristine, []);
    expect(result).toBe(pristine);
  });

  it("returns the original materialized instance unchanged when events array is empty", () => {
    const result = applyEvents(Counter, materialized, []);
    expect(result).toBe(materialized);
  });

  it("applies a single create event to a pristine aggregate", () => {
    const result = applyEvents(Counter, pristine, [
      { type: "CounterCreated", payload: { initialCount: 10 } },
    ]);
    expect(result).toEqual({
      id: counterId,
      version: 1,
      snapshot: { count: 10 },
    });
  });

  it("applies a single update event to a materialized aggregate", () => {
    const result = applyEvents(Counter, materialized, [
      { type: "CounterIncremented", payload: { by: 7 } },
    ]);
    expect(result).toEqual({
      id: counterId,
      version: 4,
      snapshot: { count: 12 },
    });
  });

  it("applies a create event followed by update events from pristine", () => {
    const result = applyEvents(Counter, pristine, [
      { type: "CounterCreated", payload: { initialCount: 0 } },
      { type: "CounterIncremented", payload: { by: 3 } },
      { type: "CounterIncremented", payload: { by: 2 } },
    ]);
    expect(result).toEqual({
      id: counterId,
      version: 3,
      snapshot: { count: 5 },
    });
  });

  it("applies multiple update events in order from a materialized aggregate", () => {
    const result = applyEvents(Counter, materialized, [
      { type: "CounterIncremented", payload: { by: 1 } },
      { type: "CounterIncremented", payload: { by: 2 } },
      { type: "CounterIncremented", payload: { by: 3 } },
    ]);
    expect(result).toEqual({
      id: counterId,
      version: 6,
      snapshot: { count: 11 },
    });
  });

  it("preserves the aggregate id through all applied events", () => {
    const result = applyEvents(Counter, pristine, [
      { type: "CounterCreated", payload: { initialCount: 0 } },
      { type: "CounterIncremented", payload: { by: 1 } },
    ]);
    expect(result.id).toBe(counterId);
  });

  it("increments version by 1 for each event", () => {
    const result = applyEvents(Counter, materialized, [
      { type: "CounterIncremented", payload: { by: 0 } },
      { type: "CounterIncremented", payload: { by: 0 } },
      { type: "CounterIncremented", payload: { by: 0 } },
    ]);
    expect(result.version).toBe(materialized.version + 3);
  });

  it("applies events left to right (order matters)", () => {
    // Event 1: create with initialCount=10 → count=10
    // Event 2: increment by 5 → count=15
    // Event 3: increment by 2 → count=17
    const result = applyEvents(Counter, pristine, [
      { type: "CounterCreated", payload: { initialCount: 10 } },
      { type: "CounterIncremented", payload: { by: 5 } },
      { type: "CounterIncremented", payload: { by: 2 } },
    ]);
    expect((result as { snapshot: { count: number } }).snapshot.count).toBe(17);
    expect(result.version).toBe(3);
  });
});

// ─── Typing tests ─────────────────────────────────────────────────────────────

describe("applyEvents - typing", () => {
  it("empty events overload preserves the exact input instance type", () => {
    const result = applyEvents(Counter, pristine, []);
    expectTypeOf(result).toEqualTypeOf<typeof pristine>();

    const materializedResult = applyEvents(Counter, materialized, []);
    expectTypeOf(materializedResult).toEqualTypeOf<typeof materialized>();
  });

  it("pristine + [create, ...updates] returns the materialized variant", () => {
    const result = applyEvents(Counter, pristine, [
      { type: "CounterCreated", payload: { initialCount: 0 } },
      { type: "CounterIncremented", payload: { by: 1 } },
    ]);
    expectTypeOf(result).toEqualTypeOf<
      AggregateRoot_MaterializedVariant<
        AggregateType_GetInstance<typeof Counter>
      >
    >();
  });

  it("materialized + [update, ...updates] returns the materialized variant", () => {
    const result = applyEvents(Counter, materialized, [
      { type: "CounterIncremented", payload: { by: 1 } },
    ]);
    expectTypeOf(result).toEqualTypeOf<
      AggregateRoot_MaterializedVariant<
        AggregateType_GetInstance<typeof Counter>
      >
    >();
  });

  it("create event payload shape is enforced", () => {
    const result = applyEvents(Counter, pristine, [
      { type: "CounterCreated", payload: { initialCount: 0 } },
    ]);
    type Snapshot = (typeof result & {
      snapshot: unknown;
    })["snapshot"];
    expectTypeOf<Snapshot>().toExtend<{ count: number }>();
  });

  it("wrong event type is rejected at compile time", () => {
    const _check = () => {
      // @ts-expect-error — "CounterDeleted" is not a valid event for Counter
      applyEvents(Counter, pristine, [{ type: "CounterDeleted", payload: {} }]);
    };
    void _check;
  });

  it("wrong payload shape is rejected at compile time", () => {
    const _check = () => {
      // @ts-expect-error — CounterCreated payload must have initialCount, not count
      applyEvents(Counter, pristine, [
        { type: "CounterCreated", payload: { count: 0 } },
      ]);
    };
    void _check;
  });

  it("pristine + [update] is rejected at compile time", () => {
    const _check = () => {
      // @ts-expect-error — pristine overload requires a create event at index 0
      applyEvents(Counter, pristine, [
        { type: "CounterIncremented", payload: { by: 1 } },
      ]);
    };
    void _check;
  });

  it("materialized + [create] is rejected at compile time", () => {
    const _check = () => {
      // @ts-expect-error — materialized overload only accepts update events
      applyEvents(Counter, materialized, [
        { type: "CounterCreated", payload: { initialCount: 0 } },
      ]);
    };
    void _check;
  });

  it("pristine + [create, create] is rejected at compile time", () => {
    const _check = () => {
      // @ts-expect-error — events after the create head must be update events
      applyEvents(Counter, pristine, [
        { type: "CounterCreated", payload: { initialCount: 0 } },
        { type: "CounterCreated", payload: { initialCount: 1 } },
      ]);
    };
    void _check;
  });

  it("wrong aggregate type in instance position is rejected at compile time", () => {
    const OtherCounter = defineAggregateType("OtherCounter", {
      id: Schema.String,
      schema: CounterSchema,
      events: {
        CounterCreated: {
          schema: CounterCreatedSchema,
          handler: (payload: { initialCount: number }) => ({
            count: payload.initialCount,
          }),
        },
      },
      actions: {},
    });
    const otherPristine = OtherCounter.pristine("other-1");

    const _check = () => {
      // @ts-expect-error — otherPristine has a different Id brand than Counter expects
      applyEvents(Counter, otherPristine, []);
    };
    void _check;
  });
});

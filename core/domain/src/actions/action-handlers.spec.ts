import { describe, it } from "node:test";
import { Context, Data, Effect, Layer, Schema } from "effect";
import { expect } from "expect";
import { expectTypeOf } from "expect-type";
import {
  defineAggregateType,
  type AggregateType_GetId,
  type ActionHandler_Success,
  type ActionHandler_Error,
  type ActionHandler_Context,
} from "../public";
import type { MaterializedAggregateRoot } from "../aggregates/aggregate-root";
import { ConcurrencyError } from "../events/event-store";
import { EventTracker } from "../events/event-tracker";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const StoreSchema = Schema.Struct({ name: Schema.String });
type StoreSchema = typeof StoreSchema;
type StoreData = StoreSchema["Type"];

const StoreCreatedSchema = Schema.Struct({ name: Schema.String });
const StoreRenamedSchema = Schema.Struct({
  name: Schema.String,
  at: Schema.Number,
});
const StoreTouchedSchema = Schema.Struct({});

// A typed domain error an action may fail with.
class StoreNameBlankError extends Data.TaggedError(
  "StoreNameBlankError",
)<{}> {}

// A service an action may read from (stand-in for a Clock-like capability).
interface ClockService {
  readonly now: Effect.Effect<Date>;
}
class Clock extends Context.Tag("action-handlers.spec/Clock")<
  Clock,
  ClockService
>() {}

function staticClock(instant: Date): Layer.Layer<Clock> {
  return Layer.succeed(Clock, { now: Effect.succeed(instant) });
}

const storeEvents = {
  StoreCreated: {
    schema: StoreCreatedSchema,
    handler: (payload: { name: string }): StoreData => ({ name: payload.name }),
  },
  StoreRenamed: {
    schema: StoreRenamedSchema,
    handler: (snapshot: StoreData, payload: { name: string }): StoreData => ({
      ...snapshot,
      name: payload.name,
    }),
  },
  StoreTouched: {
    schema: StoreTouchedSchema,
    handler: (snapshot: StoreData): StoreData => snapshot,
  },
};

// An aggregate whose actions fail with a typed error and read a service — the
// exact shapes this change is meant to unblock.
const StoreAgg = defineAggregateType("Store", {
  id: Schema.String,
  schema: StoreSchema,
  events: storeEvents,
  actions: {
    // Effectful create that fails with a concrete typed error.
    create: (payload: { name: string }) =>
      payload.name.trim() === "" ?
        Effect.fail(new StoreNameBlankError())
      : Effect.succeed({
          type: "StoreCreated" as const,
          payload: { name: payload.name },
        }),
    // Effectful update that reads a service (yield* Clock) → surfaces R.
    rename: (snapshot: StoreData, payload: { name: string }) =>
      Effect.gen(function* () {
        const clock = yield* Clock;
        const now = yield* clock.now;
        return {
          type: "StoreRenamed" as const,
          payload: { name: payload.name, at: now.getTime() },
        };
      }),
    // No-payload update: keeps a required `_payload: undefined` second arg so
    // the dispatcher classifies it as an update (2-arg), not a create.
    touch: (snapshot: StoreData, _payload: undefined) =>
      Effect.succeed({
        type: "StoreTouched" as const,
        payload: {},
      }),
  },
});

// A pure aggregate (no failures, no services) — regression guard for E/R never.
const PureAgg = defineAggregateType("Store", {
  id: Schema.String,
  schema: StoreSchema,
  events: storeEvents,
  actions: {
    create: (payload: { name: string }) =>
      Effect.succeed({
        type: "StoreCreated" as const,
        payload: { name: payload.name },
      }),
  },
});

// ─── Channel-extraction helpers ───────────────────────────────────────────────

type StoreId = AggregateType_GetId<typeof StoreAgg>;

function makeTestEventStore() {
  const store: EventTracker.Service = {
    track: () => Effect.succeed(undefined as void),
    drain: () => Effect.succeed(undefined),
    peek: () => Effect.succeed([]),
  };
  return { store };
}

// ─── Type-level tests ─────────────────────────────────────────────────────────

describe("action-handlers typed E/R", () => {
  it("(b) surfaces the exact typed error in the dispatcher E channel", () => {
    expectTypeOf<
      ActionHandler_Error<typeof StoreAgg.actions.create>
    >().toEqualTypeOf<StoreNameBlankError | ConcurrencyError>();
  });

  it("(b) an effect-failing action keeps R = EventTracker only", () => {
    expectTypeOf<
      ActionHandler_Context<typeof StoreAgg.actions.create>
    >().toEqualTypeOf<EventTracker>();
  });

  it("(b) a service-reading action surfaces the service in R", () => {
    expectTypeOf<
      ActionHandler_Context<typeof StoreAgg.actions.rename>
    >().toEqualTypeOf<EventTracker | Clock>();
  });

  it("(b) a service-reading action has no extra E beyond ConcurrencyError", () => {
    expectTypeOf<
      ActionHandler_Error<typeof StoreAgg.actions.rename>
    >().toEqualTypeOf<ConcurrencyError>();
  });

  it("(c) success channel is exactly the materialized aggregate (no widening)", () => {
    expectTypeOf<
      ActionHandler_Success<typeof StoreAgg.actions.create>
    >().toEqualTypeOf<MaterializedAggregateRoot<StoreId, StoreData>>();
  });

  it("(e) a pure action infers E/R = never (dispatcher only adds framework E/R)", () => {
    expectTypeOf<
      ActionHandler_Error<typeof PureAgg.actions.create>
    >().toEqualTypeOf<ConcurrencyError>();
    expectTypeOf<
      ActionHandler_Context<typeof PureAgg.actions.create>
    >().toEqualTypeOf<EventTracker>();
  });

  it("(d) arity: create takes a pristine aggregate, update takes a materialized one", () => {
    const pristine = StoreAgg.pristine("store-arity-1");
    const materialized: MaterializedAggregateRoot<StoreId, StoreData> = {
      id: pristine.id,
      version: 1,
      snapshot: { name: "old" },
    };

    const _check = () => {
      StoreAgg.actions.create(pristine, { name: "ok" });
      StoreAgg.actions.rename(materialized, { name: "new" });
      // no-payload update still requires the explicit undefined second arg
      StoreAgg.actions.touch(materialized, undefined);

      // @ts-expect-error — create expects a pristine aggregate, not materialized
      StoreAgg.actions.create(materialized, { name: "ok" });
      // @ts-expect-error — update expects a materialized aggregate, not pristine
      StoreAgg.actions.rename(pristine, { name: "new" });
      // @ts-expect-error — no-payload update must still be called with undefined
      StoreAgg.actions.touch(materialized);
    };
    void _check;
  });
});

// ─── Runtime tests ────────────────────────────────────────────────────────────

describe("action-handlers runtime", () => {
  it("(a) an effectful create action produces its event and materializes", () => {
    const { store } = makeTestEventStore();
    const pristine = StoreAgg.pristine("store-run-1");

    const result = Effect.runSync(
      Effect.provideService(
        StoreAgg.actions.create(pristine, { name: "Acme" }),
        EventTracker,
        store,
      ),
    );

    expect(result.snapshot).toEqual({ name: "Acme" });
    expect(result.version).toBe(1);
  });

  it("fails with the typed error for invalid input", () => {
    const { store } = makeTestEventStore();
    const pristine = StoreAgg.pristine("store-run-2");

    const exit = Effect.runSyncExit(
      Effect.provideService(
        StoreAgg.actions.create(pristine, { name: "  " }),
        EventTracker,
        store,
      ),
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure" && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toBeInstanceOf(StoreNameBlankError);
    } else {
      throw new Error("expected a StoreNameBlankError failure");
    }
  });

  it("reads a fixed instant from a static Clock layer", () => {
    const { store } = makeTestEventStore();
    const instant = new Date("2020-01-02T03:04:05.000Z");
    const materialized: MaterializedAggregateRoot<StoreId, StoreData> = {
      id: StoreAgg.pristine("store-run-3").id,
      version: 1,
      snapshot: { name: "old" },
    };

    const calls: { events: unknown[] }[] = [];
    const trackingStore: EventTracker.Service = {
      track: (_aggType, _fromAgg, events) => {
        calls.push({ events: [...events] });
        return Effect.succeed(undefined as void);
      },
      drain: () => Effect.succeed(undefined),
      peek: () => Effect.succeed([]),
    };

    Effect.runSync(
      StoreAgg.actions.rename(materialized, { name: "new" }).pipe(
        Effect.provideService(EventTracker, trackingStore),
        Effect.provide(staticClock(instant)),
      ),
    );

    expect(calls[0].events).toEqual([
      { type: "StoreRenamed", payload: { name: "new", at: instant.getTime() } },
    ]);
  });
});


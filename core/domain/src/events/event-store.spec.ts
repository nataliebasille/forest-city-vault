import { describe, it } from "node:test";
import { Effect, Layer } from "effect";
import { expect } from "expect";
import {
  EventStore,
  EventStorePersistence,
  StreamNotFoundError,
  UnknownEventStoreError,
  type PersistedEvent,
} from "./event-store";
import type { AggregateEvent } from "./event";

// ─── Test fixtures ────────────────────────────────────────────────────────────

const event = (
  type: string,
  payload: unknown,
): AggregateEvent<string, unknown> => ({ type, payload });

type TestPersistence = {
  layer: Layer.Layer<EventStorePersistence>;
  persisted: PersistedEvent[];
  persistCalls: number;
};

function makeTestPersistence(options?: {
  seed?: PersistedEvent[];
  failPersist?: boolean;
  failRead?: boolean;
}): TestPersistence {
  const persisted: PersistedEvent[] = [...(options?.seed ?? [])];
  const state = { persistCalls: 0 };

  const service: EventStorePersistence.Service = {
    persist: (events) => {
      state.persistCalls += 1;
      if (options?.failPersist) {
        return Effect.fail(
          new UnknownEventStoreError({
            aggType: events[0]?.aggregateType ?? "?",
            aggId: events[0]?.aggregateId ?? "?",
            error: new Error("persist failed"),
          }),
        );
      }
      persisted.push(...events);
      return Effect.succeed(undefined as void);
    },
    read: (aggType, aggId) => {
      if (options?.failRead) {
        return Effect.fail(
          new UnknownEventStoreError({
            aggType,
            aggId,
            error: new Error("read failed"),
          }),
        );
      }
      return Effect.succeed(
        persisted.filter(
          (e) => e.aggregateType === aggType && e.aggregateId === aggId,
        ),
      );
    },
  };

  return {
    layer: Layer.succeed(EventStorePersistence, service),
    persisted,
    get persistCalls() {
      return state.persistCalls;
    },
  };
}

function run<A, E>(
  persistence: TestPersistence,
  body: (store: EventStore.Service) => Effect.Effect<A, E, never>,
): A {
  return Effect.runSync(
    Effect.gen(function* () {
      const store = yield* EventStore;
      return yield* body(store);
    }).pipe(Effect.provide(EventStore.make(persistence.layer))),
  );
}

function runExit<A, E>(
  persistence: TestPersistence,
  body: (store: EventStore.Service) => Effect.Effect<A, E, never>,
) {
  return Effect.runSyncExit(
    Effect.gen(function* () {
      const store = yield* EventStore;
      return yield* body(store);
    }).pipe(Effect.provide(EventStore.make(persistence.layer))),
  );
}

// ─── append ───────────────────────────────────────────────────────────────────

describe("EventStore - append", () => {
  it("persists events with sequential versions starting after the base version", () => {
    const persistence = makeTestPersistence();

    run(persistence, (store) =>
      store.append("Counter", "c1", 3, [
        event("A", { a: 1 }),
        event("B", { b: 2 }),
      ]),
    );

    expect(persistence.persisted).toEqual([
      {
        aggregateType: "Counter",
        aggregateId: "c1",
        version: 4,
        type: "A",
        payload: { a: 1 },
      },
      {
        aggregateType: "Counter",
        aggregateId: "c1",
        version: 5,
        type: "B",
        payload: { b: 2 },
      },
    ]);
  });

  it("assigns versions starting at 1 for a brand new stream", () => {
    const persistence = makeTestPersistence();

    run(persistence, (store) =>
      store.append("Counter", "c1", 0, [event("Created", { n: 1 })]),
    );

    expect(persistence.persisted.map((e) => e.version)).toEqual([1]);
  });

  it("is a no-op when there are no events to append", () => {
    const persistence = makeTestPersistence();

    run(persistence, (store) => store.append("Counter", "c1", 0, []));

    expect(persistence.persistCalls).toBe(0);
    expect(persistence.persisted).toHaveLength(0);
  });

  it("propagates persistence failures", () => {
    const persistence = makeTestPersistence({ failPersist: true });

    const exit = runExit(persistence, (store) =>
      store.append("Counter", "c1", 0, [event("Created", {})]),
    );

    expect(exit._tag).toBe("Failure");
    expect(extractFailure(exit)).toBeInstanceOf(UnknownEventStoreError);
  });
});

// ─── read ─────────────────────────────────────────────────────────────────────

describe("EventStore - read", () => {
  it("returns persisted events mapped to aggregate events", () => {
    const persistence = makeTestPersistence({
      seed: [
        {
          aggregateType: "Counter",
          aggregateId: "c1",
          version: 1,
          type: "Created",
          payload: { n: 0 },
        },
        {
          aggregateType: "Counter",
          aggregateId: "c1",
          version: 2,
          type: "Incremented",
          payload: { by: 5 },
        },
      ],
    });

    const events = run(persistence, (store) => store.read("Counter", "c1"));

    expect(events).toEqual([
      { type: "Created", payload: { n: 0 } },
      { type: "Incremented", payload: { by: 5 } },
    ]);
  });

  it("fails with StreamNotFoundError when there are no persisted events", () => {
    const persistence = makeTestPersistence();

    const exit = runExit(persistence, (store) =>
      store.read("Counter", "missing"),
    );

    expect(exit._tag).toBe("Failure");
    const error = extractFailure(exit);
    expect(error).toBeInstanceOf(StreamNotFoundError);
    expect((error as StreamNotFoundError).aggType).toBe("Counter");
    expect((error as StreamNotFoundError).aggId).toBe("missing");
  });

  it("propagates persistence read failures", () => {
    const persistence = makeTestPersistence({ failRead: true });

    const exit = runExit(persistence, (store) => store.read("Counter", "c1"));

    expect(exit._tag).toBe("Failure");
    expect(extractFailure(exit)).toBeInstanceOf(UnknownEventStoreError);
  });

  it("reads back events that were appended in the same unit of work", () => {
    const persistence = makeTestPersistence();

    const events = run(persistence, (store) =>
      Effect.gen(function* () {
        yield* store.append("Counter", "c1", 0, [event("Created", { n: 0 })]);
        return yield* store.read("Counter", "c1");
      }),
    );

    expect(events).toEqual([{ type: "Created", payload: { n: 0 } }]);
  });
});

// ─── helpers ────────────────────────────────────────────────────────────────────

function extractFailure(exit: unknown): unknown {
  const cause = (exit as { cause?: unknown }).cause;
  return findError(cause);
}

function findError(cause: unknown): unknown {
  if (cause && typeof cause === "object") {
    if ("error" in cause) {
      return (cause as { error: unknown }).error;
    }
    if ("left" in cause) {
      return findError((cause as { left: unknown }).left);
    }
    if ("right" in cause) {
      return findError((cause as { right: unknown }).right);
    }
  }
  return cause;
}

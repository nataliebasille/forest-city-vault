import { describe, it } from "node:test";
import { Effect } from "effect";
import { expect } from "expect";
import { AnyAggregateRoot } from "../aggregates/aggregate-root";
import { ConcurrencyError } from "./event-store";
import { EventTracker } from "./event-tracker";
import type { AggregateEvent } from "./event";

// ─── Test fixtures ────────────────────────────────────────────────────────────

const agg = (id: string, version: number): AnyAggregateRoot =>
  ({ id, version, snapshot: {} }) as unknown as AnyAggregateRoot;

const event = (
  type: string,
  payload: unknown,
): AggregateEvent<string, unknown> => ({ type, payload });

function run<A, E>(
  body: (tracker: EventTracker.Service) => Effect.Effect<A, E, never>,
): A {
  return Effect.runSync(
    Effect.gen(function* () {
      const tracker = yield* EventTracker;
      return yield* body(tracker);
    }).pipe(Effect.provide(EventTracker.make)),
  );
}

function runExit<A, E>(
  body: (tracker: EventTracker.Service) => Effect.Effect<A, E, never>,
) {
  return Effect.runSyncExit(
    Effect.gen(function* () {
      const tracker = yield* EventTracker;
      return yield* body(tracker);
    }).pipe(Effect.provide(EventTracker.make)),
  );
}

// ─── track ──────────────────────────────────────────────────────────────────

describe("EventTracker - track", () => {
  it("stages events in memory keyed by aggregate", () => {
    const events = run((tracker) =>
      Effect.gen(function* () {
        yield* tracker.track("Counter", agg("c1", 0), [event("Created", {})]);
        return yield* tracker.peek("Counter", "c1");
      }),
    );

    expect(events).toEqual([{ type: "Created", payload: {} }]);
  });

  it("accumulates events across multiple tracks on the same aggregate", () => {
    const drained = run((tracker) =>
      Effect.gen(function* () {
        // base version 0, no tracked events yet
        yield* tracker.track("Counter", agg("c1", 0), [event("Created", {})]);
        // one event tracked, so the next track expects the aggregate at version 1
        yield* tracker.track("Counter", agg("c1", 1), [
          event("Incremented", {}),
        ]);
        return yield* tracker.drain("Counter", "c1");
      }),
    );

    expect(drained?.baseVersion).toBe(0);
    expect(drained?.events.map((e) => e.type)).toEqual([
      "Created",
      "Incremented",
    ]);
  });

  it("fails with ConcurrencyError when a later track does not match the tracked version", () => {
    const exit = runExit((tracker) =>
      Effect.gen(function* () {
        yield* tracker.track("Counter", agg("c1", 0), [event("Created", {})]);
        // tracker already has 1 event (expected version 1), but we pass 5
        yield* tracker.track("Counter", agg("c1", 5), [
          event("Incremented", {}),
        ]);
      }),
    );

    expect(exit._tag).toBe("Failure");
    const error = extractFailure(exit);
    expect(error).toBeInstanceOf(ConcurrencyError);
    expect((error as ConcurrencyError).expectedVersion).toBe(1);
    expect((error as ConcurrencyError).actualVersion).toBe(5);
  });

  it("keeps tracked events separate per aggregate", () => {
    const [c1, c2] = run((tracker) =>
      Effect.gen(function* () {
        yield* tracker.track("Counter", agg("c1", 0), [event("A", {})]);
        yield* tracker.track("Counter", agg("c2", 0), [event("B", {})]);
        return [
          yield* tracker.peek("Counter", "c1"),
          yield* tracker.peek("Counter", "c2"),
        ] as const;
      }),
    );

    expect(c1).toEqual([{ type: "A", payload: {} }]);
    expect(c2).toEqual([{ type: "B", payload: {} }]);
  });
});

// ─── drain ────────────────────────────────────────────────────────────────────

describe("EventTracker - drain", () => {
  it("returns the tracked events with the base version they follow", () => {
    const drained = run((tracker) =>
      Effect.gen(function* () {
        yield* tracker.track("Counter", agg("c1", 3), [
          event("A", { a: 1 }),
          event("B", { b: 2 }),
        ]);
        return yield* tracker.drain("Counter", "c1");
      }),
    );

    expect(drained?.baseVersion).toBe(3);
    expect(drained?.events).toEqual([
      { type: "A", payload: { a: 1 } },
      { type: "B", payload: { b: 2 } },
    ]);
  });

  it("removes the tracked events so a second drain is empty", () => {
    const [first, second] = run((tracker) =>
      Effect.gen(function* () {
        yield* tracker.track("Counter", agg("c1", 0), [event("Created", {})]);
        return [
          yield* tracker.drain("Counter", "c1"),
          yield* tracker.drain("Counter", "c1"),
        ] as const;
      }),
    );

    expect(first?.events).toHaveLength(1);
    expect(second).toBeUndefined();
  });

  it("returns undefined when nothing has been tracked", () => {
    const drained = run((tracker) => tracker.drain("Counter", "missing"));

    expect(drained).toBeUndefined();
  });
});

// ─── peek ─────────────────────────────────────────────────────────────────────

describe("EventTracker - peek", () => {
  it("returns tracked events without removing them", () => {
    const [firstPeek, secondPeek] = run((tracker) =>
      Effect.gen(function* () {
        yield* tracker.track("Counter", agg("c1", 0), [event("Created", {})]);
        return [
          yield* tracker.peek("Counter", "c1"),
          yield* tracker.peek("Counter", "c1"),
        ] as const;
      }),
    );

    expect(firstPeek).toEqual([{ type: "Created", payload: {} }]);
    expect(secondPeek).toEqual([{ type: "Created", payload: {} }]);
  });

  it("returns an empty array when nothing has been tracked", () => {
    const events = run((tracker) => tracker.peek("Counter", "missing"));

    expect(events).toEqual([]);
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

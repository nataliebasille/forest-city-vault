import { describe, it } from "node:test";
import { Effect, Layer, Schema } from "effect";
import { expect } from "expect";
import { defineAggregateType } from "../aggregate-type-factory";
import { EventStore, UnknownEventStoreError } from "../events/event-store";
import type { EventStore as EventStoreTag } from "../events/event-store";
import { EventTracker } from "../events/event-tracker";
import type { AggregateEvent } from "../events/event";
import { RepositoryError } from "./repository";

const TestAggregate = defineAggregateType("TestAggregate", {
  id: Schema.String,
  schema: Schema.Struct({ value: Schema.Number }),
  events: {
    Created: {
      schema: Schema.Struct({ value: Schema.Number }),
      handler: (payload: { value: number }) => ({ value: payload.value }),
    },
    Updated: {
      schema: Schema.Struct({ value: Schema.Number }),
      handler: (_snapshot: { value: number }, payload: { value: number }) => ({
        value: payload.value,
      }),
    },
  },
  actions: {
    create: (payload: { value: number }) =>
      Effect.succeed({
        type: "Created" as const,
        payload,
      }),
  },
});

const pristine = TestAggregate.pristine("test-aggregate-1");

const aggregate = {
  id: pristine.id,
  version: 1,
  snapshot: { value: 42 },
};

type AppendCall = {
  aggType: string;
  aggId: string;
  baseVersion: number;
  events: readonly AggregateEvent<string, unknown>[];
};

function makeEventStore(
  append: EventStoreTag.Service["append"],
): EventStoreTag.Service {
  return {
    append,
    read: () => Effect.succeed([]),
  };
}

/**
 * Merges a shared in-memory {@link EventTracker} and the given
 * {@link EventStore} into a repository layer, exposing all three to the running
 * effect so tests can track events (as an action dispatcher would) and then
 * exercise the repository against the same tracker instance.
 */
function provideRepo<ROut, E>(
  repoLayer: Layer.Layer<ROut, E, EventStore>,
  eventStore: EventStoreTag.Service,
) {
  return repoLayer.pipe(
    Layer.provideMerge(EventTracker.make),
    Layer.provideMerge(Layer.succeed(EventStore, eventStore)),
  );
}

describe("Repository.createRepository", () => {
  it("drains tracked events and appends them to the event store on save", () => {
    const repoSaveCalls: (typeof aggregate)[] = [];
    const appendCalls: AppendCall[] = [];

    const eventStore = makeEventStore((aggType, aggId, baseVersion, events) =>
      Effect.sync(() => {
        appendCalls.push({ aggType, aggId, baseVersion, events });
      }),
    );

    const layer = provideRepo(
      TestAggregate.repository.make({
        getById: () =>
          Effect.fail(
            new RepositoryError({
              aggType: "TestAggregate",
              aggId: "missing",
              error: "not found",
            }),
          ),
        save: (agg) =>
          Effect.sync(() => {
            repoSaveCalls.push(agg);
          }),
      }),
      eventStore,
    );

    Effect.runSync(
      Effect.gen(function* () {
        const tracker = yield* EventTracker;
        yield* tracker.track("TestAggregate", pristine, [
          { type: "Created", payload: { value: 42 } },
        ]);
        yield* TestAggregate.repository.save(aggregate);
      }).pipe(Effect.provide(layer)),
    );

    expect(repoSaveCalls).toEqual([aggregate]);
    expect(appendCalls).toEqual([
      {
        aggType: "TestAggregate",
        aggId: String(aggregate.id),
        baseVersion: 0,
        events: [{ type: "Created", payload: { value: 42 } }],
      },
    ]);
  });

  it("does not touch the event store when nothing has been tracked", () => {
    let appendCalls = 0;

    const eventStore = makeEventStore(() =>
      Effect.sync(() => {
        appendCalls += 1;
      }),
    );

    const layer = provideRepo(
      TestAggregate.repository.make({
        getById: () =>
          Effect.fail(
            new RepositoryError({
              aggType: "TestAggregate",
              aggId: "missing",
              error: "not found",
            }),
          ),
        save: () => Effect.void,
      }),
      eventStore,
    );

    Effect.runSync(
      TestAggregate.repository.save(aggregate).pipe(Effect.provide(layer)),
    );

    expect(appendCalls).toBe(0);
  });

  it("applies tracked events to an aggregate loaded via getById", () => {
    const eventStore = makeEventStore(() => Effect.void);

    const layer = provideRepo(
      TestAggregate.repository.make({
        getById: (id) =>
          Effect.succeed({
            id,
            version: 1,
            snapshot: { value: 42 },
          }),
        save: () => Effect.void,
      }),
      eventStore,
    );

    const loaded = Effect.runSync(
      Effect.gen(function* () {
        const tracker = yield* EventTracker;
        yield* tracker.track("TestAggregate", aggregate, [
          { type: "Updated", payload: { value: 100 } },
        ]);
        return yield* TestAggregate.repository.getById(aggregate.id);
      }).pipe(Effect.provide(layer)),
    );

    expect(loaded.version).toBe(2);
    expect(loaded.snapshot).toEqual({ value: 100 });
  });

  it("returns the loaded aggregate unchanged when nothing is tracked", () => {
    const eventStore = makeEventStore(() => Effect.void);

    const layer = provideRepo(
      TestAggregate.repository.make({
        getById: (id) =>
          Effect.succeed({
            id,
            version: 1,
            snapshot: { value: 42 },
          }),
        save: () => Effect.void,
      }),
      eventStore,
    );

    const loaded = Effect.runSync(
      TestAggregate.repository
        .getById(aggregate.id)
        .pipe(Effect.provide(layer)),
    );

    expect(loaded.version).toBe(1);
    expect(loaded.snapshot).toEqual({ value: 42 });
  });

  it("maps event-store failures into RepositoryError", () => {
    const eventStore = makeEventStore((aggType, aggId) =>
      Effect.fail(
        new UnknownEventStoreError({
          aggType,
          aggId,
          error: new Error("boom"),
        }),
      ),
    );

    const layer = provideRepo(
      TestAggregate.repository.make({
        getById: () =>
          Effect.fail(
            new RepositoryError({
              aggType: "TestAggregate",
              aggId: "missing",
              error: "not found",
            }),
          ),
        save: () => Effect.void,
      }),
      eventStore,
    );

    const result = Effect.runSync(
      Effect.gen(function* () {
        const tracker = yield* EventTracker;
        yield* tracker.track("TestAggregate", pristine, [
          { type: "Created", payload: { value: 42 } },
        ]);
        yield* TestAggregate.repository.save(aggregate);
      }).pipe(Effect.flip, Effect.provide(layer)),
    );

    expect(result).toBeInstanceOf(RepositoryError);
    expect(result).toMatchObject({
      aggType: "TestAggregate",
      aggId: String(aggregate.id),
    });
  });
});


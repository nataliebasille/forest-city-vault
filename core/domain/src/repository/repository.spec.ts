import { describe, it } from "node:test";
import { Effect, Schema } from "effect";
import { expect } from "expect";
import { defineAggregateType } from "../aggregate-type-factory";
import { EventStore, UnknownEventStoreError } from "../events/event-store";
import type { EventStore as EventStoreTag } from "../events/event-store";
import { RepositoryError } from "./repository";

const TestAggregate = defineAggregateType("TestAggregate", {
  id: Schema.String,
  schema: Schema.Struct({ value: Schema.Number }),
  events: {
    Created: {
      schema: Schema.Struct({ value: Schema.Number }),
      handler: (payload: { value: number }) => ({ value: payload.value }),
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

const aggregate = {
  id: TestAggregate.pristine("test-aggregate-1").id,
  version: 1,
  snapshot: { value: 42 },
};

function makeEventStore(
  save: EventStoreTag.Service["save"],
): EventStoreTag.Service {
  return {
    append: () => Effect.void,
    read: () => Effect.succeed([]),
    save,
  };
}

describe("Repository.createRepository", () => {
  it("auto-saves aggregates into the event store after repo save", () => {
    const repoSaveCalls: typeof aggregate[] = [];
    const eventStoreCalls: Array<{ aggType: string; aggId: string }> = [];

    const repoLayer = TestAggregate.repository.make({
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
    });

    const eventStore = makeEventStore((aggType, agg) =>
      Effect.sync(() => {
        eventStoreCalls.push({ aggType, aggId: String(agg.id) });
      }),
    );

    Effect.runSync(
      TestAggregate.repository
        .save(aggregate)
        .pipe(
          Effect.provide(repoLayer),
          Effect.provideService(EventStore, eventStore),
        ),
    );

    expect(repoSaveCalls).toEqual([aggregate]);
    expect(eventStoreCalls).toEqual([
      { aggType: "TestAggregate", aggId: String(aggregate.id) },
    ]);
  });

  it("maps event-store failures into RepositoryError", () => {
    const repoLayer = TestAggregate.repository.make({
      getById: () =>
        Effect.fail(
          new RepositoryError({
            aggType: "TestAggregate",
            aggId: "missing",
            error: "not found",
          }),
        ),
      save: () => Effect.void,
    });

    const eventStore = makeEventStore((aggType, agg) =>
      Effect.fail(
        new UnknownEventStoreError({
          aggType,
          aggId: String(agg.id),
          error: new Error("boom"),
        }),
      ),
    );

    const result = Effect.runSync(
      TestAggregate.repository
        .save(aggregate)
        .pipe(
          Effect.flip,
          Effect.provide(repoLayer),
          Effect.provideService(EventStore, eventStore),
        ),
    );

    expect(result).toBeInstanceOf(RepositoryError);
    expect(result).toMatchObject({
      aggType: "TestAggregate",
      aggId: String(aggregate.id),
    });
  });
});

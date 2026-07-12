import { describe, it } from "node:test";
import { Effect, Layer, Schema } from "effect";
import { expect } from "expect";
import {
  defineAggregateType,
  type AggregateType_GetId,
  type AggregateType_GetSnapshot,
} from "../aggregate-type-factory";
import type { MaterializedAggregateRoot } from "../aggregates/aggregate-root";
import {
  EventStore,
  EventStorePersistence,
  type PersistedEvent,
} from "../events/event-store";
import { EventTracker } from "../events/event-tracker";
import { AggregateNotFoundError } from "./repository";

// ─── Test fixture ─────────────────────────────────────────────────────────────
//
// A real aggregate wired through the working `defineAggregateType(name, {...})`
// signature, with both a create and an update action so the tests can drive the
// genuine action dispatcher (which reduces the aggregate *and* tracks the events
// on the EventTracker) rather than calling `tracker.track` by hand.

const Account = defineAggregateType("Account", {
  id: Schema.String,
  schema: Schema.Struct({ value: Schema.Number }),
  events: {
    Created: {
      schema: Schema.Struct({ value: Schema.Number }),
      handler: (payload: { value: number }) => ({ value: payload.value }),
    },
    Incremented: {
      schema: Schema.Struct({ by: Schema.Number }),
      handler: (snapshot: { value: number }, payload: { by: number }) => ({
        value: snapshot.value + payload.by,
      }),
    },
  },
  actions: {
    create: (payload: { value: number }) =>
      Effect.succeed({ type: "Created" as const, payload }),
    increment: (_snapshot: { value: number }, payload: { by: number }) =>
      Effect.succeed({ type: "Incremented" as const, payload }),
  },
});

type AccountAgg = MaterializedAggregateRoot<
  AggregateType_GetId<typeof Account>,
  AggregateType_GetSnapshot<typeof Account>
>;

/**
 * Builds a fully independent repository stack: its own in-memory snapshot store
 * (backing `getById`/`save`), its own durable event log (a real
 * {@link EventStore} over an in-memory {@link EventStorePersistence}) and its
 * own {@link EventTracker}. Two scopes never share any of this state, which is
 * what lets the isolation tests below prove separately scoped processes keep
 * distinct trackers.
 */
function makeAccountScope() {
  const snapshots = new Map<string, AccountAgg>();
  const persistedEvents: PersistedEvent[] = [];

  const persistenceLayer = Layer.succeed(EventStorePersistence, {
    persist: (events) =>
      Effect.sync(() => {
        persistedEvents.push(...events);
      }),
    read: (aggType, aggId) =>
      Effect.succeed(
        persistedEvents.filter(
          (event) =>
            event.aggregateType === aggType && event.aggregateId === aggId,
        ),
      ),
  });

  const layer = Account.repository
    .make({
      getById: (id) => {
        const found = snapshots.get(String(id));

        return found ?
            Effect.succeed(found)
          : Effect.fail(
              new AggregateNotFoundError({
                aggType: "Account",
                aggId: String(id),
              }),
            );
      },
      save: (agg) =>
        Effect.sync(() => {
          snapshots.set(String(agg.id), agg);
        }),
    })
    .pipe(
      Layer.provideMerge(EventTracker.make),
      Layer.provideMerge(EventStore.make(persistenceLayer)),
    );

  return { layer, snapshots, persistedEvents };
}

// ─── Full integration: dispatcher ↔ tracker ↔ repository ───────────────────────

describe("Repository ↔ dispatcher ↔ tracker integration", () => {
  it("drives a full create → save → load → update → replay → save lifecycle", () => {
    const scope = makeAccountScope();

    const result = Effect.runSync(
      Effect.gen(function* () {
        // Dispatch a create action: the dispatcher reduces the pristine
        // aggregate and tracks the Created event on the EventTracker.
        const created = yield* Account.actions.create(
          Account.pristine("acc-1"),
          { value: 10 },
        );

        // Saving drains the tracked event and appends it to the durable log.
        yield* Account.repository.save(created);

        // Load it back from persistence (tracker is now empty).
        const loadedAfterCreate = yield* Account.repository.getById(created.id);

        // Dispatch an update on the loaded aggregate: the dispatcher tracks the
        // Incremented event but nothing has been saved yet.
        const incremented = yield* Account.actions.increment(
          loadedAfterCreate,
          {
            by: 5,
          },
        );

        // getById must replay the still-tracked Incremented event onto the
        // persisted (pre-update) snapshot.
        const replayedBeforeSave = yield* Account.repository.getById(
          created.id,
        );

        yield* Account.repository.save(incremented);

        // After saving, the tracker is drained again, so getById returns the
        // persisted snapshot unchanged.
        const loadedAfterSave = yield* Account.repository.getById(created.id);

        return {
          created,
          loadedAfterCreate,
          incremented,
          replayedBeforeSave,
          loadedAfterSave,
        };
      }).pipe(Effect.provide(scope.layer)),
    );

    expect(result.created).toMatchObject({
      version: 1,
      snapshot: { value: 10 },
    });
    expect(result.loadedAfterCreate).toMatchObject({
      version: 1,
      snapshot: { value: 10 },
    });
    expect(result.incremented).toMatchObject({
      version: 2,
      snapshot: { value: 15 },
    });
    // The key assertion: getById applied the tracked (but not-yet-saved) event.
    expect(result.replayedBeforeSave).toMatchObject({
      version: 2,
      snapshot: { value: 15 },
    });
    expect(result.loadedAfterSave).toMatchObject({
      version: 2,
      snapshot: { value: 15 },
    });

    // Both events reached the durable log with sequential, correct versions.
    expect(scope.persistedEvents).toEqual([
      {
        aggregateType: "Account",
        aggregateId: "acc-1",
        version: 1,
        type: "Created",
        payload: { value: 10 },
      },
      {
        aggregateType: "Account",
        aggregateId: "acc-1",
        version: 2,
        type: "Incremented",
        payload: { by: 5 },
      },
    ]);
  });

  it("does not replay events once they have been drained on save", () => {
    const scope = makeAccountScope();

    const loaded = Effect.runSync(
      Effect.gen(function* () {
        const created = yield* Account.actions.create(
          Account.pristine("acc-2"),
          { value: 3 },
        );
        yield* Account.repository.save(created);

        return yield* Account.repository.getById(created.id);
      }).pipe(Effect.provide(scope.layer)),
    );

    // A single tracked event, drained exactly once → applied exactly once.
    expect(loaded).toMatchObject({ version: 1, snapshot: { value: 3 } });
    expect(scope.persistedEvents).toHaveLength(1);
  });
});

// ─── Isolation between separately scoped processes ─────────────────────────────

describe("EventTracker isolation across scoped processes", () => {
  it("keeps undrained tracked events private to their own scope", () => {
    const scopeA = makeAccountScope();
    const scopeB = makeAccountScope();

    // Scope A tracks a create action but deliberately does NOT save, leaving the
    // event staged in scope A's tracker.
    const scopeAState = Effect.runSync(
      Effect.gen(function* () {
        const created = yield* Account.actions.create(
          Account.pristine("acc-1"),
          { value: 100 },
        );
        const tracker = yield* EventTracker;
        const trackedInA = yield* tracker.peek("Account", "acc-1");

        return { created, trackedInA };
      }).pipe(Effect.provide(scopeA.layer)),
    );

    // Scope B, running with its own tracker, must not observe scope A's event.
    const scopeBState = Effect.runSync(
      Effect.gen(function* () {
        const tracker = yield* EventTracker;
        const trackedInB = yield* tracker.peek("Account", "acc-1");
        const loadResult = yield* Effect.either(
          Account.repository.getById(scopeAState.created.id),
        );

        return { trackedInB, loadResult };
      }).pipe(Effect.provide(scopeB.layer)),
    );

    // Scope A genuinely staged the create...
    expect(scopeAState.trackedInA).toEqual([
      { type: "Created", payload: { value: 100 } },
    ]);
    // ...but scope B's tracker is empty and its store knows nothing of acc-1.
    expect(scopeBState.trackedInB).toEqual([]);
    expect(scopeBState.loadResult._tag).toBe("Left");

    // Nothing was durably written in either scope (neither saved).
    expect(scopeA.persistedEvents).toEqual([]);
    expect(scopeB.persistedEvents).toEqual([]);
  });

  it("lets two scoped processes save the same aggregate id independently", () => {
    const scopeA = makeAccountScope();
    const scopeB = makeAccountScope();

    const runScope = (
      scope: ReturnType<typeof makeAccountScope>,
      value: number,
    ) =>
      Effect.runSync(
        Effect.gen(function* () {
          const created = yield* Account.actions.create(
            Account.pristine("acc-1"),
            { value },
          );
          yield* Account.repository.save(created);

          return yield* Account.repository.getById(created.id);
        }).pipe(Effect.provide(scope.layer)),
      );

    const a = runScope(scopeA, 1);
    const b = runScope(scopeB, 2);

    expect(a).toMatchObject({ version: 1, snapshot: { value: 1 } });
    expect(b).toMatchObject({ version: 1, snapshot: { value: 2 } });

    // Each scope's durable log holds only its own event.
    expect(scopeA.persistedEvents).toEqual([
      {
        aggregateType: "Account",
        aggregateId: "acc-1",
        version: 1,
        type: "Created",
        payload: { value: 1 },
      },
    ]);
    expect(scopeB.persistedEvents).toEqual([
      {
        aggregateType: "Account",
        aggregateId: "acc-1",
        version: 1,
        type: "Created",
        payload: { value: 2 },
      },
    ]);
  });
});

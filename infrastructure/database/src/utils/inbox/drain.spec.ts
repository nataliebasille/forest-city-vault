import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Effect, Exit } from "effect";
import { Database, databaseSagaScoped } from "../../index";
import * as schema from "../../schema";
import { DatabaseTest } from "../../testing";
import { drain } from "./drain";

const { inbox, errors } = schema.inboxes.payments;

type InboxInsert = (typeof inbox)["$inferSelect"];

describe("drain", () => {
  test("returns an empty array when there are no received items", async () => {
    const result = await runWith(
      drain({
        inbox: "payments",
        requestId: "req-1",
        scoped: databaseSagaScoped,
        action: () => Effect.void,
      }),
    );
    assert.deepEqual(result, []);
  });

  test("marks an item as processed when the action succeeds", async () => {
    await runWith(
      Effect.gen(function* () {
        const db = yield* Database;
        yield* db.query((sql) =>
          sql.insert(inbox).values([makeItem({ idempotencyKey: "k1" })]),
        );

        yield* drain({
          inbox: "payments",
          requestId: "req-1",
          scoped: databaseSagaScoped,
          action: () => Effect.void,
        });

        const [item] = yield* db.query((sql) => sql.select().from(inbox));
        assert.equal(item.status, "processed");
        assert.equal(item.attempts, 1);
      }),
    );
  });

  test("marks an item as failed when the action fails before max attempts", async () => {
    await runWith(
      Effect.gen(function* () {
        const db = yield* Database;
        yield* db.query((sql) =>
          sql.insert(inbox).values([makeItem({ idempotencyKey: "k1" })]),
        );

        yield* drain({
          inbox: "payments",
          requestId: "req-1",
          scoped: databaseSagaScoped,
          action: () => Effect.fail(new Error("action failed")),
        });

        const [item] = yield* db.query((sql) => sql.select().from(inbox));
        assert.equal(item.status, "failed");
        assert.equal(item.attempts, 1);
      }),
    );
  });

  test("marks an item as dead_letter when the action fails at max attempts", async () => {
    await runWith(
      Effect.gen(function* () {
        const db = yield* Database;
        // Insert with attempts already at MAX_ATTEMPTS - 1 (4)
        yield* db.query((sql) =>
          sql
            .insert(inbox)
            .values([makeItem({ idempotencyKey: "k1", attempts: 4 })]),
        );

        yield* drain({
          inbox: "payments",
          requestId: "req-1",
          scoped: databaseSagaScoped,
          action: () => Effect.fail(new Error("still failing")),
        });

        const [item] = yield* db.query((sql) => sql.select().from(inbox));
        assert.equal(item.status, "dead_letter");
        assert.equal(item.attempts, 5);
      }),
    );
  });

  test("records an entry in inbox_errors on action failure", async () => {
    await runWith(
      Effect.gen(function* () {
        const db = yield* Database;
        yield* db.query((sql) =>
          sql.insert(inbox).values([makeItem({ idempotencyKey: "k1" })]),
        );

        yield* drain({
          inbox: "payments",
          requestId: "req-1",
          scoped: databaseSagaScoped,
          action: () => Effect.fail(new Error("action failed")),
        });

        const errorRows = yield* db.query((sql) => sql.select().from(errors));
        assert.equal(errorRows.length, 1);
        assert.equal(errorRows[0].requestId, "req-1");
        assert.equal(errorRows[0].attemptNumber, 1);

        const parsedError = JSON.parse(errorRows[0].error);
        assert.equal(parsedError.message, "action failed");
      }),
    );
  });

  test("does not process items that are not in received status", async () => {
    await runWith(
      Effect.gen(function* () {
        const db = yield* Database;
        yield* db.query((sql) =>
          sql
            .insert(inbox)
            .values([
              makeItem({ idempotencyKey: "k1", status: "failed" }),
              makeItem({ idempotencyKey: "k2", status: "processed" }),
              makeItem({ idempotencyKey: "k3", status: "dead_letter" }),
            ]),
        );

        let callCount = 0;
        yield* drain({
          inbox: "payments",
          requestId: "req-1",
          scoped: databaseSagaScoped,
          action: () => {
            callCount++;
            return Effect.void;
          },
        });

        assert.equal(callCount, 0);
      }),
    );
  });

  test("rolls back the saga when the action defects", async () => {
    await runWith(
      Effect.gen(function* () {
        const db = yield* Database;
        yield* db.query((sql) =>
          sql.insert(inbox).values([makeItem({ idempotencyKey: "k1" })]),
        );

        // action writes a row on the saga transaction, then defects
        const result = yield* Effect.exit(
          drain({
            inbox: "payments",
            requestId: "req-1",
            scoped: databaseSagaScoped,
            action: () =>
              Effect.gen(function* () {
                const txDb = yield* Database;
                yield* txDb.query((sql) =>
                  sql
                    .insert(inbox)
                    .values([makeItem({ idempotencyKey: "side-effect" })]),
                );
                yield* Effect.die(new Error("unexpected defect"));
              }),
          }),
        );

        assert.ok(
          !Exit.isSuccess(result),
          "drain should fail when action defects",
        );

        const items = yield* db.query((sql) => sql.select().from(inbox));
        // side-effect insert was rolled back; original item unchanged
        assert.equal(items.length, 1);
        assert.equal(items[0].idempotencyKey, "k1");
        assert.equal(items[0].status, "received");
      }),
    );
  });

  test("rolls back action side effects when the action fails with Effect.fail", async () => {
    await runWith(
      Effect.gen(function* () {
        const db = yield* Database;
        yield* db.query((sql) =>
          sql.insert(inbox).values([makeItem({ idempotencyKey: "k1" })]),
        );

        yield* drain({
          inbox: "payments",
          requestId: "req-1",
          scoped: databaseSagaScoped,
          action: () =>
            Effect.gen(function* () {
              const txDb = yield* Database;
              yield* txDb.query((sql) =>
                sql
                  .insert(inbox)
                  .values([makeItem({ idempotencyKey: "side-effect" })]),
              );
              yield* Effect.fail(new Error("action failed"));
            }),
        });

        const items = yield* db.query((sql) => sql.select().from(inbox));
        // the action's side-effect insert should be rolled back
        assert.equal(items.length, 1);
        assert.equal(items[0].idempotencyKey, "k1");
        assert.equal(items[0].status, "failed");
      }),
    );
  });

  test("does not roll back previously committed sagas when a later action defects", async () => {
    await runWith(
      Effect.gen(function* () {
        const db = yield* Database;
        yield* db.query((sql) =>
          sql.insert(inbox).values([
            makeItem({
              idempotencyKey: "k1",
              receivedAt: new Date(0),
            }),
            makeItem({
              idempotencyKey: "k2",
              receivedAt: new Date(1),
            }),
          ]),
        );

        yield* drain({
          inbox: "payments",
          requestId: "req-1",
          scoped: databaseSagaScoped,
          action: (msg) =>
            msg.idempotencyKey === "k2"
              ? Effect.die(new Error("defect on second item"))
              : Effect.void,
        }).pipe(Effect.exit);

        const items = yield* db.query((sql) =>
          sql.select().from(inbox).orderBy(inbox.receivedAt),
        );
        assert.equal(
          items[0].status,
          "processed",
          "first item should be committed",
        );
        assert.equal(
          items[1].status,
          "received",
          "second item should be rolled back to received",
        );
      }),
    );
  });

  test("processes at most 30 items per drain call", async () => {
    await runWith(
      Effect.gen(function* () {
        const db = yield* Database;
        const items = Array.from({ length: 31 }, (_, i) =>
          makeItem({ idempotencyKey: `key-${i}` }),
        );
        yield* db.query((sql) => sql.insert(inbox).values(items));

        let callCount = 0;
        yield* drain({
          inbox: "payments",
          requestId: "req-1",
          scoped: databaseSagaScoped,
          action: () => {
            callCount++;
            return Effect.void;
          },
        });

        assert.equal(callCount, 30);
      }),
    );
  });
});

function makeItem(overrides: Partial<InboxInsert> = {}): InboxInsert {
  return {
    id: crypto.randomUUID(),
    requestId: "test-request",
    idempotencyKey: `key-${Math.random().toString(36).slice(2, 10)}`,
    status: "received",
    attempts: 0,
    receivedAt: new Date(),
    processedAt: null,
    occurredAt: null,
    provider: "clover",
    providerEventId: "evt-1",
    providerObjectId: "ORDER:order-1",
    eventType: "payment",
    payloadJson: "{}",
    ...overrides,
  };
}

/** Runs an Effect against a fresh in-memory database. */
function runWith<A>(effect: Effect.Effect<A, unknown, Database>): Promise<A> {
  return Effect.runPromise(
    effect.pipe(Effect.provide(DatabaseTest)) as Effect.Effect<A, never, never>,
  );
}

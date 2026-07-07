import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { Effect, Exit } from "effect";

import { Database, dbSchema } from "@forest-city-vault/infrastructure-database";
import { createTestDatabase } from "@forest-city-vault/infrastructure-database/testing";

import { SagaScopeLive } from "../live";
import { SagaMiddleware } from "./saga";

const inbox = dbSchema.inboxes.payments.inbox;

type InboxInsert = (typeof inbox)["$inferInsert"];

const record = (idempotencyKey: string): InboxInsert => ({
  requestId: "req-saga",
  idempotencyKey,
  status: "received",
  provider: "clover",
  providerEventId: "P:payment-1",
  providerObjectId: "payment-1",
  eventType: "payment",
  payloadJson: "{}",
  occurredAt: new Date("2024-01-01T12:00:00.000Z"),
  receivedAt: new Date("2024-01-01T12:00:01.000Z"),
});

/**
 * Builds a fresh in-memory database and returns both a plain drizzle handle
 * (for assertions) and the base `Database` layer. The saga scope
 * ({@link SagaScopeLive}) is layered on top in each test to provide the `Saga`
 * registry and the transaction-bound `Database` the middleware drives — the same
 * wiring `makeCloverTestContext` uses for the routes.
 */
async function setup() {
  const { db: testDb, layer } = await createTestDatabase();
  return { testDb, layer };
}

describe("SagaMiddleware", () => {
  test("commits the handler's writes when it succeeds", async () => {
    const { testDb, layer } = await setup();

    const result = await Effect.runPromise(
      SagaMiddleware(
        Effect.gen(function* () {
          const db = yield* Database;
          yield* db.query((sql) =>
            sql.insert(inbox).values([record("commit")]),
          );
          return "ok" as const;
        }),
      ).pipe(Effect.provide(SagaScopeLive), Effect.provide(layer)),
    );

    assert.equal(result, "ok");

    const rows = await testDb.select().from(inbox);
    assert.equal(rows.length, 1, "the write should be committed");
    assert.equal(rows[0].idempotencyKey, "commit");
  });

  test("rolls back the handler's writes when it fails", async () => {
    const { testDb, layer } = await setup();

    const exit = await Effect.runPromise(
      SagaMiddleware(
        Effect.gen(function* () {
          const db = yield* Database;
          yield* db.query((sql) =>
            sql.insert(inbox).values([record("rollback")]),
          );
          return yield* Effect.fail(new Error("handler blew up"));
        }),
      ).pipe(Effect.provide(SagaScopeLive), Effect.provide(layer), Effect.exit),
    );

    assert.ok(Exit.isFailure(exit), "the effect should fail");

    const rows = await testDb.select().from(inbox);
    assert.equal(rows.length, 0, "the write should be rolled back");
  });

  test("rolls back the handler's writes when it defects", async () => {
    const { testDb, layer } = await setup();

    const exit = await Effect.runPromise(
      SagaMiddleware(
        Effect.gen(function* () {
          const db = yield* Database;
          yield* db.query((sql) =>
            sql.insert(inbox).values([record("defect")]),
          );
          return yield* Effect.die(new Error("unexpected defect"));
        }),
      ).pipe(Effect.provide(SagaScopeLive), Effect.provide(layer), Effect.exit),
    );

    assert.ok(Exit.isFailure(exit), "the effect should die");

    const rows = await testDb.select().from(inbox);
    assert.equal(rows.length, 0, "the write should be rolled back");
  });
});

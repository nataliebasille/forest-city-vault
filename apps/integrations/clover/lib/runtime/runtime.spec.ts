import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { Database, dbSchema } from "@forest-city-vault/infrastructure-database";
import { Saga } from "@forest-city-vault/platform-saga";
import { Effect, Option } from "effect";
import { NextRequest } from "next/server";

import { RequestTrace } from "@/lib/runtime/middleware/request-trace";
import { makeRouteTest } from "@/lib/testing/make-route-test";

// Import the route helpers through the same `makeRouteTest` harness the route
// specs use: it installs the `live.ts` mock first, so `route`/`pooledRoute` are
// bound to the transactional / pooled test layers over an in-memory database.
const {
  db,
  time: FIXED_TIME,
  module: { route, pooledRoute },
} = await makeRouteTest<typeof import("@/runtime")>(
  import.meta.url,
  "./public",
);

const inbox = dbSchema.inboxes.payments.inbox;

function request() {
  return new NextRequest("http://localhost/runtime-test", { method: "POST" });
}

function tracedRequest() {
  return new NextRequest("http://localhost/runtime-test", {
    method: "POST",
    headers: { "x-request-id": "trace-123" },
  });
}

function insertPaymentEvent(providerEventId: string) {
  return Effect.gen(function* () {
    const database = yield* Database;
    yield* database.query((sql) =>
      sql.insert(inbox).values([
        {
          requestId: "req-tx-test",
          status: "received",
          idempotencyKey: `tx:${providerEventId}`,
          provider: "clover",
          providerEventId,
          providerObjectId: providerEventId.split(":")[1] ?? providerEventId,
          eventType: "payment",
          payloadJson: JSON.stringify({ merchantId: "merchant-tx" }),
          occurredAt: new Date(1700000000000),
          receivedAt: FIXED_TIME,
        },
      ]),
    );
  });
}

describe("route", () => {
  // `route` composes `withSaga` as middleware, so every handler runs inside one
  // saga-scoped database transaction provided by `AppLive`. These tests exercise
  // that boundary directly: a handler that fails after writing must leave nothing
  // behind, while one that succeeds must persist its writes — with no opt-in from
  // the handler.
  describe("transactionality", () => {
    test("rolls back writes when the handler fails after writing", async () => {
      const failingRoute = route(() =>
        Effect.gen(function* () {
          yield* insertPaymentEvent("P:tx_rollback_1");
          return yield* Effect.fail(new Error("boom after write"));
        }),
      );

      const response = await failingRoute(request());
      assert.equal(response.status, 500);

      const rows = await db.select().from(inbox);
      const persisted = rows.find(
        (r) => r.providerEventId === "P:tx_rollback_1",
      );
      assert.equal(
        persisted,
        undefined,
        "the write before the failure should be rolled back",
      );
    });

    test("commits writes when the handler succeeds", async () => {
      const succeedingRoute = route(() =>
        Effect.gen(function* () {
          yield* insertPaymentEvent("P:tx_commit_1");
          return true;
        }),
      );

      const response = await succeedingRoute(request());
      assert.equal(response.status, 200);

      const rows = await db.select().from(inbox);
      const persisted = rows.find((r) => r.providerEventId === "P:tx_commit_1");
      assert.ok(persisted, "the write should be committed");
    });
  });

  // `route` composes `withSaga` as middleware, so a normal route runs its handler
  // inside exactly one request saga with request tracing active. These tests
  // register spy participants against the ambient `Saga` the helper provides.
  describe("request saga", () => {
    test("runs the handler inside a saga with request tracing active", async () => {
      const observed = await new Promise<{
        hasSaga: boolean;
        requestId: string;
      }>((resolve) => {
        const observingRoute = route(() =>
          Effect.gen(function* () {
            const saga = yield* Effect.serviceOption(Saga);
            const trace = yield* RequestTrace;
            resolve({
              hasSaga: Option.isSome(saga),
              requestId: trace.requestId,
            });
            return true;
          }),
        );
        void observingRoute(tracedRequest());
      });

      assert.equal(
        observed.hasSaga,
        true,
        "the handler should run inside the request saga",
      );
      assert.equal(
        observed.requestId,
        "trace-123",
        "request tracing should be active inside the saga",
      );
    });

    test("commits saga participants registered by the handler on success", async () => {
      const events: string[] = [];

      const committingRoute = route(() =>
        Effect.gen(function* () {
          const saga = yield* Saga;
          yield* saga.register({
            commit: Effect.sync(() => {
              events.push("commit");
            }),
            rollback: Effect.sync(() => {
              events.push("rollback");
            }),
          });
          return true;
        }),
      );

      const response = await committingRoute(tracedRequest());
      assert.equal(response.status, 200);
      assert.deepEqual(events, ["commit"]);
    });

    test("rolls back saga participants when the handler fails", async () => {
      const events: string[] = [];

      const failingRoute = route(() =>
        Effect.gen(function* () {
          const saga = yield* Saga;
          yield* saga.register({
            commit: Effect.sync(() => {
              events.push("commit");
            }),
            rollback: Effect.sync(() => {
              events.push("rollback");
            }),
          });
          return yield* Effect.fail(new Error("boom"));
        }),
      );

      const response = await failingRoute(tracedRequest());
      assert.equal(response.status, 500);
      assert.deepEqual(events, ["rollback"]);
    });

    test("rolls back saga participants when the handler defects", async () => {
      const events: string[] = [];

      const defectingRoute = route(() =>
        Effect.gen(function* () {
          const saga = yield* Saga;
          yield* saga.register({
            commit: Effect.sync(() => {
              events.push("commit");
            }),
            rollback: Effect.sync(() => {
              events.push("rollback");
            }),
          });
          return yield* Effect.die(new Error("boom"));
        }),
      );

      // A defect propagates through the route (it is not converted to a
      // Response), but the request saga must still roll back its participants.
      await assert.rejects(defectingRoute(tracedRequest()));
      assert.deepEqual(events, ["rollback"]);
    });
  });
});

describe("pooledRoute", () => {
  // `pooledRoute` intentionally does NOT compose `withSaga`, so it establishes no
  // request-wide saga (and therefore no request-wide transaction). Inbox drains
  // rely on this: each message opens its own independent saga, and failure
  // bookkeeping is written on the base pool outside any message saga.
  test("does not establish a request-wide saga", async () => {
    const hasSaga = await new Promise<boolean>((resolve) => {
      const observingRoute = pooledRoute(() =>
        Effect.gen(function* () {
          const saga = yield* Effect.serviceOption(Saga);
          resolve(Option.isSome(saga));
          return true;
        }),
      );
      void observingRoute(request());
    });

    assert.equal(
      hasSaga,
      false,
      "pooledRoute must not wrap the handler in a request-wide saga",
    );
  });
});

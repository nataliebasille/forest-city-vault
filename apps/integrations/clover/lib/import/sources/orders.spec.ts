import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { HttpClient, HttpClientResponse } from "@effect/platform";
import { staticClock } from "@forest-city-vault/core-clock";
import { CloverConfig } from "@forest-city-vault/core-config";
import { Database } from "@forest-city-vault/infrastructure-database";
import { makeDatabaseTestContext } from "@forest-city-vault/infrastructure-database/testing";
import { Effect, Exit, Layer, Option, Redacted } from "effect";
import { eq } from "drizzle-orm";

import { ordersImportSource } from "./orders";

const NOW = new Date("2024-06-01T00:00:00.000Z");
const MERCHANT_ID = "test-merchant-id";

const config = CloverConfig.make({
  appId: "test-app-id",
  secretCode: "test-app-secret",
  webhookAuthCode: "test-auth-code",
  processorSecret: Redacted.make("test-processor-secret"),
  url: "http://clover.test",
  oauthUrl: "http://oauth.clover.test",
  tokenEncryptionKey: Redacted.make("orders-source-encryption-key"),
  merchantId: MERCHANT_ID,
  merchantAccessToken: Option.some(Redacted.make("static-access-token")),
  oauthRedirectUri: "http://clover.test/api/oauth/callback",
  oauthStateSecret: Redacted.make("test-oauth-state-secret"),
});

type CapturedRequest = { url: string; params: URLSearchParams };

describe("ordersImportSource.list", () => {
  test("always sends modifiedTime lower bound and ASC ordering", async () => {
    const { run, captured } = await makeContext([
      {
        elements: [],
      },
    ]);

    const exit = await run(
      ordersImportSource.list({
        merchantId: MERCHANT_ID,
        startTimestamp: 1_700_000_000_000,
      }),
    );

    assert.equal(Exit.isSuccess(exit), true);
    assert.equal(captured.length, 1);
    assert.equal(
      captured[0].params.get("filter"),
      "modifiedTime>=1700000000000",
    );
    assert.equal(captured[0].params.get("orderBy"), "modifiedTime ASC");
    assert.equal(captured[0].params.get("limit"), "50");
    assert.equal(captured[0].params.get("offset"), "0");
    assert.equal(captured[0].params.get("expand"), "payments,lineItems");
  });

  test("exhausts boundary pages when the first page ends at the watermark", async () => {
    const boundary = 1_700_000_000_000;
    const firstPage = Array.from({ length: 50 }, (_, i) => ({
      id: `ORDER-${i}`,
      total: 1000,
      paymentState: "PAID",
      state: "OPEN",
      createdTime: boundary,
      modifiedTime: boundary,
      lineItems: { elements: [] },
      payments: { elements: [] },
    }));

    const { run, captured } = await makeContext([
      { elements: firstPage },
      {
        elements: [
          {
            id: "ORDER-50",
            total: 1000,
            paymentState: "PAID",
            state: "OPEN",
            createdTime: boundary,
            modifiedTime: boundary + 1,
            lineItems: { elements: [] },
            payments: { elements: [] },
          },
        ],
      },
    ]);

    const exit = await run(
      ordersImportSource.list({
        merchantId: MERCHANT_ID,
        startTimestamp: boundary,
      }),
    );

    assert.equal(Exit.isSuccess(exit), true);
    if (Exit.isSuccess(exit)) {
      assert.equal(exit.value.length, 51);
    }
    assert.equal(captured.length, 2);
    assert.equal(captured[0].params.get("offset"), "0");
    assert.equal(captured[1].params.get("offset"), "50");
  });
});

describe("ordersImportSource.enqueue", () => {
  test("enqueues once per (order, modifiedTime) revision", async () => {
    const { run } = await makeContext([{ elements: [] }]);

    const order = {
      id: "ORDER1",
      total: 1000,
      paymentState: "PAID" as const,
      state: "OPEN",
      createdTime: 1_700_000_000_000,
      modifiedTime: 1_700_000_000_000,
      lineItems: { elements: [] as const },
      payments: { elements: [] as const },
    };

    const first = await run(
      ordersImportSource.enqueue([order], {
        merchantId: MERCHANT_ID,
        requestId: "req-1",
        receivedAt: NOW,
      }),
    );
    if (Exit.isSuccess(first)) {
      assert.equal(first.value.inserted, 1);
    }

    const dupe = await run(
      ordersImportSource.enqueue([order], {
        merchantId: MERCHANT_ID,
        requestId: "req-1",
        receivedAt: NOW,
      }),
    );
    if (Exit.isSuccess(dupe)) {
      assert.equal(dupe.value.inserted, 0);
    }

    const edited = await run(
      ordersImportSource.enqueue([{ ...order, modifiedTime: order.modifiedTime + 1 }], {
        merchantId: MERCHANT_ID,
        requestId: "req-2",
        receivedAt: NOW,
      }),
    );
    if (Exit.isSuccess(edited)) {
      assert.equal(edited.value.inserted, 1);
    }

    const rows = await run(
      Effect.gen(function* () {
        const database = yield* Database;
        const inbox = database.schema.inboxes.orders.inbox;
        return yield* database.query((sql) =>
          sql.select().from(inbox).where(eq(inbox.providerObjectId, "ORDER1")),
        );
      }),
    );

    assert.equal(Exit.isSuccess(rows), true);
    if (Exit.isSuccess(rows)) {
      assert.equal(rows.value.length, 2);
      assert.equal(rows.value[0].providerEventId, "O:ORDER1");
      assert.equal(rows.value[0].eventType, "upsert");
    }
  });
});

function stubHttpClient(
  responseBodies: unknown[],
  captured: CapturedRequest[],
) {
  let index = 0;
  const client = HttpClient.make((request) => {
    captured.push({
      url: request.url,
      params: new URLSearchParams(
        (request.urlParams as ReadonlyArray<readonly [string, string]>).map(
          ([key, value]) => [key, value] as [string, string],
        ),
      ),
    });
    const body = responseBodies[index] ?? { elements: [] };
    index += 1;

    return Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  return Layer.succeed(HttpClient.HttpClient, client);
}

async function makeContext(responseBodies: unknown[]) {
  const { layer: databaseLayer } = await makeDatabaseTestContext();
  const captured: CapturedRequest[] = [];

  const layer = Layer.mergeAll(
    Layer.succeed(CloverConfig, config),
    staticClock(NOW),
    stubHttpClient(responseBodies, captured),
    databaseLayer,
  );

  const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.runPromiseExit(
      effect.pipe(Effect.provide(layer)) as Effect.Effect<A, E, never>,
    );

  return { captured, run };
}

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { HttpClient, HttpClientResponse } from "@effect/platform";
import { staticClock } from "@forest-city-vault/core-clock";
import { CloverConfig } from "@forest-city-vault/core-config";
import { Database } from "@forest-city-vault/infrastructure-database";
import { makeDatabaseTestContext } from "@forest-city-vault/infrastructure-database/testing";
import { Effect, Exit, Layer, Option, Redacted } from "effect";
import { eq } from "drizzle-orm";

import { vendorItemsImportSource } from "./vendor-items";

const NOW = new Date("2024-06-01T00:00:00.000Z");
const MERCHANT_ID = "test-merchant-id";

const config = CloverConfig.make({
  appId: "test-app-id",
  secretCode: "test-app-secret",
  webhookAuthCode: "test-auth-code",
  processorSecret: Redacted.make("test-processor-secret"),
  url: "http://clover.test",
  oauthUrl: "http://oauth.clover.test",
  tokenEncryptionKey: Redacted.make("vendor-items-source-encryption-key"),
  merchantId: MERCHANT_ID,
  merchantAccessToken: Option.some(Redacted.make("static-access-token")),
  oauthRedirectUri: "http://clover.test/api/oauth/callback",
  oauthStateSecret: Redacted.make("test-oauth-state-secret"),
});

type CapturedRequest = { url: string; params: URLSearchParams };

describe("vendorItemsImportSource.list", () => {
  test("sends a modifiedTime>=0 lower bound on a cold cursor (never omits the filter)", async () => {
    const { run, captured } = await makeContext({ elements: [] });

    const exit = await run(
      vendorItemsImportSource.list({
        merchantId: MERCHANT_ID,
        startTimestamp: 0,
      }),
    );

    assert.equal(Exit.isSuccess(exit), true);
    assert.equal(captured.length, 1);
    const { params } = captured[0];
    // The items endpoint has no 90-day filter clamp, so a
    // cold-cursor full backfill still sends `modifiedTime>=0` rather than
    // omitting the bound — the "no filter" path Clover was seen to mishandle.
    assert.equal(params.get("filter"), "modifiedTime>=0");
    assert.equal(params.get("orderBy"), "modifiedTime ASC");
    assert.equal(params.get("expand"), "categories");
    // The source owns its single-page count and always fetches from offset 0.
    assert.equal(params.get("limit"), "50");
    assert.equal(params.get("offset"), "0");
  });

  test("sends a modifiedTime lower bound once the cursor has advanced", async () => {
    const { run, captured } = await makeContext({ elements: [] });

    const exit = await run(
      vendorItemsImportSource.list({
        merchantId: MERCHANT_ID,
        startTimestamp: 1_700_000_000_000,
      }),
    );

    assert.equal(Exit.isSuccess(exit), true);
    assert.equal(
      captured[0].params.get("filter"),
      "modifiedTime>=1700000000000",
    );
  });
});

describe("vendorItemsImportSource.enqueue", () => {
  test("enqueues each item as an upsert and re-enqueues a later revision", async () => {
    const { run } = await makeContext({ elements: [] });

    const item = {
      id: "ITEM1",
      name: "Syrup",
      modifiedTime: 1_700_000_000_000,
    };

    const first = await run(
      vendorItemsImportSource.enqueue([item], {
        merchantId: MERCHANT_ID,
        requestId: "req-1",
        receivedAt: NOW,
      }),
    );
    assert.equal(Exit.isSuccess(first), true);
    if (Exit.isSuccess(first)) {
      assert.equal(first.value.inserted, 1);
    }

    // Re-importing the same revision at the watermark boundary is absorbed.
    const dupe = await run(
      vendorItemsImportSource.enqueue([item], {
        merchantId: MERCHANT_ID,
        requestId: "req-1",
        receivedAt: NOW,
      }),
    );
    if (Exit.isSuccess(dupe)) {
      assert.equal(dupe.value.inserted, 0);
    }

    // A later edit (newer modifiedTime) enqueues again so the change reconciles.
    const edited = await run(
      vendorItemsImportSource.enqueue(
        [{ ...item, name: "Maple Syrup", modifiedTime: 1_700_000_100_000 }],
        { merchantId: MERCHANT_ID, requestId: "req-2", receivedAt: NOW },
      ),
    );
    if (Exit.isSuccess(edited)) {
      assert.equal(edited.value.inserted, 1);
    }

    const rows = await run(
      Effect.gen(function* () {
        const database = yield* Database;
        const inbox = database.schema.inboxes.vendorItems.inbox;
        return yield* database.query((sql) =>
          sql.select().from(inbox).where(eq(inbox.providerObjectId, "ITEM1")),
        );
      }),
    );

    assert.equal(Exit.isSuccess(rows), true);
    if (Exit.isSuccess(rows)) {
      assert.equal(rows.value.length, 2);
      for (const row of rows.value) {
        assert.equal(row.eventType, "upsert");
        assert.equal(row.provider, "clover");
        assert.equal(row.providerEventId, "I:ITEM1");
      }
    }
  });
});

function stubHttpClient(responseBody: unknown, captured: CapturedRequest[]) {
  const client = HttpClient.make((request) => {
    captured.push({
      url: request.url,
      params: new URLSearchParams(
        (request.urlParams as ReadonlyArray<readonly [string, string]>).map(
          ([key, value]) => [key, value] as [string, string],
        ),
      ),
    });
    return Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify(responseBody), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  return Layer.succeed(HttpClient.HttpClient, client);
}

async function makeContext(responseBody: unknown) {
  const { layer: databaseLayer, db } = await makeDatabaseTestContext();
  const captured: CapturedRequest[] = [];

  const layer = Layer.mergeAll(
    Layer.succeed(CloverConfig, config),
    staticClock(NOW),
    stubHttpClient(responseBody, captured),
    databaseLayer,
  );

  const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.runPromiseExit(
      effect.pipe(Effect.provide(layer)) as Effect.Effect<A, E, never>,
    );

  return { captured, db, run };
}

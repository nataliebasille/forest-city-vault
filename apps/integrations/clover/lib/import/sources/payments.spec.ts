import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { HttpClient, HttpClientResponse } from "@effect/platform";
import { staticClock } from "@forest-city-vault/core-clock";
import { CloverConfig } from "@forest-city-vault/core-config";
import { makeDatabaseTestContext } from "@forest-city-vault/infrastructure-database/testing";
import { Effect, Exit, Layer, Option, Redacted } from "effect";

import { paymentsImportSource } from "./payments";

const NOW = new Date("2024-06-01T00:00:00.000Z");
const MERCHANT_ID = "test-merchant-id";

const config = CloverConfig.make({
  appId: "test-app-id",
  secretCode: "test-app-secret",
  webhookAuthCode: "test-auth-code",
  processorSecret: Redacted.make("test-processor-secret"),
  url: "http://clover.test",
  oauthUrl: "http://oauth.clover.test",
  tokenEncryptionKey: Redacted.make("payments-source-encryption-key"),
  merchantId: MERCHANT_ID,
  merchantAccessToken: Option.some(Redacted.make("static-access-token")),
  oauthRedirectUri: "http://clover.test/api/oauth/callback",
  oauthStateSecret: Redacted.make("test-oauth-state-secret"),
});

type CapturedRequest = { url: string; params: URLSearchParams };

describe("paymentsImportSource.list", () => {
  test("always sends the createdTime lower bound it is given (cold-start floor)", async () => {
    const { run, captured } = await makeContext({ elements: [] });

    // The engine passes a real backfill floor (never 0) on a cold cursor, so the
    // source always sends an explicit `createdTime>=` bound. Omitting it makes
    // Clover return only its recent ~90-day window and miss older history.
    const coldStartFloor = 1_699_000_000_000;
    const exit = await run(
      paymentsImportSource.list({
        merchantId: MERCHANT_ID,
        startTimestamp: coldStartFloor,
        limit: 50,
        offset: 0,
      }),
    );

    assert.equal(Exit.isSuccess(exit), true);
    assert.equal(captured.length, 1);
    const { params } = captured[0];
    assert.equal(params.get("filter"), `createdTime>=${coldStartFloor}`);
    assert.equal(params.get("orderBy"), "createdTime ASC");
    assert.equal(params.get("limit"), "50");
    assert.equal(params.get("offset"), "0");
  });

  test("sends a createdTime lower bound once the cursor has advanced", async () => {
    const { run, captured } = await makeContext({ elements: [] });

    const exit = await run(
      paymentsImportSource.list({
        merchantId: MERCHANT_ID,
        startTimestamp: 1_700_000_000_000,
        limit: 50,
        offset: 0,
      }),
    );

    assert.equal(Exit.isSuccess(exit), true);
    assert.equal(captured.length, 1);
    assert.equal(
      captured[0].params.get("filter"),
      "createdTime>=1700000000000",
    );
    assert.equal(captured[0].params.get("orderBy"), "createdTime ASC");
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
  const { layer: databaseLayer } = await makeDatabaseTestContext();
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

  return { captured, run };
}

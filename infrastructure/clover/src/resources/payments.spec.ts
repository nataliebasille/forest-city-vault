import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { HttpClient, HttpClientResponse } from "@effect/platform";
import { staticClock } from "@forest-city-vault/core-clock";
import { CloverConfig } from "@forest-city-vault/core-config";
import { makeDatabaseTestContext } from "@forest-city-vault/infrastructure-database/testing";
import { Effect, Exit, Layer, Option, Redacted } from "effect";

import { MerchantNotConnectedError, resolveMerchantAccessToken } from "../auth";
import { listCloverPayments } from "./payments";

const NOW = new Date("2024-06-01T00:00:00.000Z");
const APP_ID = "test-app-id";
const MERCHANT_ID = "test-merchant-id";
const STATIC_TOKEN = "static-merchant-access-token";

const baseConfig = {
  appId: APP_ID,
  secretCode: "test-app-secret",
  webhookAuthCode: "test-auth-code",
  processorSecret: Redacted.make("test-processor-secret"),
  url: "http://clover.test",
  oauthUrl: "http://oauth.clover.test",
  tokenEncryptionKey: Redacted.make("auth-spec-encryption-key"),
  merchantId: MERCHANT_ID,
  oauthRedirectUri: "http://clover.test/api/oauth/callback",
  oauthStateSecret: Redacted.make("test-oauth-state-secret"),
} as const;

const staticTokenConfig = CloverConfig.make({
  ...baseConfig,
  merchantAccessToken: Option.some(Redacted.make(STATIC_TOKEN)),
});

const oauthOnlyConfig = CloverConfig.make({
  ...baseConfig,
  merchantAccessToken: Option.none(),
});

type CapturedRequest = { method: string; url: string; params: URLSearchParams };

describe("resolveMerchantAccessToken", () => {
  test("returns the static token for the configured merchant without an HTTP call", async () => {
    const { run, captured } = await makeContext(staticTokenConfig, {});

    const exit = await run(resolveMerchantAccessToken(MERCHANT_ID));

    assert.equal(Exit.isSuccess(exit), true);
    if (Exit.isSuccess(exit)) {
      assert.equal(Redacted.value(exit.value), STATIC_TOKEN);
    }
    // The static path never touches the OAuth token store or Clover.
    assert.equal(captured.length, 0);
  });

  test("falls back to the OAuth token store for a different merchant", async () => {
    const { run } = await makeContext(staticTokenConfig, {});

    const exit = await run(resolveMerchantAccessToken("some-other-merchant"));

    assert.equal(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit) && exit.cause._tag === "Fail") {
      assert.ok(exit.cause.error instanceof MerchantNotConnectedError);
    } else {
      assert.fail("expected a MerchantNotConnectedError failure");
    }
  });

  test("falls back to the OAuth token store when no static token is configured", async () => {
    const { run } = await makeContext(oauthOnlyConfig, {});

    const exit = await run(resolveMerchantAccessToken(MERCHANT_ID));

    assert.equal(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit) && exit.cause._tag === "Fail") {
      assert.ok(exit.cause.error instanceof MerchantNotConnectedError);
    } else {
      assert.fail("expected a MerchantNotConnectedError failure");
    }
  });
});

describe("listCloverPayments", () => {
  test("GETs the merchant payments endpoint with query params and decodes elements", async () => {
    const { run, captured } = await makeContext(staticTokenConfig, {
      elements: [
        { id: "PAY1", amount: 1200, createdTime: 1_700_000_000_000, result: "SUCCESS" },
        { id: "PAY2", amount: 3400, createdTime: 1_700_000_100_000, result: "FAIL" },
      ],
    });

    const exit = await run(
      listCloverPayments(MERCHANT_ID, {
        limit: 25,
        offset: 5,
        filter: "createdTime>=1700000000000",
      }),
    );

    assert.equal(Exit.isSuccess(exit), true);
    if (Exit.isSuccess(exit)) {
      assert.equal(exit.value.elements.length, 2);
      assert.equal(exit.value.elements[0].id, "PAY1");
      assert.equal(exit.value.elements[0].result, "SUCCESS");
      assert.equal(exit.value.elements[1].amount, 3400);
      assert.equal(exit.value.elements[1].result, "FAIL");
    }

    assert.equal(captured.length, 1);
    const { method, url, params } = captured[0];
    assert.equal(method, "GET");
    assert.equal(
      new URL(url).pathname,
      `/v3/merchants/${MERCHANT_ID}/payments`,
    );
    assert.equal(params.get("limit"), "25");
    assert.equal(params.get("offset"), "5");
    assert.equal(params.get("filter"), "createdTime>=1700000000000");
    // expand is omitted by default so a payments-only token is not rejected.
    assert.equal(params.has("expand"), false);
  });

  test("requests expand only when explicitly provided", async () => {
    const { run, captured } = await makeContext(staticTokenConfig, {
      elements: [],
    });

    const exit = await run(
      listCloverPayments(MERCHANT_ID, { expand: "lineItems" }),
    );

    assert.equal(Exit.isSuccess(exit), true);
    assert.equal(captured.length, 1);
    assert.equal(captured[0].params.get("expand"), "lineItems");
  });

  test("omits optional query params when not provided", async () => {
    const { run, captured } = await makeContext(staticTokenConfig, {
      elements: [],
    });

    const exit = await run(listCloverPayments(MERCHANT_ID));

    assert.equal(Exit.isSuccess(exit), true);
    if (Exit.isSuccess(exit)) {
      assert.equal(exit.value.elements.length, 0);
    }

    assert.equal(captured.length, 1);
    const { params } = captured[0];
    assert.equal(params.has("expand"), false);
    assert.equal(params.has("limit"), false);
    assert.equal(params.has("offset"), false);
    assert.equal(params.has("filter"), false);
  });
});

/**
 * A stub HttpClient that returns `responseBody` as JSON for any request and
 * records the method/URL it saw, so tests can assert on the outgoing GET call
 * (whose params live in the URL query string).
 */
function stubHttpClient(responseBody: unknown, captured: CapturedRequest[]) {
  const client = HttpClient.make((request) => {
    captured.push({
      method: request.method,
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

async function makeContext(config: CloverConfig, responseBody: unknown) {
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

  return { db, captured, run };
}

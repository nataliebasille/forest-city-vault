import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { HttpClient, HttpClientResponse } from "@effect/platform";
import { staticClock } from "@forest-city-vault/core-clock";
import { CloverConfig } from "@forest-city-vault/core-config";
import { makeDatabaseTestContext } from "@forest-city-vault/infrastructure-database/testing";
import { Effect, Exit, Layer, Option, Redacted } from "effect";

import { getCloverItem, listCloverItems } from "./items";

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
  tokenEncryptionKey: Redacted.make("items-spec-encryption-key"),
  merchantId: MERCHANT_ID,
  oauthRedirectUri: "http://clover.test/api/oauth/callback",
  oauthStateSecret: Redacted.make("test-oauth-state-secret"),
} as const;

const staticTokenConfig = CloverConfig.make({
  ...baseConfig,
  merchantAccessToken: Option.some(Redacted.make(STATIC_TOKEN)),
});

type CapturedRequest = { method: string; url: string; params: URLSearchParams };

describe("listCloverItems", () => {
  test("GETs the merchant items endpoint with query params and decodes elements", async () => {
    const { run, captured } = await makeContext(staticTokenConfig, {
      elements: [
        {
          id: "ITEM1",
          name: "Syrup",
          price: 1200,
          modifiedTime: 1_700_000_000_000,
          categories: { elements: [{ id: "CAT1", name: "Maple & Co." }] },
        },
        {
          id: "ITEM2",
          name: "Candle",
          price: "800",
          modifiedTime: 1_700_000_100_000,
        },
      ],
    });

    const exit = await run(
      listCloverItems(MERCHANT_ID, {
        limit: 25,
        offset: 5,
        filter: "modifiedTime>=1700000000000",
        orderBy: "modifiedTime ASC",
      }),
    );

    assert.equal(Exit.isSuccess(exit), true);
    if (Exit.isSuccess(exit)) {
      assert.equal(exit.value.elements.length, 2);
      assert.equal(exit.value.elements[0].id, "ITEM1");
      assert.equal(exit.value.elements[0].categories?.elements?.[0].id, "CAT1");
      assert.equal(
        exit.value.elements[0].categories?.elements?.[0].name,
        "Maple & Co.",
      );
      // Price arrives as a string on the second element but decodes to a number.
      assert.equal(exit.value.elements[1].price, 800);
    }

    assert.equal(captured.length, 1);
    const { method, url, params } = captured[0];
    assert.equal(method, "GET");
    assert.equal(new URL(url).pathname, `/v3/merchants/${MERCHANT_ID}/items`);
    assert.equal(params.get("limit"), "25");
    assert.equal(params.get("offset"), "5");
    assert.equal(params.get("filter"), "modifiedTime>=1700000000000");
    assert.equal(params.get("orderBy"), "modifiedTime ASC");
    // Categories are expanded by default so items map to vendors in one call.
    assert.equal(params.get("expand"), "categories");
  });

  test("expands categories by default and omits optional params", async () => {
    const { run, captured } = await makeContext(staticTokenConfig, {
      elements: [],
    });

    const exit = await run(listCloverItems(MERCHANT_ID));

    assert.equal(Exit.isSuccess(exit), true);
    assert.equal(captured.length, 1);
    const { params } = captured[0];
    assert.equal(params.get("expand"), "categories");
    assert.equal(params.has("limit"), false);
    assert.equal(params.has("offset"), false);
    assert.equal(params.has("filter"), false);
    assert.equal(params.has("orderBy"), false);
  });
});

describe("getCloverItem", () => {
  test("GETs a single item with categories expanded and decodes it", async () => {
    const { run, captured } = await makeContext(staticTokenConfig, {
      id: "ITEM1",
      name: "Syrup",
      price: 1200,
      modifiedTime: 1_700_000_000_000,
      categories: { elements: [{ id: "CAT1" }] },
    });

    const exit = await run(getCloverItem(MERCHANT_ID, "ITEM1"));

    assert.equal(Exit.isSuccess(exit), true);
    if (Exit.isSuccess(exit)) {
      assert.equal(exit.value.id, "ITEM1");
      assert.equal(exit.value.price, 1200);
      assert.equal(exit.value.categories?.elements?.[0].id, "CAT1");
    }

    assert.equal(captured.length, 1);
    const { method, url, params } = captured[0];
    assert.equal(method, "GET");
    assert.equal(
      new URL(url).pathname,
      `/v3/merchants/${MERCHANT_ID}/items/ITEM1`,
    );
    assert.equal(params.get("expand"), "categories");
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

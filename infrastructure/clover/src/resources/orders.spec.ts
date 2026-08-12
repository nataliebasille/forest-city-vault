import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { HttpClient, HttpClientResponse } from "@effect/platform";
import { staticClock } from "@forest-city-vault/core-clock";
import { CloverConfig } from "@forest-city-vault/core-config";
import { makeDatabaseTestContext } from "@forest-city-vault/infrastructure-database/testing";
import { Effect, Exit, Layer, Option, Redacted } from "effect";

import { getCloverOrder, listCloverOrders } from "./orders";

const NOW = new Date("2024-06-01T00:00:00.000Z");
const MERCHANT_ID = "test-merchant-id";
const STATIC_TOKEN = "static-merchant-access-token";

const staticTokenConfig = CloverConfig.make({
  appId: "test-app-id",
  secretCode: "test-app-secret",
  webhookAuthCode: "test-auth-code",
  processorSecret: Redacted.make("test-processor-secret"),
  url: "http://clover.test",
  oauthUrl: "http://oauth.clover.test",
  tokenEncryptionKey: Redacted.make("auth-spec-encryption-key"),
  merchantId: MERCHANT_ID,
  oauthRedirectUri: "http://clover.test/api/oauth/callback",
  oauthStateSecret: Redacted.make("test-oauth-state-secret"),
  merchantAccessToken: Option.some(Redacted.make(STATIC_TOKEN)),
});

type CapturedRequest = { method: string; url: string; params: URLSearchParams };

describe("getCloverOrder", () => {
  test("GETs the order endpoint expanding lineItems/payments and decodes elements", async () => {
    const createdTime = 1_700_000_000_000;
    const modifiedTime = 1_700_000_100_000;
    const { run, captured } = await makeContext(staticTokenConfig, {
      id: "ORDER1",
      total: "2499",
      paymentState: "PAID",
      createdTime,
      modifiedTime,
      lineItems: {
        elements: [
          {
            id: "LINE1",
            name: "Vintage denim jacket",
            // Clover returns monetary values as strings in cents.
            price: "2499",
            item: { id: "ITEM1" },
          },
        ],
      },
      payments: {
        elements: [
          {
            id: "PAY1",
            amount: "2499",
            result: "SUCCESS",
            taxAmount: "80",
            tipAmount: "0",
          },
        ],
      },
    });

    const exit = await run(getCloverOrder(MERCHANT_ID, "ORDER1"));

    assert.equal(Exit.isSuccess(exit), true);
    if (Exit.isSuccess(exit)) {
      assert.equal(exit.value.id, "ORDER1");
      const line = exit.value.lineItems?.elements?.[0];
      assert.ok(line);
      assert.equal(line.id, "LINE1");
      assert.equal(line.name, "Vintage denim jacket");
      assert.equal(line.price, 2499);
      assert.equal(line.item?.id, "ITEM1");
      assert.equal(exit.value.total, 2499);
      assert.equal(exit.value.paymentState, "PAID");
      assert.equal(exit.value.createdTime, createdTime);
      assert.equal(exit.value.modifiedTime, modifiedTime);
      assert.equal(exit.value.payments?.elements?.[0]?.id, "PAY1");
    }

    assert.equal(captured.length, 1);
    const { method, url, params } = captured[0];
    assert.equal(method, "GET");
    assert.equal(
      new URL(url).pathname,
      `/v3/merchants/${MERCHANT_ID}/orders/ORDER1`,
    );
    assert.equal(params.get("expand"), "lineItems,payments");
  });

  test("decodes an order with no line items", async () => {
    const { run } = await makeContext(staticTokenConfig, {
      id: "ORDER2",
      total: 0,
      paymentState: "OPEN",
      createdTime: 1_700_000_000_000,
      modifiedTime: 1_700_000_000_000,
    });

    const exit = await run(getCloverOrder(MERCHANT_ID, "ORDER2"));

    assert.equal(Exit.isSuccess(exit), true);
    if (Exit.isSuccess(exit)) {
      assert.equal(exit.value.id, "ORDER2");
      assert.deepEqual(exit.value.lineItems?.elements ?? [], []);
    }
  });
});

describe("listCloverOrders", () => {
  test("GETs the merchant orders endpoint with query params and decodes elements", async () => {
    const { run, captured } = await makeContext(staticTokenConfig, {
      elements: [
        {
          id: "ORDER1",
          total: 1200,
          paymentState: "PAID",
          createdTime: 1_700_000_000_000,
          modifiedTime: 1_700_000_100_000,
          lineItems: { elements: [] },
          payments: {
            elements: [{ id: "PAY1", amount: 1200, result: "SUCCESS" }],
          },
        },
      ],
    });

    const exit = await run(
      listCloverOrders(MERCHANT_ID, {
        limit: 25,
        offset: 5,
        filter: "modifiedTime>=1700000000000",
        orderBy: "modifiedTime ASC",
      }),
    );

    assert.equal(Exit.isSuccess(exit), true);
    if (Exit.isSuccess(exit)) {
      assert.equal(exit.value.elements.length, 1);
      assert.equal(exit.value.elements[0].id, "ORDER1");
      assert.equal(exit.value.elements[0].payments?.elements?.[0]?.id, "PAY1");
    }

    assert.equal(captured.length, 1);
    const { method, url, params } = captured[0];
    assert.equal(method, "GET");
    assert.equal(new URL(url).pathname, `/v3/merchants/${MERCHANT_ID}/orders`);
    assert.equal(params.get("limit"), "25");
    assert.equal(params.get("offset"), "5");
    assert.equal(params.get("filter"), "modifiedTime>=1700000000000");
    assert.equal(params.get("orderBy"), "modifiedTime ASC");
    assert.equal(params.get("expand"), "payments,lineItems");
  });
});

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

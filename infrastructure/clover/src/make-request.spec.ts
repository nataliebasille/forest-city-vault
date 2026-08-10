import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { HttpClient, HttpClientResponse } from "@effect/platform";
import { CloverConfig } from "@forest-city-vault/core-config";
import { Effect, Exit, Layer, Option, Redacted, Schema } from "effect";

import { makeRequest } from "./make-request";

const MERCHANT_ID = "test-merchant-id";

const config = CloverConfig.make({
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
  merchantAccessToken: Option.some(Redacted.make("static-token")),
});

const ResponseSchema = Schema.Struct({ ok: Schema.Boolean });

const request = () =>
  makeRequest({
    method: "GET",
    path: "/v3/test",
    accessToken: "static-token",
    responseSchema: ResponseSchema,
  });

describe("makeRequest rate-limit handling", () => {
  test("retries a 429 that advertises Retry-After, then succeeds", async () => {
    // First call is rate limited (Retry-After: 0 keeps the test instant), the
    // retry succeeds.
    const { run, callCount } = makeContext([
      rateLimited("0"),
      ok({ ok: true }),
    ]);

    const exit = await run(request());

    assert.equal(Exit.isSuccess(exit), true);
    if (Exit.isSuccess(exit)) {
      assert.deepEqual(exit.value, { ok: true });
    }
    // One initial attempt plus one retry.
    assert.equal(callCount(), 2);
  });

  test("gives up after the retry budget and surfaces the 429 as a failure", async () => {
    // Every attempt is rate limited, so the request exhausts its retries and the
    // final 429 fails the effect.
    const { run, callCount } = makeContext(() => rateLimited("0"));

    const exit = await run(request());

    assert.equal(Exit.isFailure(exit), true);
    // Initial attempt plus MAX_RATE_LIMIT_RETRIES (3) retries.
    assert.equal(callCount(), 4);
  });

  test("does not retry a non-429 error response", async () => {
    const { run, callCount } = makeContext(() => error(500));

    const exit = await run(request());

    assert.equal(Exit.isFailure(exit), true);
    assert.equal(callCount(), 1);
  });
});

function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function rateLimited(retryAfter: string) {
  return new Response("rate limited", {
    status: 429,
    headers: { "retry-after": retryAfter },
  });
}

function error(status: number) {
  return new Response("error", { status });
}

/**
 * Builds a stub HttpClient that answers each call with the next queued response
 * (or, when given a function, a freshly produced one), so a test can drive the
 * 429 retry loop and count how many attempts the request made.
 */
function makeContext(responses: ReadonlyArray<Response> | (() => Response)) {
  let calls = 0;
  const queue = Array.isArray(responses) ? [...responses] : null;

  const client = HttpClient.make((httpRequest) => {
    calls += 1;
    const response =
      queue !== null ?
        (queue.shift() ?? new Response("exhausted", { status: 500 }))
      : (responses as () => Response)();
    return Effect.succeed(HttpClientResponse.fromWeb(httpRequest, response));
  });

  const layer = Layer.mergeAll(
    Layer.succeed(CloverConfig, config),
    Layer.succeed(HttpClient.HttpClient, client),
  );

  const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.runPromiseExit(
      effect.pipe(Effect.provide(layer)) as Effect.Effect<A, E, never>,
    );

  return { run, callCount: () => calls };
}

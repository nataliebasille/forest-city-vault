import { describe, test, mock } from "node:test";
import assert from "node:assert/strict";

import { dbSchema } from "@forest-city-vault/infrastructure-database";
import { NextRequest } from "next/server";

import { makeRouteTest } from "@/lib/testing/make-route-test";

const {
  db,
  module: { GET },
} = await makeRouteTest<{ GET: (req: NextRequest) => Promise<Response> }>(
  import.meta.url,
  "./route",
);

describe("GET /api/oauth/callback", () => {
  test("returns 400 when merchant_id is missing", async () => {
    const response = await GET(callbackRequest({ code: "abc" }));
    assert.equal(response.status, 400);
  });

  test("returns 400 when code is missing", async () => {
    const response = await GET(callbackRequest({ merchant_id: "m-1" }));
    assert.equal(response.status, 400);
  });

  test("exchanges the code and persists the merchant token", async () => {
    stubCloverToken();

    const response = await GET(
      callbackRequest({ merchant_id: "m-connected", code: "auth-code" }),
    );

    mock.restoreAll();

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      connected: true,
      merchantId: "m-connected",
    });

    const rows = await db.select().from(dbSchema.cloverMerchantTokens);
    const stored = rows.find((r) => r.merchantId === "m-connected");
    assert.ok(stored, "expected the merchant token to be persisted");
    // Only ciphertext is stored, never the plaintext token.
    assert.notEqual(stored.accessToken, "callback-access-token");
  });
});

function callbackRequest(params: Record<string, string>) {
  const url = new URL("http://localhost/api/oauth/callback");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url, { method: "GET" });
}

/** Stubs global fetch to return a Clover OAuth token response as JSON. */
function stubCloverToken() {
  const expiration = Math.floor(Date.now() / 1000) + 3600;
  mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          access_token: "callback-access-token",
          access_token_expiration: expiration,
          refresh_token: "callback-refresh-token",
          refresh_token_expiration: expiration + 3600,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  );
}

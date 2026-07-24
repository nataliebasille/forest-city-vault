import { describe, test, mock } from "node:test";
import assert from "node:assert/strict";

import { dbSchema } from "@forest-city-vault/infrastructure-database";
import { Effect } from "effect";
import { NextRequest } from "next/server";

import { makeRouteTest } from "@/lib/testing/make-route-test";
import {
  generateOAuthState,
  OAUTH_STATE_COOKIE_NAME,
} from "@/lib/integration/oauth-state";

const MERCHANT_ID = "test-merchant-id";
const APP_ID = "test-app-id";
const STATE_SECRET = "test-oauth-state-secret";
// https so the state cookie is emitted with `Secure` (production behavior).
const REDIRECT_URI = "https://localhost/api/oauth/callback";
const NOW = new Date("2024-01-01T00:00:00Z");

const {
  db,
  module: { GET },
} = await makeRouteTest<{ GET: (req: NextRequest) => Promise<Response> }>(
  import.meta.url,
  "./route",
  { oauthRedirectUri: REDIRECT_URI },
);

describe("GET /api/oauth/callback — launch", () => {
  test("valid merchant + client redirects to Clover with a bound state", async () => {
    const response = await GET(launchRequest(MERCHANT_ID, APP_ID));

    assert.equal(response.status, 302);
    const location = response.headers.get("location");
    assert.ok(location, "expected a Location header");
    const authorizeUrl = new URL(location);
    // Authorize must target the merchant-facing web host, not the API host.
    assert.equal(authorizeUrl.host, "oauth.localhost");
    assert.equal(authorizeUrl.pathname, "/oauth/v2/authorize");
    assert.equal(authorizeUrl.searchParams.get("client_id"), APP_ID);
    assert.equal(authorizeUrl.searchParams.get("response_type"), "code");
    assert.equal(authorizeUrl.searchParams.get("merchant_id"), MERCHANT_ID);
    assert.equal(authorizeUrl.searchParams.get("redirect_uri"), REDIRECT_URI);

    const state = authorizeUrl.searchParams.get("state");
    assert.ok(state && state.length > 0, "expected a non-empty state");
  });

  test("state cookie is HttpOnly, SameSite=Lax, path-scoped, Secure, short-lived", async () => {
    const response = await GET(launchRequest(MERCHANT_ID, APP_ID));
    const setCookie = response.headers.get("set-cookie");

    assert.ok(setCookie, "expected a Set-Cookie header");
    assert.match(setCookie, new RegExp(`^${OAUTH_STATE_COOKIE_NAME}=`));
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.match(setCookie, /Path=\/api\/oauth\/callback/);
    assert.match(setCookie, /Secure/);
    assert.match(setCookie, /Max-Age=600/);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });

  test("state correlation carries a short (10 min) expiration", async () => {
    const response = await GET(launchRequest(MERCHANT_ID, APP_ID));
    const payload = decodeStatePayload(response.headers.get("set-cookie"));

    assert.equal(payload.iat, NOW.getTime());
    assert.equal(payload.exp - payload.iat, 10 * 60 * 1000);
    assert.equal(payload.merchantId, MERCHANT_ID);
    assert.equal(payload.clientId, APP_ID);
    assert.equal(payload.redirectUri, REDIRECT_URI);
  });

  test("state values are unpredictable and differ across requests", async () => {
    const a = await GET(launchRequest(MERCHANT_ID, APP_ID));
    const b = await GET(launchRequest(MERCHANT_ID, APP_ID));

    const stateA = stateFrom(a);
    const stateB = stateFrom(b);
    assert.notEqual(stateA, stateB);
  });

  test("missing merchant_id is rejected without redirecting", async () => {
    const response = await GET(launchRequest(undefined, APP_ID));
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("location"), null);
  });

  test("wrong merchant_id is rejected without redirecting", async () => {
    const response = await GET(launchRequest("someone-else", APP_ID));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("location"), null);
  });

  test("missing client_id is rejected without redirecting", async () => {
    const response = await GET(launchRequest(MERCHANT_ID, undefined));
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("location"), null);
  });

  test("wrong client_id is rejected without redirecting", async () => {
    const response = await GET(launchRequest(MERCHANT_ID, "wrong-app"));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("location"), null);
  });
});

describe("GET /api/oauth/callback — callback", () => {
  test("valid state, merchant, client and code exchanges and persists the token", async () => {
    const { state, cookie } = await launchAndCapture();

    stubCloverToken();
    const response = await GET(
      callbackRequest(
        {
          code: "auth-code",
          state,
          merchant_id: MERCHANT_ID,
          client_id: APP_ID,
        },
        cookie,
      ),
    );
    mock.restoreAll();

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { connected: true });
    assert.equal(response.headers.get("cache-control"), "no-store");
    // State cookie is cleared on success.
    assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/);

    const rows = await db.select().from(dbSchema.cloverMerchantTokens);
    const stored = rows.find((r) => r.merchantId === MERCHANT_ID);
    assert.ok(stored, "expected the merchant token to be persisted");
    assert.notEqual(stored.accessToken, "callback-access-token");
  });

  test("missing state is rejected", async () => {
    const { cookie } = await craftState({});
    const response = await GET(
      callbackRequest(
        { code: "c", merchant_id: MERCHANT_ID, client_id: APP_ID },
        cookie,
      ),
    );
    assert.equal(response.status, 400);
  });

  test("malformed state cookie is rejected", async () => {
    const response = await GET(
      callbackRequest(
        { code: "c", state: "x", merchant_id: MERCHANT_ID, client_id: APP_ID },
        `${OAUTH_STATE_COOKIE_NAME}=not-a-valid-sealed-value`,
      ),
    );
    assert.equal(response.status, 400);
  });

  test("state not matching the sealed nonce is rejected", async () => {
    const { cookie } = await craftState({});
    const response = await GET(
      callbackRequest(
        {
          code: "c",
          state: "some-other-nonce",
          merchant_id: MERCHANT_ID,
          client_id: APP_ID,
        },
        cookie,
      ),
    );
    assert.equal(response.status, 400);
  });

  test("expired state is rejected", async () => {
    const { nonce, cookie } = await craftState({
      issuedAt: new Date(NOW.getTime() - 20 * 60 * 1000),
      ttlMs: 10 * 60 * 1000,
    });
    const response = await GET(
      callbackRequest(
        {
          code: "c",
          state: nonce,
          merchant_id: MERCHANT_ID,
          client_id: APP_ID,
        },
        cookie,
      ),
    );
    assert.equal(response.status, 400);
  });

  test("missing state cookie (replay after consumption) is rejected", async () => {
    const { state } = await launchAndCapture();
    // Second callback with the same state but no cookie (cleared after first).
    const response = await GET(
      callbackRequest({
        code: "c",
        state,
        merchant_id: MERCHANT_ID,
        client_id: APP_ID,
      }),
    );
    assert.equal(response.status, 400);
  });

  test("missing merchant_id is rejected", async () => {
    const { nonce, cookie } = await craftState({});
    const response = await GET(
      callbackRequest({ code: "c", state: nonce, client_id: APP_ID }, cookie),
    );
    assert.equal(response.status, 400);
  });

  test("wrong merchant_id is rejected", async () => {
    const { nonce, cookie } = await craftState({
      merchantId: "wrong-merchant",
    });
    const response = await GET(
      callbackRequest(
        {
          code: "c",
          state: nonce,
          merchant_id: "wrong-merchant",
          client_id: APP_ID,
        },
        cookie,
      ),
    );
    assert.equal(response.status, 403);
  });

  test("merchant_id differing from the state-bound merchant is rejected", async () => {
    // State bound to a rogue merchant, callback claims the allowed merchant.
    const { nonce, cookie } = await craftState({
      merchantId: "rogue-merchant",
    });
    const response = await GET(
      callbackRequest(
        {
          code: "c",
          state: nonce,
          merchant_id: MERCHANT_ID,
          client_id: APP_ID,
        },
        cookie,
      ),
    );
    assert.equal(response.status, 403);
  });

  test("missing client_id is rejected", async () => {
    const { nonce, cookie } = await craftState({});
    const response = await GET(
      callbackRequest(
        { code: "c", state: nonce, merchant_id: MERCHANT_ID },
        cookie,
      ),
    );
    assert.equal(response.status, 400);
  });

  test("wrong client_id is rejected", async () => {
    const { nonce, cookie } = await craftState({ clientId: "wrong-app" });
    const response = await GET(
      callbackRequest(
        {
          code: "c",
          state: nonce,
          merchant_id: MERCHANT_ID,
          client_id: "wrong-app",
        },
        cookie,
      ),
    );
    assert.equal(response.status, 403);
  });

  test("client_id differing from the state-bound client is rejected", async () => {
    const { nonce, cookie } = await craftState({ clientId: "other-app" });
    const response = await GET(
      callbackRequest(
        {
          code: "c",
          state: nonce,
          merchant_id: MERCHANT_ID,
          client_id: APP_ID,
        },
        cookie,
      ),
    );
    assert.equal(response.status, 403);
  });

  test("validation failure does not call Clover, does not persist tokens, and clears state", async () => {
    const before = (await db.select().from(dbSchema.cloverMerchantTokens))
      .length;
    const fetchStub = stubFetchNeverCalled();
    const response = await GET(
      callbackRequest(
        {
          code: "c",
          state: "mismatch",
          merchant_id: MERCHANT_ID,
          client_id: APP_ID,
        },
        `${OAUTH_STATE_COOKIE_NAME}=garbage`,
      ),
    );
    mock.restoreAll();

    assert.equal(response.status, 400);
    assert.equal(fetchStub.mock.callCount(), 0);
    // Cookie is cleared even on failure.
    assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/);

    // No token was persisted by this request.
    const after = (await db.select().from(dbSchema.cloverMerchantTokens))
      .length;
    assert.equal(after, before);
  });

  test("authorization code and state never appear in the response body", async () => {
    const { nonce, cookie } = await craftState({
      merchantId: "wrong-merchant",
    });
    const response = await GET(
      callbackRequest(
        {
          code: "super-secret-code",
          state: nonce,
          merchant_id: "wrong-merchant",
          client_id: APP_ID,
        },
        cookie,
      ),
    );
    const body = await response.text();
    assert.equal(body.includes("super-secret-code"), false);
    assert.equal(body.includes(nonce), false);
  });

  test("authorization code and state never appear in logs", async () => {
    const { state, cookie } = await launchAndCapture();

    stubCloverToken();
    const logs = await captureConsole(() =>
      GET(
        callbackRequest(
          {
            code: "logged-secret-code",
            state,
            merchant_id: MERCHANT_ID,
            client_id: APP_ID,
          },
          cookie,
        ),
      ),
    );
    mock.restoreAll();

    assert.equal(logs.includes("logged-secret-code"), false);
    assert.equal(logs.includes(state), false);
  });
});

function launchRequest(
  merchantId: string | undefined,
  clientId: string | undefined,
) {
  const params: Record<string, string> = {};
  if (merchantId !== undefined) params.merchant_id = merchantId;
  if (clientId !== undefined) params.client_id = clientId;
  return callbackRequest(params);
}

function callbackRequest(params: Record<string, string>, cookie?: string) {
  const url = new URL("http://localhost/api/oauth/callback");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  return new NextRequest(url, { method: "GET", headers });
}

/** Runs a launch and returns the issued `state` nonce and the state cookie. */
async function launchAndCapture() {
  const response = await GET(launchRequest(MERCHANT_ID, APP_ID));
  const state = stateFrom(response);
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "expected a Set-Cookie header");
  const cookie = setCookie.split(";")[0];
  return { state, cookie };
}

/** Seals a state cookie directly (for crafting expired/rogue/etc. states). */
async function craftState(overrides: {
  merchantId?: string;
  clientId?: string;
  redirectUri?: string;
  issuedAt?: Date;
  ttlMs?: number;
}) {
  const { nonce, cookieValue } = await Effect.runPromise(
    generateOAuthState({
      merchantId: overrides.merchantId ?? MERCHANT_ID,
      clientId: overrides.clientId ?? APP_ID,
      redirectUri: overrides.redirectUri ?? REDIRECT_URI,
      secret: STATE_SECRET,
      issuedAt: overrides.issuedAt ?? NOW,
      ttlMs: overrides.ttlMs,
    }),
  );
  return { nonce, cookie: `${OAUTH_STATE_COOKIE_NAME}=${cookieValue}` };
}

function stateFrom(response: Response): string {
  const location = response.headers.get("location");
  assert.ok(location, "expected a Location header");
  const state = new URL(location).searchParams.get("state");
  assert.ok(state, "expected a state param");
  return state;
}

function decodeStatePayload(setCookie: string | null) {
  assert.ok(setCookie, "expected a Set-Cookie header");
  const value = setCookie.split(";")[0].split("=")[1];
  const body = value.split(".")[1];
  return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
    nonce: string;
    merchantId: string;
    clientId: string;
    redirectUri: string;
    iat: number;
    exp: number;
  };
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

/** Stubs global fetch to fail the test if the token endpoint is ever called. */
function stubFetchNeverCalled() {
  return mock.method(globalThis, "fetch", async () => {
    throw new Error("fetch must not be called after a validation failure");
  });
}

/** Captures everything written to the console/stdout/stderr while `fn` runs. */
async function captureConsole(fn: () => Promise<unknown>) {
  const lines: string[] = [];
  const push = (chunk: unknown) => {
    lines.push(String(chunk));
    return true;
  };
  mock.method(process.stdout, "write", push);
  mock.method(process.stderr, "write", push);
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    mock.method(console, method, (...args: unknown[]) =>
      push(args.map((a) => String(a)).join(" ")),
    );
  }
  try {
    await fn();
  } finally {
    mock.restoreAll();
  }
  return lines.join("\n");
}

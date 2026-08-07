import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { HttpClient, HttpClientResponse } from "@effect/platform";
import { staticClock } from "@forest-city-vault/core-clock";
import { CloverConfig } from "@forest-city-vault/core-config";
import {
  CloverTokenRepository,
  dbSchema,
} from "@forest-city-vault/infrastructure-database";
import { makeDatabaseTestContext } from "@forest-city-vault/infrastructure-database/testing";
import { Effect, Exit, Layer, Logger, Redacted } from "effect";

import {
  exchangeCodeForTokens,
  getMerchantAccessToken,
  MerchantNotConnectedError,
  ReauthorizationRequiredError,
} from "./auth";
import { decryptToken, encryptToken } from "./token-crypto";

const ENCRYPTION_KEY = "auth-spec-encryption-key";
const NOW = new Date("2024-06-01T00:00:00.000Z");
const APP_ID = "test-app-id";

const config = CloverConfig.make({
  appId: APP_ID,
  secretCode: "test-app-secret",
  webhookAuthCode: "test-auth-code",
  processorSecret: Redacted.make("test-processor-secret"),
  url: "http://clover.test",
  oauthUrl: "http://oauth.clover.test",
  tokenEncryptionKey: Redacted.make(ENCRYPTION_KEY),
  merchantId: "test-merchant-id",
  oauthRedirectUri: "http://clover.test/api/oauth/callback",
  oauthStateSecret: Redacted.make("test-oauth-state-secret"),
});

type CapturedRequest = { url: string; params: URLSearchParams };

describe("getMerchantAccessToken", () => {
  test("returns the stored access token when it is still valid", async () => {
    const { db, run, captured } = await makeContext();
    await seedToken(db, {
      merchantId: "m-valid",
      accessTokenPlain: "valid-access-token",
      accessTokenExpiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
    });

    const exit = await run(getMerchantAccessToken("m-valid"));

    assert.equal(Exit.isSuccess(exit), true);
    if (Exit.isSuccess(exit)) {
      assert.equal(Redacted.value(exit.value), "valid-access-token");
    }
    // No refresh call should have been made.
    assert.equal(captured.length, 0);
  });

  test("fails with MerchantNotConnectedError when there is no token row", async () => {
    const { run } = await makeContext();

    const exit = await run(getMerchantAccessToken("m-absent"));

    assert.equal(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit) && exit.cause._tag === "Fail") {
      assert.ok(exit.cause.error instanceof MerchantNotConnectedError);
    } else {
      assert.fail("expected a MerchantNotConnectedError failure");
    }
  });

  test("refreshes an expired access token and persists the rotated pair", async () => {
    const newExpiration = Math.floor(NOW.getTime() / 1000) + 3600;
    const { db, run, captured } = await makeContext({
      access_token: "new-access-token",
      access_token_expiration: newExpiration,
      refresh_token: "new-refresh-token",
      refresh_token_expiration: newExpiration + 3600,
    });

    await seedToken(db, {
      merchantId: "m-expired",
      accessTokenPlain: "old-access-token",
      accessTokenExpiresAt: new Date(NOW.getTime() - 60 * 1000),
      refreshTokenPlain: "old-refresh-token",
      refreshTokenExpiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
    });

    const exit = await run(getMerchantAccessToken("m-expired"));

    assert.equal(Exit.isSuccess(exit), true);
    if (Exit.isSuccess(exit)) {
      assert.equal(Redacted.value(exit.value), "new-access-token");
    }

    // It hit the refresh endpoint with the stored refresh token.
    assert.equal(captured.length, 1);
    assert.ok(captured[0].url.includes("/oauth/v2/refresh"));
    assert.equal(captured[0].params.get("refresh_token"), "old-refresh-token");
    assert.equal(captured[0].params.get("client_id"), APP_ID);

    // The rotated tokens were persisted (encrypted, so decrypting is covered by
    // reading them back through the repository below).
    const rows = await db.select().from(dbSchema.cloverMerchantTokens);
    const stored = rows.find((r) => r.merchantId === "m-expired");
    assert.ok(stored);
    assert.notEqual(stored.accessToken, "new-access-token"); // stored ciphertext
    assert.equal(
      stored.accessTokenExpiresAt?.getTime(),
      newExpiration * 1000,
    );
  });

  test("fails with ReauthorizationRequiredError when the refresh token is expired", async () => {
    const { db, run } = await makeContext();
    await seedToken(db, {
      merchantId: "m-stale",
      accessTokenPlain: "old-access-token",
      accessTokenExpiresAt: new Date(NOW.getTime() - 60 * 1000),
      refreshTokenPlain: "old-refresh-token",
      refreshTokenExpiresAt: new Date(NOW.getTime() - 60 * 1000),
    });

    const exit = await run(getMerchantAccessToken("m-stale"));

    assert.equal(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit) && exit.cause._tag === "Fail") {
      assert.ok(exit.cause.error instanceof ReauthorizationRequiredError);
    } else {
      assert.fail("expected a ReauthorizationRequiredError failure");
    }
  });

  test("fails with ReauthorizationRequiredError when there is no refresh token", async () => {
    const { db, run } = await makeContext();
    await seedToken(db, {
      merchantId: "m-norefresh",
      accessTokenPlain: "old-access-token",
      accessTokenExpiresAt: new Date(NOW.getTime() - 60 * 1000),
      refreshTokenPlain: null,
    });

    const exit = await run(getMerchantAccessToken("m-norefresh"));

    assert.equal(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit) && exit.cause._tag === "Fail") {
      assert.ok(exit.cause.error instanceof ReauthorizationRequiredError);
    }
  });
});

describe("getMerchantAccessToken refresh edge cases", () => {
  test("preserves the existing refresh token when Clover omits refresh_token", async () => {
    const newExpiration = Math.floor(NOW.getTime() / 1000) + 3600;
    const priorRefreshExpiry = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
    const { db, run, captured } = await makeDynamicContext(() => ({
      // A successful refresh that rotates only the access token — Clover does not
      // always return a new refresh_token, and must never null the existing one.
      body: {
        access_token: "rotated-access-token",
        access_token_expiration: newExpiration,
      },
    }));

    await seedToken(db, {
      merchantId: "m-keep-refresh",
      accessTokenPlain: "old-access-token",
      accessTokenExpiresAt: new Date(NOW.getTime() - 60 * 1000),
      refreshTokenPlain: "keep-this-refresh-token",
      refreshTokenExpiresAt: priorRefreshExpiry,
    });

    const before = await readRow(db, "m-keep-refresh");

    const exit = await run(getMerchantAccessToken("m-keep-refresh"));

    assert.equal(Exit.isSuccess(exit), true);
    if (Exit.isSuccess(exit)) {
      assert.equal(Redacted.value(exit.value), "rotated-access-token");
    }
    assert.equal(captured.length, 1);

    const after = await readRow(db, "m-keep-refresh");
    // The stored refresh ciphertext is preserved byte-for-byte (still decrypts to
    // the original secret) and its expiration is untouched.
    assert.equal(after.refreshToken, before.refreshToken);
    assert.equal(
      after.refreshTokenExpiresAt?.getTime(),
      priorRefreshExpiry.getTime(),
    );
    const decryptedRefresh = await Effect.runPromise(
      decryptToken(ENCRYPTION_KEY, after.refreshToken!),
    );
    assert.equal(decryptedRefresh, "keep-this-refresh-token");
    // The access token was still rotated.
    assert.notEqual(after.accessToken, before.accessToken);
  });

  test("preserves the prior refresh-token expiration when Clover rotates the token but omits its expiration", async () => {
    const newExpiration = Math.floor(NOW.getTime() / 1000) + 3600;
    const priorRefreshExpiry = new Date(NOW.getTime() + 15 * 24 * 60 * 60 * 1000);
    const { db, run } = await makeDynamicContext(() => ({
      body: {
        access_token: "rotated-access-token",
        access_token_expiration: newExpiration,
        refresh_token: "rotated-refresh-token",
        // no refresh_token_expiration
      },
    }));

    await seedToken(db, {
      merchantId: "m-keep-refresh-exp",
      accessTokenPlain: "old-access-token",
      accessTokenExpiresAt: new Date(NOW.getTime() - 60 * 1000),
      refreshTokenPlain: "old-refresh-token",
      refreshTokenExpiresAt: priorRefreshExpiry,
    });

    const exit = await run(getMerchantAccessToken("m-keep-refresh-exp"));

    assert.equal(Exit.isSuccess(exit), true);

    const after = await readRow(db, "m-keep-refresh-exp");
    // The refresh token itself was rotated...
    const decryptedRefresh = await Effect.runPromise(
      decryptToken(ENCRYPTION_KEY, after.refreshToken!),
    );
    assert.equal(decryptedRefresh, "rotated-refresh-token");
    // ...but its expiration falls back to the prior value.
    assert.equal(
      after.refreshTokenExpiresAt?.getTime(),
      priorRefreshExpiry.getTime(),
    );
  });

  test("does not overwrite stored tokens when Clover returns a malformed response", async () => {
    const { db, run, captured } = await makeDynamicContext(() => ({
      // 200 OK but missing access_token -> schema decoding fails.
      body: { unexpected: "shape" },
    }));

    await seedToken(db, {
      merchantId: "m-malformed",
      accessTokenPlain: "old-access-token",
      accessTokenExpiresAt: new Date(NOW.getTime() - 60 * 1000),
      refreshTokenPlain: "old-refresh-token",
      refreshTokenExpiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
    });

    const before = await readRow(db, "m-malformed");

    const exit = await run(getMerchantAccessToken("m-malformed"));

    assert.equal(Exit.isFailure(exit), true);
    assert.equal(captured.length, 1);

    // The row is completely unchanged: no partial/overwritten token state.
    const after = await readRow(db, "m-malformed");
    assert.equal(after.accessToken, before.accessToken);
    assert.equal(
      after.accessTokenExpiresAt?.getTime(),
      before.accessTokenExpiresAt?.getTime(),
    );
    assert.equal(after.refreshToken, before.refreshToken);
    assert.equal(after.updatedAt?.getTime(), before.updatedAt?.getTime());
  });

  test("rolls back on a Clover failure and lets a later caller retry successfully", async () => {
    const newExpiration = Math.floor(NOW.getTime() / 1000) + 3600;
    const { db, run, captured } = await makeDynamicContext(({ index }) =>
      index === 0 ?
        // First attempt fails at Clover (retryable): nothing must be persisted.
        { status: 500, body: { message: "boom" } }
        // A later attempt succeeds.
      : {
          body: {
            access_token: "recovered-access-token",
            access_token_expiration: newExpiration,
            refresh_token: "recovered-refresh-token",
            refresh_token_expiration: newExpiration + 3600,
          },
        },
    );

    await seedToken(db, {
      merchantId: "m-retry",
      accessTokenPlain: "old-access-token",
      accessTokenExpiresAt: new Date(NOW.getTime() - 60 * 1000),
      refreshTokenPlain: "old-refresh-token",
      refreshTokenExpiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
    });

    const before = await readRow(db, "m-retry");

    const firstExit = await run(getMerchantAccessToken("m-retry"));
    assert.equal(Exit.isFailure(firstExit), true);

    // The failed refresh left the stored tokens untouched (transaction rolled back).
    const afterFailure = await readRow(db, "m-retry");
    assert.equal(afterFailure.accessToken, before.accessToken);

    const secondExit = await run(getMerchantAccessToken("m-retry"));
    assert.equal(Exit.isSuccess(secondExit), true);
    if (Exit.isSuccess(secondExit)) {
      assert.equal(Redacted.value(secondExit.value), "recovered-access-token");
    }
    assert.equal(captured.length, 2);
  });

  test("never writes access tokens, refresh tokens, or the client secret to the logs", async () => {
    const newExpiration = Math.floor(NOW.getTime() / 1000) + 3600;
    const { db, run, captured, logs } = await makeDynamicContext(() => ({
      body: {
        access_token: "brand-new-access-token",
        access_token_expiration: newExpiration,
        refresh_token: "brand-new-refresh-token",
        refresh_token_expiration: newExpiration + 3600,
      },
    }));

    await seedToken(db, {
      merchantId: "m-logsafe",
      accessTokenPlain: "old-secret-access-token",
      accessTokenExpiresAt: new Date(NOW.getTime() - 60 * 1000),
      refreshTokenPlain: "old-secret-refresh-token",
      refreshTokenExpiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
    });

    const before = await readRow(db, "m-logsafe");

    const exit = await run(getMerchantAccessToken("m-logsafe"));
    assert.equal(Exit.isSuccess(exit), true);
    assert.equal(captured.length, 1);

    const after = await readRow(db, "m-logsafe");
    const joined = logs.join("\n");
    // Plaintext tokens, the client secret, and the encrypted ciphertexts must
    // never appear anywhere in the structured logs.
    const forbidden = [
      "old-secret-access-token",
      "old-secret-refresh-token",
      "brand-new-access-token",
      "brand-new-refresh-token",
      "test-app-secret",
      before.accessToken,
      after.accessToken,
      after.refreshToken!,
    ];
    for (const secret of forbidden) {
      assert.equal(
        joined.includes(secret),
        false,
        `logs unexpectedly contained a secret: ${secret.slice(0, 12)}…`,
      );
    }
    // Sanity: the redacting log pipeline actually ran and logged the refresh.
    assert.ok(joined.includes("clover.auth.refresh.required"));
  });

  test("returns the stored token without refreshing when it is just outside the expiry skew", async () => {
    const { db, run, captured } = await makeDynamicContext(() => ({
      body: {},
    }));
    // Expires 1s beyond the skew window -> still considered valid.
    await seedToken(db, {
      merchantId: "m-outside-skew",
      accessTokenPlain: "still-valid-access-token",
      accessTokenExpiresAt: new Date(NOW.getTime() + 60 * 1000 + 1000),
      refreshTokenPlain: "some-refresh-token",
      refreshTokenExpiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
    });

    const exit = await run(getMerchantAccessToken("m-outside-skew"));

    assert.equal(Exit.isSuccess(exit), true);
    if (Exit.isSuccess(exit)) {
      assert.equal(Redacted.value(exit.value), "still-valid-access-token");
    }
    // Inside the skew it would refresh; outside, it must not touch Clover.
    assert.equal(captured.length, 0);
  });

  test("refreshes when the token is within the expiry skew even though it has not literally expired", async () => {
    const newExpiration = Math.floor(NOW.getTime() / 1000) + 3600;
    const { db, run, captured } = await makeDynamicContext(() => ({
      body: {
        access_token: "skew-refreshed-access-token",
        access_token_expiration: newExpiration,
        refresh_token: "skew-refreshed-refresh-token",
        refresh_token_expiration: newExpiration + 3600,
      },
    }));
    // Expires 30s from now: still in the future, but inside the 60s skew window.
    await seedToken(db, {
      merchantId: "m-inside-skew",
      accessTokenPlain: "about-to-expire-access-token",
      accessTokenExpiresAt: new Date(NOW.getTime() + 30 * 1000),
      refreshTokenPlain: "some-refresh-token",
      refreshTokenExpiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
    });

    const exit = await run(getMerchantAccessToken("m-inside-skew"));

    assert.equal(Exit.isSuccess(exit), true);
    if (Exit.isSuccess(exit)) {
      assert.equal(Redacted.value(exit.value), "skew-refreshed-access-token");
    }
    assert.equal(captured.length, 1);
  });
});

describe("exchangeCodeForTokens", () => {
  test("exchanges the code and persists the merchant's encrypted tokens", async () => {
    const expiration = Math.floor(NOW.getTime() / 1000) + 3600;
    const { db, run, captured } = await makeContext({
      access_token: "fresh-access-token",
      access_token_expiration: expiration,
      refresh_token: "fresh-refresh-token",
      refresh_token_expiration: expiration + 3600,
    });

    const exit = await run(exchangeCodeForTokens("m-new", "auth-code-123"));

    assert.equal(Exit.isSuccess(exit), true);

    // It called the token endpoint with the authorization code and secret.
    assert.equal(captured.length, 1);
    assert.ok(captured[0].url.includes("/oauth/v2/token"));
    assert.equal(captured[0].params.get("code"), "auth-code-123");
    assert.equal(captured[0].params.get("client_id"), APP_ID);
    assert.equal(captured[0].params.get("client_secret"), "test-app-secret");

    // The token is stored and can be resolved back as a valid access token.
    const resolved = await run(getMerchantAccessToken("m-new"));
    assert.equal(Exit.isSuccess(resolved), true);
    if (Exit.isSuccess(resolved)) {
      assert.equal(Redacted.value(resolved.value), "fresh-access-token");
    }

    const rows = await db.select().from(dbSchema.cloverMerchantTokens);
    assert.equal(rows.some((r) => r.merchantId === "m-new"), true);
  });
});

/**
 * A stub HttpClient that returns `responseBody` as JSON for any request and
 * records the requests it saw, so tests can assert on the outgoing OAuth call.
 * The OAuth params are sent as a JSON body, so they are read from there.
 */
function stubHttpClient(responseBody: unknown, captured: CapturedRequest[]) {
  const client = HttpClient.make((request) => {
    captured.push({
      url: request.url,
      params: bodyToParams(request.body),
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

/** Parses an HttpBody carrying a JSON object into URLSearchParams. */
function bodyToParams(body: {
  readonly _tag: string;
  readonly body?: unknown;
}): URLSearchParams {
  const params = new URLSearchParams();
  if (body._tag === "Empty") {
    return params;
  }

  const raw = body.body;
  const text =
    typeof raw === "string" ? raw
    : raw instanceof Uint8Array ? new TextDecoder().decode(raw)
    : undefined;

  if (text !== undefined) {
    const json = JSON.parse(text) as Record<string, unknown>;
    for (const [key, value] of Object.entries(json)) {
      params.set(key, String(value));
    }
  }

  return params;
}

async function makeContext(responseBody: unknown = {}) {
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

type StubResponse = { readonly status?: number; readonly body: unknown };

/**
 * A stub HttpClient whose response is computed per call by `handler`, so a test
 * can vary status/body across attempts (e.g. fail then succeed) and record the
 * requests it saw. Also captures every log line emitted while an effect runs so
 * tests can assert secrets never reach the logs.
 */
function stubHttpClientDynamic(
  handler: (call: {
    readonly index: number;
    readonly request: CapturedRequest;
  }) => StubResponse,
  captured: CapturedRequest[],
) {
  const client = HttpClient.make((request) => {
    const capturedRequest: CapturedRequest = {
      url: request.url,
      params: bodyToParams(request.body),
    };
    const index = captured.length;
    captured.push(capturedRequest);

    const { status = 200, body } = handler({
      index,
      request: capturedRequest,
    });

    return Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  return Layer.succeed(HttpClient.HttpClient, client);
}

async function makeDynamicContext(
  handler: (call: {
    readonly index: number;
    readonly request: CapturedRequest;
  }) => StubResponse,
) {
  const { layer: databaseLayer, db } = await makeDatabaseTestContext();
  const captured: CapturedRequest[] = [];
  const logs: string[] = [];

  const captureLogger = Logger.replace(
    Logger.defaultLogger,
    Logger.make((options) => {
      try {
        logs.push(
          `${JSON.stringify(options.message)} ${JSON.stringify(
            Array.from(options.annotations),
          )}`,
        );
      } catch {
        logs.push(String(options.message));
      }
    }),
  );

  const layer = Layer.mergeAll(
    Layer.succeed(CloverConfig, config),
    staticClock(NOW),
    stubHttpClientDynamic(handler, captured),
    databaseLayer,
    captureLogger,
  );

  const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.runPromiseExit(
      effect.pipe(Effect.provide(layer)) as Effect.Effect<A, E, never>,
    );

  return { db, captured, logs, run };
}

/** Reads a single merchant token row directly (test convenience). */
async function readRow(
  db: Awaited<ReturnType<typeof makeDatabaseTestContext>>["db"],
  merchantId: string,
) {
  const rows = await db.select().from(dbSchema.cloverMerchantTokens);
  const row = rows.find((r) => r.merchantId === merchantId);
  assert.ok(row, `expected a token row for ${merchantId}`);
  return row;
}

async function seedToken(
  db: Awaited<ReturnType<typeof makeDatabaseTestContext>>["db"],
  overrides: Partial<typeof dbSchema.cloverMerchantTokens.$inferInsert> & {
    merchantId: string;
    accessTokenPlain: string;
    accessTokenExpiresAt: Date | null;
    refreshTokenPlain?: string | null;
    refreshTokenExpiresAt?: Date | null;
  },
) {
  const accessToken = await Effect.runPromise(
    encryptToken(ENCRYPTION_KEY, overrides.accessTokenPlain),
  );
  const refreshToken =
    overrides.refreshTokenPlain == null ?
      null
    : await Effect.runPromise(
        encryptToken(ENCRYPTION_KEY, overrides.refreshTokenPlain),
      );

  await db.insert(dbSchema.cloverMerchantTokens).values([
    {
      merchantId: overrides.merchantId,
      appId: APP_ID,
      accessToken,
      accessTokenExpiresAt: overrides.accessTokenExpiresAt,
      refreshToken,
      refreshTokenExpiresAt: overrides.refreshTokenExpiresAt ?? null,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);
}

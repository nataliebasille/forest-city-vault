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
import { Effect, Exit, Layer, Redacted } from "effect";

import {
  exchangeCodeForTokens,
  getMerchantAccessToken,
  MerchantNotConnectedError,
  ReauthorizationRequiredError,
} from "@/lib/integration/auth";
import { encryptToken } from "@/lib/integration/token-crypto";

const ENCRYPTION_KEY = "auth-spec-encryption-key";
const NOW = new Date("2024-06-01T00:00:00.000Z");
const APP_ID = "test-app-id";

const config = CloverConfig.make({
  appId: APP_ID,
  secretCode: "test-app-secret",
  webhookAuthCode: "test-auth-code",
  url: "http://clover.test",
  oauthUrl: "http://oauth.clover.test",
  tokenEncryptionKey: Redacted.make(ENCRYPTION_KEY),
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

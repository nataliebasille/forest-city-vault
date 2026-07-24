import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { CloverConfig } from "@forest-city-vault/core-config";
import { ConfigProvider, Effect, Exit, Redacted } from "effect";

const VALID_ENV: Record<string, string> = {
  CLOVER_APP_ID: "app-id",
  CLOVER_SECRET_CODE: "app-secret",
  CLOVER_WEBHOOK_AUTH_CODE: "webhook-auth",
  CLOVER_URL: "https://apisandbox.dev.clover.com",
  CLOVER_OAUTH_URL: "https://sandbox.dev.clover.com",
  CLOVER_TOKEN_ENCRYPTION_KEY: "encryption-key",
  CLOVER_MERCHANT_ID: "merchant-id",
  CLOVER_OAUTH_STATE_SECRET: "state-secret",
  CLOVER_OAUTH_REDIRECT_URI: "http://localhost/api/oauth/callback",
};

describe("CloverConfig", () => {
  test("loads a complete sandbox configuration without real credentials", async () => {
    const exit = await loadConfig(VALID_ENV);

    assert.equal(Exit.isSuccess(exit), true);
    if (Exit.isSuccess(exit)) {
      assert.equal(exit.value.merchantId, "merchant-id");
      assert.equal(
        exit.value.oauthRedirectUri,
        "http://localhost/api/oauth/callback",
      );
      // The state secret is redacted and distinct from the encryption key.
      assert.equal(Redacted.value(exit.value.oauthStateSecret), "state-secret");
      assert.notEqual(
        Redacted.value(exit.value.oauthStateSecret),
        Redacted.value(exit.value.tokenEncryptionKey),
      );
    }
  });

  test("fails when the allowed merchant id is missing", async () => {
    const exit = await loadConfig(without("CLOVER_MERCHANT_ID"));
    assert.equal(Exit.isFailure(exit), true);
  });

  test("fails when the redirect URI is missing", async () => {
    const exit = await loadConfig(without("CLOVER_OAUTH_REDIRECT_URI"));
    assert.equal(Exit.isFailure(exit), true);
  });

  test("fails when the redirect URI is not an absolute URL", async () => {
    const exit = await loadConfig({
      ...VALID_ENV,
      CLOVER_OAUTH_REDIRECT_URI: "/api/oauth/callback",
    });
    assert.equal(Exit.isFailure(exit), true);
  });

  test("fails when the state secret is missing", async () => {
    const exit = await loadConfig(without("CLOVER_OAUTH_STATE_SECRET"));
    assert.equal(Exit.isFailure(exit), true);
  });

  test("rejects a plain http redirect URI in production", async () => {
    const exit = await loadConfig({
      ...VALID_ENV,
      NODE_ENV: "production",
      CLOVER_OAUTH_REDIRECT_URI: "http://example.com/api/oauth/callback",
    });
    assert.equal(Exit.isFailure(exit), true);
  });

  test("accepts an https redirect URI in production", async () => {
    const exit = await loadConfig({
      ...VALID_ENV,
      NODE_ENV: "production",
      CLOVER_OAUTH_REDIRECT_URI: "https://example.com/api/oauth/callback",
    });
    assert.equal(Exit.isSuccess(exit), true);
  });
});

function loadConfig(env: Record<string, string>) {
  const provider = ConfigProvider.fromMap(new Map(Object.entries(env)));
  return Effect.runPromiseExit(
    Effect.gen(function* () {
      return yield* CloverConfig;
    }).pipe(
      Effect.provide(CloverConfig.Default),
      Effect.withConfigProvider(provider),
    ),
  );
}

function without(key: string): Record<string, string> {
  const copy = { ...VALID_ENV };
  delete copy[key];
  return copy;
}

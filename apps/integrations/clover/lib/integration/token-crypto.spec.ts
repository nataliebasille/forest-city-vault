import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { Effect, Exit } from "effect";

import {
  decryptToken,
  encryptToken,
  TokenCryptoError,
} from "@/lib/integration/token-crypto";

const KEY = "unit-test-encryption-key";

describe("token-crypto", () => {
  test("round-trips a value through encrypt then decrypt", async () => {
    const plaintext = "clover-access-token-abc123";

    const encrypted = await Effect.runPromise(encryptToken(KEY, plaintext));
    const decrypted = await Effect.runPromise(decryptToken(KEY, encrypted));

    assert.equal(decrypted, plaintext);
  });

  test("ciphertext does not contain the plaintext", async () => {
    const plaintext = "super-secret-token";
    const encrypted = await Effect.runPromise(encryptToken(KEY, plaintext));

    assert.equal(encrypted.startsWith("v1."), true);
    assert.equal(encrypted.includes(plaintext), false);
  });

  test("produces a different ciphertext each time (random IV)", async () => {
    const plaintext = "same-token";
    const a = await Effect.runPromise(encryptToken(KEY, plaintext));
    const b = await Effect.runPromise(encryptToken(KEY, plaintext));

    assert.notEqual(a, b);
    assert.equal(await Effect.runPromise(decryptToken(KEY, a)), plaintext);
    assert.equal(await Effect.runPromise(decryptToken(KEY, b)), plaintext);
  });

  test("fails to decrypt with the wrong key", async () => {
    const encrypted = await Effect.runPromise(encryptToken(KEY, "value"));

    const exit = await Effect.runPromiseExit(
      decryptToken("a-different-key", encrypted),
    );

    assert.equal(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      const error = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
      assert.ok(error instanceof TokenCryptoError);
      assert.equal(error.operation, "decrypt");
    }
  });

  test("fails to decrypt tampered ciphertext", async () => {
    const encrypted = await Effect.runPromise(encryptToken(KEY, "value"));
    const parts = encrypted.split(".");
    // Flip a character in the ciphertext segment.
    parts[3] = parts[3].slice(0, -1) + (parts[3].endsWith("A") ? "B" : "A");
    const tampered = parts.join(".");

    const exit = await Effect.runPromiseExit(decryptToken(KEY, tampered));

    assert.equal(Exit.isFailure(exit), true);
  });

  test("fails to decrypt a malformed payload", async () => {
    const exit = await Effect.runPromiseExit(
      decryptToken(KEY, "not-a-valid-payload"),
    );

    assert.equal(Exit.isFailure(exit), true);
  });
});

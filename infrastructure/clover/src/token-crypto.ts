import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { Data, Effect } from "effect";

/**
 * Symmetric encryption for Clover OAuth tokens stored at rest.
 *
 * Access and refresh tokens are long-lived credentials, so they are never
 * persisted in plaintext. Each value is sealed with AES-256-GCM under a key
 * derived from `CLOVER_TOKEN_ENCRYPTION_KEY`. The 96-bit random IV and the GCM
 * auth tag are stored alongside the ciphertext in a single self-describing
 * string, so decryption needs nothing but the key and the stored value.
 *
 * Encoded format (base64url segments): `v1.<iv>.<authTag>.<ciphertext>`.
 */
const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

export class TokenCryptoError extends Data.TaggedError("TokenCryptoError")<{
  readonly operation: "encrypt" | "decrypt";
  readonly cause: unknown;
}> {}

/**
 * Derives a stable 32-byte AES key from the configured secret. Accepting an
 * arbitrary-length secret (rather than requiring exactly 32 bytes) keeps
 * configuration simple; SHA-256 spreads it to the key size the cipher needs.
 */
function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptToken(secret: string, plaintext: string) {
  return Effect.try({
    try: () => {
      const key = deriveKey(secret);
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, key, iv);
      const ciphertext = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      return [
        VERSION,
        iv.toString("base64url"),
        authTag.toString("base64url"),
        ciphertext.toString("base64url"),
      ].join(".");
    },
    catch: (cause) => new TokenCryptoError({ operation: "encrypt", cause }),
  });
}

export function decryptToken(secret: string, encoded: string) {
  return Effect.try({
    try: () => {
      const parts = encoded.split(".");
      if (parts.length !== 4 || parts[0] !== VERSION) {
        throw new Error("Malformed or unsupported encrypted token payload");
      }

      const [, ivB64, authTagB64, ciphertextB64] = parts;
      const key = deriveKey(secret);
      const decipher = createDecipheriv(
        ALGORITHM,
        key,
        Buffer.from(ivB64, "base64url"),
      );
      decipher.setAuthTag(Buffer.from(authTagB64, "base64url"));

      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(ciphertextB64, "base64url")),
        decipher.final(),
      ]);

      return plaintext.toString("utf8");
    },
    catch: (cause) => new TokenCryptoError({ operation: "decrypt", cause }),
  });
}

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Data, Effect } from "effect";

/**
 * OAuth login-CSRF protection for the Clover authorization-code flow (Option A:
 * signed HttpOnly cookie).
 *
 * When the app is launched we mint a random `nonce`, send it to Clover as the
 * `state` query parameter, and store the correlation data
 * ({@link OAuthStatePayload}) in an HMAC-sealed HttpOnly cookie. On the callback
 * we re-open the cookie, verify its signature, and require the returned `state`
 * to equal the sealed `nonce` — so only a callback for a flow this app started
 * (in this browser) is accepted.
 *
 * The cookie is the single source of truth for the flow: it is deleted after the
 * first callback (success or failure), which — together with Clover's single-use
 * authorization `code` — prevents replay.
 *
 * Sealed format (base64url segments): `v1.<payload>.<hmac>` where `hmac =
 * HMAC-SHA256(payload)` under `CLOVER_OAUTH_STATE_SECRET`. Only integrity is
 * needed (no secrecy): the payload binds public identifiers, so it is signed,
 * not encrypted.
 */
const VERSION = "v1";

/** Cookie name for the sealed OAuth state. */
export const OAUTH_STATE_COOKIE_NAME = "clover_oauth_state";

/**
 * Cookie path — scoped narrowly to the OAuth callback so the state cookie is
 * only ever sent to the one route that consumes it.
 */
export const OAUTH_STATE_COOKIE_PATH = "/api/oauth/callback";

/** State lifetime: long enough to authorize, short enough to limit exposure. */
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

/** Data bound to an OAuth state and sealed into the cookie. */
export type OAuthStatePayload = {
  readonly nonce: string;
  readonly merchantId: string;
  readonly clientId: string;
  readonly redirectUri: string;
  /** Issued-at, epoch ms. */
  readonly iat: number;
  /** Expiration, epoch ms. */
  readonly exp: number;
};

/**
 * The state cookie could not be opened into trusted correlation data. `reason`
 * is a safe failure category for structured logs — it never carries the raw
 * cookie, state, or secret.
 */
export class OAuthStateError extends Data.TaggedError("OAuthStateError")<{
  readonly reason: "invalid_state" | "expired_state";
}> {}

/**
 * Mints a fresh OAuth state: a cryptographically random nonce plus the sealed
 * cookie value binding it to the initiating merchant/client, the configured
 * redirect URI, and issued/expiry timestamps.
 *
 * `issuedAt` is passed in (not read from a clock service) so callers control the
 * time source and tests can produce already-expired states deterministically.
 */
export function generateOAuthState(input: {
  readonly merchantId: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly secret: string;
  readonly issuedAt: Date;
  readonly ttlMs?: number;
}) {
  return Effect.sync(() => {
    const nonce = randomBytes(32).toString("base64url");
    const iat = input.issuedAt.getTime();
    const exp = iat + (input.ttlMs ?? OAUTH_STATE_TTL_MS);

    const payload: OAuthStatePayload = {
      nonce,
      merchantId: input.merchantId,
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      iat,
      exp,
    };

    return { nonce, payload, cookieValue: seal(payload, input.secret) };
  });
}

/**
 * Opens and verifies a sealed state cookie, returning the trusted payload.
 * Fails with {@link OAuthStateError} (`invalid_state`) when the cookie is
 * missing, malformed, or its signature does not verify. Expiry, nonce, merchant,
 * client and redirect-URI binding are checked by the caller against the callback
 * parameters and configuration.
 */
export function openOAuthState(input: {
  readonly cookieValue: string | undefined;
  readonly secret: string;
}) {
  return Effect.gen(function* () {
    const cookieValue = input.cookieValue;
    if (!cookieValue) {
      return yield* Effect.fail(
        new OAuthStateError({ reason: "invalid_state" }),
      );
    }

    const parts = cookieValue.split(".");
    if (parts.length !== 3 || parts[0] !== VERSION) {
      return yield* Effect.fail(
        new OAuthStateError({ reason: "invalid_state" }),
      );
    }

    const [, body, signature] = parts;
    if (!safeEqual(signature, sign(body, input.secret))) {
      return yield* Effect.fail(
        new OAuthStateError({ reason: "invalid_state" }),
      );
    }

    const payload = decodePayload(body);
    if (payload === null) {
      return yield* Effect.fail(
        new OAuthStateError({ reason: "invalid_state" }),
      );
    }

    return payload;
  });
}

/**
 * Constant-time string comparison (used for signature and nonce checks). Returns
 * false on any length mismatch without leaking timing information.
 */
export function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }
  return timingSafeEqual(aBuffer, bBuffer);
}

function seal(payload: OAuthStatePayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return [VERSION, body, sign(body, secret)].join(".");
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function decodePayload(body: string): OAuthStatePayload | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as Record<string, unknown>;

    if (
      typeof parsed.nonce === "string" &&
      typeof parsed.merchantId === "string" &&
      typeof parsed.clientId === "string" &&
      typeof parsed.redirectUri === "string" &&
      typeof parsed.iat === "number" &&
      typeof parsed.exp === "number"
    ) {
      return parsed as OAuthStatePayload;
    }

    return null;
  } catch {
    return null;
  }
}

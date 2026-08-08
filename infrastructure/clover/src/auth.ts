import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "@effect/platform";
import { now } from "@forest-city-vault/core-clock";
import { CloverConfig } from "@forest-city-vault/core-config";
import {
  type CloverMerchantTokenRow,
  CloverTokenRepository,
  withMerchantTokenRefreshLock,
} from "@forest-city-vault/infrastructure-database";
import { Data, Duration, Effect, Option, Redacted, Schema } from "effect";
import { decryptToken, encryptToken } from "./token-crypto";

/**
 * Clover OAuth v2 auth-code flow, per merchant.
 *
 * Clover issues an **expiring** `access_token` / `refresh_token` pair per
 * merchant when the merchant authorizes the app (the single-use `code` is
 * exchanged once, in the OAuth callback). Tokens are persisted encrypted and
 * refreshed on demand here — there is no single global token.
 *
 * Endpoints (base URL from `CLOVER_URL`):
 * - `POST /oauth/v2/token`   — exchange an authorization `code` for tokens.
 * - `POST /oauth/v2/refresh` — exchange a `refresh_token` for new tokens.
 *
 * Both endpoints expect the parameters as a JSON request body (Clover rejects a
 * query-string/form-encoded body with `415 Unsupported Media Type`).
 */

/** Refresh this many milliseconds before the access token actually expires. */
const EXPIRY_SKEW_MS = 60_000;

/**
 * How long a caller will wait for another instance's in-flight refresh of the
 * same merchant before giving up with a retryable
 * `MerchantTokenRefreshLockTimeoutError`. Comfortably longer than a Clover
 * refresh round-trip so contended callers normally wait and reuse the refreshed
 * token rather than timing out.
 */
const REFRESH_LOCK_TIMEOUT_MS = 10_000;

/**
 * Upper bound on a single Clover OAuth token HTTP request (exchange or refresh).
 *
 * A refresh runs while the per-merchant advisory lock (and its database
 * connection) is held, so a hung Clover request must not pin the lock forever.
 * This is set **below** {@link REFRESH_LOCK_TIMEOUT_MS} so a stuck refresh aborts
 * and releases the lock before other callers waiting on that lock give up — they
 * then acquire it and see a still-expired token to retry, rather than all timing
 * out. A timeout is a retryable {@link CloverRequestTimeoutError}, never a
 * reauthorization signal.
 */
const CLOVER_REQUEST_TIMEOUT_MS = 8_000;

const CloverTokenResponseSchema = Schema.Struct({
  access_token: Schema.String,
  // Unix seconds. Absent on non-expiring/legacy responses.
  access_token_expiration: Schema.optional(Schema.Number),
  refresh_token: Schema.optional(Schema.String),
  refresh_token_expiration: Schema.optional(Schema.Number),
});

type CloverTokenResponse = typeof CloverTokenResponseSchema.Type;

/**
 * The merchant has no stored token — they have not installed/authorized the app
 * (or their record was removed). Terminal: retrying the same payment without a
 * (re)authorization will never succeed.
 */
export class MerchantNotConnectedError extends Data.TaggedError(
  "MerchantNotConnectedError",
)<{
  readonly merchantId: string;
}> {}

/**
 * The access token is expired and cannot be refreshed (no refresh token, or the
 * refresh token itself has expired). Terminal: the merchant must re-authorize
 * via the OAuth flow. Kept distinct from {@link MerchantNotConnectedError} so
 * logs/metrics can tell "never connected" from "connection went stale".
 */
export class ReauthorizationRequiredError extends Data.TaggedError(
  "ReauthorizationRequiredError",
)<{
  readonly merchantId: string;
}> {}

/**
 * A Clover OAuth token request (exchange or refresh) exceeded
 * {@link CLOVER_REQUEST_TIMEOUT_MS}. Retryable: the network/Clover was slow, the
 * merchant is still connected, and (for a refresh) the lock has been released so
 * a retry can proceed. Never conflated with {@link ReauthorizationRequiredError}.
 */
export class CloverRequestTimeoutError extends Data.TaggedError(
  "CloverRequestTimeoutError",
)<{
  readonly endpoint: string;
}> {}

function toSafeErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  if (typeof error === "object" && error !== null && "_tag" in error) {
    return {
      tag: String((error as { _tag?: unknown })._tag),
    };
  }

  return {
    type: typeof error,
  };
}

function unixSecondsToDate(seconds: number | undefined): Date | null {
  return seconds === undefined ? null : new Date(seconds * 1000);
}

/**
 * POSTs to a Clover OAuth v2 endpoint with the given params as a JSON body and
 * decodes the token response. Shared by the code-exchange and refresh flows.
 *
 * The params must go in the JSON body: Clover's auth-token service rejects a
 * form-encoded/query-string body with `415 Unsupported Media Type`.
 */
function requestTokens(
  endpoint: "/oauth/v2/token" | "/oauth/v2/refresh",
  params: Record<string, string>,
  logContext: Record<string, unknown>,
) {
  return Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const { url: baseUrl } = yield* CloverConfig;

    yield* Effect.logInfo("clover.auth.token.request.begin", {
      workflowStage: "send_request",
      endpoint,
      ...logContext,
    });

    const request = yield* HttpClientRequest.post(
      new URL(endpoint, baseUrl),
    ).pipe(HttpClientRequest.acceptJson, HttpClientRequest.bodyJson(params));

    const response = yield* client.execute(request);

    yield* Effect.logInfo("clover.auth.token.request.received_response", {
      workflowStage: "receive_response",
      endpoint,
      status: response.status,
      ...logContext,
    });

    const okResponse = yield* HttpClientResponse.filterStatusOk(response);
    const body = yield* HttpClientResponse.schemaBodyJson(
      CloverTokenResponseSchema,
      { errors: "all" },
    )(okResponse);

    yield* Effect.logInfo("clover.auth.token.request.completed", {
      workflowStage: "decode_response",
      endpoint,
      status: okResponse.status,
      ...logContext,
    });

    return body;
  }).pipe(
    Effect.timeoutFail({
      duration: Duration.millis(CLOVER_REQUEST_TIMEOUT_MS),
      onTimeout: () => new CloverRequestTimeoutError({ endpoint }),
    }),
    Effect.tapError((error) =>
      Effect.logWarning("clover.auth.token.request.failed", {
        workflowStage: "failed",
        endpoint,
        failureDisposition: "retryable",
        ...logContext,
        error: toSafeErrorDetails(error),
      }),
    ),
  );
}

/**
 * Builds the Clover OAuth v2 authorize URL to which the merchant is redirected.
 * Clover shows the merchant the authorization screen and then redirects back to
 * the configured callback URL with a single-use `code`.
 *
 * The authorize endpoint lives on Clover's **merchant-facing web host**
 * (`CLOVER_OAUTH_URL`, e.g. `sandbox.dev.clover.com`), which is a different host
 * from the API host used for token exchange/refresh (`CLOVER_URL`, e.g.
 * `apisandbox.dev.clover.com`). Sending the merchant to the API host instead
 * bounces them back to login in a loop.
 *
 * Every security-sensitive parameter comes from validated configuration, never
 * from the caller: `client_id` (`CLOVER_APP_ID`), `merchant_id`
 * (`CLOVER_MERCHANT_ID`) and `redirect_uri` (`CLOVER_OAUTH_REDIRECT_URI`).
 * Only the CSRF `state` nonce — generated per request — is passed in.
 */
export function buildAuthorizeUrl(state: string) {
  return Effect.gen(function* () {
    const { appId, oauthUrl, merchantId, oauthRedirectUri } =
      yield* CloverConfig;

    const authorizeUrl = new URL("/oauth/v2/authorize", oauthUrl);
    authorizeUrl.searchParams.set("client_id", appId);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("merchant_id", merchantId);
    authorizeUrl.searchParams.set("redirect_uri", oauthRedirectUri);
    authorizeUrl.searchParams.set("state", state);

    return authorizeUrl.toString();
  });
}

/**
 * Exchanges a single-use authorization `code` for a merchant's token pair and
 * persists it (encrypted). Called from the OAuth callback route at install time.
 */
export function exchangeCodeForTokens(merchantId: string, code: string) {
  return Effect.gen(function* () {
    const { appId, secretCode } = yield* CloverConfig;

    const tokens = yield* requestTokens(
      "/oauth/v2/token",
      { client_id: appId, client_secret: secretCode, code },
      { merchantId },
    );

    yield* persistTokens(merchantId, tokens);

    return tokens;
  });
}

/**
 * Yields a valid, decrypted access token for the merchant, preferring a
 * statically configured token over the OAuth token store.
 *
 * When `CLOVER_MERCHANT_ACCESS_TOKEN` is configured **and** the requested
 * merchant is the single configured merchant (`CLOVER_MERCHANT_ID`), that static
 * token is returned directly — no database read, no refresh. This is the path
 * used to talk to the Clover API directly with a token issued outside the OAuth
 * app flow (e.g. a test merchant). For any other merchant, or when no static
 * token is configured, this falls back to the per-merchant OAuth token store via
 * {@link getMerchantAccessToken}.
 */
export function resolveMerchantAccessToken(
  merchantId: string,
  options?: { readonly lockTimeoutMs?: number },
) {
  return Effect.gen(function* () {
    const { merchantId: configuredMerchantId, merchantAccessToken } =
      yield* CloverConfig;

    if (
      Option.isSome(merchantAccessToken) &&
      merchantId === configuredMerchantId
    ) {
      yield* Effect.logInfo("clover.auth.static_token.used", {
        workflowStage: "resolve_token",
        merchantId,
        tokenSource: "static",
      });
      return merchantAccessToken.value;
    }

    return yield* getMerchantAccessToken(merchantId, options);
  });
}

/**
 * Yields a valid, decrypted access token for the merchant, refreshing it first
 * when it is expired (or about to expire). Fails terminally when the merchant is
 * not connected or must re-authorize.
 *
 * A refresh is serialized per merchant through a database advisory lock (see
 * {@link withMerchantTokenRefreshLock}), so two concurrent callers for the same
 * merchant never refresh with the same (possibly single-use) refresh token: the
 * first refreshes, and the second waits, rereads and reuses the rotated token.
 * A valid token is returned without ever taking the lock.
 *
 * `options.lockTimeoutMs` overrides how long a contended caller waits for the
 * refresh lock; it exists mainly so tests can force a fast lock-timeout.
 */
export function getMerchantAccessToken(
  merchantId: string,
  options?: { readonly lockTimeoutMs?: number },
) {
  return Effect.gen(function* () {
    const row = yield* readMerchantTokenRow(merchantId);
    const nowDate = yield* now;

    if (!isExpired(row.accessTokenExpiresAt, nowDate)) {
      return yield* decryptAccessToken(row.accessToken);
    }

    yield* Effect.logInfo("clover.auth.refresh.required", {
      workflowStage: "refresh_required",
      merchantId,
    });

    return yield* withMerchantTokenRefreshLock(
      merchantId,
      refreshMerchantTokenUnderLock(merchantId),
      { lockTimeoutMs: options?.lockTimeoutMs ?? REFRESH_LOCK_TIMEOUT_MS },
    );
  });
}

/** Reads the merchant's token row, failing when the merchant is not connected. */
function readMerchantTokenRow(merchantId: string) {
  return Effect.flatMap(
    CloverTokenRepository.getByMerchantId(merchantId),
    Option.match({
      onNone: () => Effect.fail(new MerchantNotConnectedError({ merchantId })),
      onSome: (value: CloverMerchantTokenRow) => Effect.succeed(value),
    }),
  );
}

/** Decrypts a stored access token into a redacted value. */
function decryptAccessToken(encryptedAccessToken: string) {
  return Effect.gen(function* () {
    const { tokenEncryptionKey } = yield* CloverConfig;
    const accessToken = yield* decryptToken(
      Redacted.value(tokenEncryptionKey),
      encryptedAccessToken,
    );
    return Redacted.make(accessToken);
  });
}

function isExpired(expiresAt: Date | null, nowDate: Date): boolean {
  // A null expiry means the token does not expire (legacy/non-expiring token).
  if (expiresAt === null) {
    return false;
  }
  return expiresAt.getTime() - EXPIRY_SKEW_MS <= nowDate.getTime();
}

/**
 * The refresh critical section, run **inside** the per-merchant advisory lock
 * (its {@link Database} is the lock's transaction, so the reread and the write
 * below happen on the same locked connection).
 *
 * It mandatorily *rereads* the row after the lock is held before doing anything
 * else: a concurrent caller may already have refreshed the token while we waited
 * for the lock, in which case we simply return the fresh token without calling
 * Clover — and, crucially, without wrongly deciding reauthorization is required
 * from a stale view of the row.
 */
function refreshMerchantTokenUnderLock(merchantId: string) {
  return Effect.gen(function* () {
    const row = yield* readMerchantTokenRow(merchantId);
    const nowDate = yield* now;

    yield* Effect.logInfo("clover.auth.refresh.token_reread", {
      workflowStage: "reread_after_lock",
      merchantId,
      accessTokenExpired: isExpired(row.accessTokenExpiresAt, nowDate),
    });

    // Another caller refreshed while we waited for the lock: reuse their token.
    if (!isExpired(row.accessTokenExpiresAt, nowDate)) {
      yield* Effect.logInfo("clover.auth.refresh.skipped", {
        workflowStage: "refresh_skipped",
        merchantId,
        refreshSkipped: true,
      });
      return yield* decryptAccessToken(row.accessToken);
    }

    // Genuinely still expired: a usable refresh token is required to continue.
    if (
      row.refreshToken === null ||
      isExpired(row.refreshTokenExpiresAt, nowDate)
    ) {
      yield* Effect.logWarning("clover.auth.refresh.reauthorization_required", {
        workflowStage: "reauthorization_required",
        merchantId,
        hasRefreshToken: row.refreshToken !== null,
      });
      return yield* Effect.fail(
        new ReauthorizationRequiredError({ merchantId }),
      );
    }

    const { appId, tokenEncryptionKey } = yield* CloverConfig;
    const refreshToken = yield* decryptToken(
      Redacted.value(tokenEncryptionKey),
      row.refreshToken,
    );

    const tokens = yield* requestTokens(
      "/oauth/v2/refresh",
      { client_id: appId, refresh_token: refreshToken },
      { merchantId },
    );

    yield* persistTokens(merchantId, tokens, row);

    yield* Effect.logInfo("clover.auth.refresh.persisted", {
      workflowStage: "tokens_persisted",
      merchantId,
      rotatedRefreshToken: tokens.refresh_token !== undefined,
    });

    return Redacted.make(tokens.access_token);
  });
}

/**
 * Encrypts and upserts a merchant's tokens.
 *
 * When `previous` is supplied (a refresh, not a first-time exchange) and Clover's
 * response omits fields, the prior values are preserved rather than nulled:
 * - a missing `refresh_token` keeps the existing (still-valid) refresh token —
 *   Clover does not always rotate it, and discarding it would strand the
 *   merchant; and
 * - a missing `refresh_token_expiration` keeps the prior expiration.
 * The original `createdAt` is preserved (the upsert only touches token columns on
 * conflict) and `updatedAt` is bumped.
 */
function persistTokens(
  merchantId: string,
  tokens: CloverTokenResponse,
  previous?: CloverMerchantTokenRow,
) {
  return Effect.gen(function* () {
    const { appId, tokenEncryptionKey } = yield* CloverConfig;
    const encryptionKey = Redacted.value(tokenEncryptionKey);
    const nowDate = yield* now;

    const encryptedAccessToken = yield* encryptToken(
      encryptionKey,
      tokens.access_token,
    );

    const encryptedRefreshToken =
      tokens.refresh_token !== undefined ?
        yield* encryptToken(encryptionKey, tokens.refresh_token)
        // Preserve the existing refresh token when Clover did not rotate it.
      : (previous?.refreshToken ?? null);

    const refreshTokenExpiresAt =
      tokens.refresh_token_expiration !== undefined ?
        unixSecondsToDate(tokens.refresh_token_expiration)
        // Preserve the prior expiration when no replacement was supplied.
      : (previous?.refreshTokenExpiresAt ?? null);

    yield* CloverTokenRepository.upsert({
      merchantId,
      appId,
      accessToken: encryptedAccessToken,
      accessTokenExpiresAt: unixSecondsToDate(tokens.access_token_expiration),
      refreshToken: encryptedRefreshToken,
      refreshTokenExpiresAt,
      createdAt: previous?.createdAt ?? nowDate,
      updatedAt: nowDate,
    });
  });
}

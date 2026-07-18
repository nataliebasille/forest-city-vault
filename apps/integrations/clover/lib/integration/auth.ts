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
} from "@forest-city-vault/infrastructure-database";
import { Data, Effect, Option, Redacted, Schema } from "effect";
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
 * Builds the Clover OAuth v2 authorize URL to which an unauthorized merchant is
 * redirected. Clover shows the merchant the authorization screen and then
 * redirects back to the app's Site URL with a single-use `code`.
 *
 * The authorize endpoint lives on Clover's **merchant-facing web host**
 * (`CLOVER_OAUTH_URL`, e.g. `sandbox.dev.clover.com`), which is a different host
 * from the API host used for token exchange/refresh (`CLOVER_URL`, e.g.
 * `apisandbox.dev.clover.com`). Sending the merchant to the API host instead
 * bounces them back to login in a loop.
 *
 * `merchantId` is optional: Clover includes it on the redirect back regardless,
 * but passing it here lets Clover skip merchant selection when it is known.
 */
export function buildAuthorizeUrl(merchantId?: string) {
  return Effect.gen(function* () {
    const { appId, oauthUrl } = yield* CloverConfig;

    const authorizeUrl = new URL("/oauth/v2/authorize", oauthUrl);
    authorizeUrl.searchParams.set("client_id", appId);
    authorizeUrl.searchParams.set("response_type", "code");
    if (merchantId) {
      authorizeUrl.searchParams.set("merchant_id", merchantId);
    }

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
 * Yields a valid, decrypted access token for the merchant, refreshing it first
 * when it is expired (or about to expire). Fails terminally when the merchant is
 * not connected or must re-authorize.
 */
export function getMerchantAccessToken(merchantId: string) {
  return Effect.gen(function* () {
    const row = yield* Option.match(
      yield* CloverTokenRepository.getByMerchantId(merchantId),
      {
        onNone: () =>
          Effect.fail(new MerchantNotConnectedError({ merchantId })),
        onSome: (value: CloverMerchantTokenRow) => Effect.succeed(value),
      },
    );

    const nowDate = yield* now;

    if (!isExpired(row.accessTokenExpiresAt, nowDate)) {
      const { tokenEncryptionKey } = yield* CloverConfig;
      const accessToken = yield* decryptToken(
        Redacted.value(tokenEncryptionKey),
        row.accessToken,
      );
      return Redacted.make(accessToken);
    }

    return yield* refreshMerchantToken(merchantId, row, nowDate);
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
 * Refreshes an expired access token using the stored refresh token, persists the
 * rotated pair, and returns the new access token. Fails terminally when no
 * usable refresh token is available.
 */
function refreshMerchantToken(
  merchantId: string,
  row: CloverMerchantTokenRow,
  nowDate: Date,
) {
  return Effect.gen(function* () {
    if (
      row.refreshToken === null ||
      isExpired(row.refreshTokenExpiresAt, nowDate)
    ) {
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

    yield* persistTokens(merchantId, tokens);

    return Redacted.make(tokens.access_token);
  });
}

/** Encrypts and upserts a merchant's tokens. */
function persistTokens(merchantId: string, tokens: CloverTokenResponse) {
  return Effect.gen(function* () {
    const { appId, tokenEncryptionKey } = yield* CloverConfig;
    const encryptionKey = Redacted.value(tokenEncryptionKey);
    const nowDate = yield* now;

    const encryptedAccessToken = yield* encryptToken(
      encryptionKey,
      tokens.access_token,
    );
    const encryptedRefreshToken =
      tokens.refresh_token === undefined ?
        null
      : yield* encryptToken(encryptionKey, tokens.refresh_token);

    yield* CloverTokenRepository.upsert({
      merchantId,
      appId,
      accessToken: encryptedAccessToken,
      accessTokenExpiresAt: unixSecondsToDate(tokens.access_token_expiration),
      refreshToken: encryptedRefreshToken,
      refreshTokenExpiresAt: unixSecondsToDate(tokens.refresh_token_expiration),
      createdAt: nowDate,
      updatedAt: nowDate,
    });
  });
}

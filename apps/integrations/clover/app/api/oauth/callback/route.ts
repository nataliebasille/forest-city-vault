import { RequestTrace } from "@/lib/runtime/middleware/request-trace";
import { route } from "@/runtime";
import {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  generateOAuthState,
  OAUTH_STATE_COOKIE_NAME,
  OAUTH_STATE_COOKIE_PATH,
  OAUTH_STATE_TTL_MS,
  openOAuthState,
  safeEqual,
} from "@forest-city-vault/infrastructure-clover";
import { now } from "@forest-city-vault/core-clock";
import { CloverConfig } from "@forest-city-vault/core-config";
import {
  badRequest,
  Cookies,
  forbidden,
  ok,
  redirect,
  setResponseHeader,
} from "@forest-city-vault/platform-nextjs-effect";
import { Effect, Redacted } from "effect";
import { NextRequest } from "next/server";

/**
 * Clover OAuth callback — also the app's Site URL, so Clover lands the merchant
 * here both when launching the app and after authorization. The two cases are
 * distinguished by the presence of a single-use `code`:
 *
 * - **No `code` (app launch):** Clover sends `merchant_id` and `client_id`. We
 *   validate both against configuration, mint a CSRF `state` (a random nonce
 *   sealed into an HttpOnly cookie), and redirect to Clover's
 *   `/oauth/v2/authorize` endpoint. Clover redirects back here *with* a `code`.
 * - **`code` present (authorization return):** we re-open the sealed state
 *   cookie and fully validate the callback (state, expiry, merchant, client,
 *   redirect URI) *before* exchanging the single-use code for the merchant's
 *   token pair and persisting it (encrypted).
 *
 * The state cookie is deleted on both success and failure of the callback, so
 * (together with Clover's single-use `code`) a callback cannot be replayed.
 *
 * Never logged or returned: the authorization code, the state value/nonce, the
 * state secret, and the resulting tokens.
 *
 * Runs on the default `route` factory, so the token upsert commits inside the
 * request's transaction.
 */
const handler = (request: NextRequest) =>
  Effect.gen(function* () {
    const params = request.nextUrl.searchParams;
    const code = params.get("code");

    if (!code) {
      return yield* handleLaunch(params);
    }

    return yield* handleCallback(code, params);
  });

export const GET = route(handler);

/**
 * App-launch leg (no `code`). Validates the launching merchant/client against
 * configuration, then issues a sealed CSRF state cookie and redirects to Clover.
 */
function handleLaunch(params: URLSearchParams) {
  return Effect.gen(function* () {
    const { requestId } = yield* RequestTrace;
    const config = yield* CloverConfig;

    const merchantId = params.get("merchant_id");
    const clientId = params.get("client_id");

    yield* Effect.logInfo("clover.oauth.launch.received", {
      requestId,
      workflowStage: "authorize_launch",
      merchantIdPresent: Boolean(merchantId),
      clientIdPresent: Boolean(clientId),
    });

    if (!merchantId || !clientId) {
      yield* logRejected(requestId, "authorize_launch", "missing_parameter");
      return yield* badRequest("Invalid launch request");
    }

    if (merchantId !== config.merchantId) {
      yield* logRejected(requestId, "authorize_launch", "merchant_not_allowed");
      return yield* forbidden("Merchant not allowed");
    }

    if (clientId !== config.appId) {
      yield* logRejected(requestId, "authorize_launch", "invalid_client");
      return yield* forbidden("Invalid client");
    }

    const issuedAt = yield* now;
    const { nonce, cookieValue } = yield* generateOAuthState({
      merchantId,
      clientId,
      redirectUri: config.oauthRedirectUri,
      secret: Redacted.value(config.oauthStateSecret),
      issuedAt,
    });

    yield* Effect.logInfo("clover.oauth.state.generated", {
      requestId,
      workflowStage: "authorize_launch",
      stateTtlMs: OAUTH_STATE_TTL_MS,
    });

    const authorizeUrl = yield* buildAuthorizeUrl(nonce);

    yield* Effect.logInfo("clover.oauth.launch.redirect_issued", {
      requestId,
      workflowStage: "request_authorization",
    });

    yield* setResponseHeader(
      "Set-Cookie",
      setStateCookie(cookieValue, config.oauthRedirectUri),
    );
    yield* setResponseHeader("Cache-Control", "no-store");

    return yield* redirect(authorizeUrl);
  });
}

/**
 * Authorization-return leg (`code` present). Fully validates the callback
 * against the sealed state cookie and configuration before exchanging the code.
 * The state cookie is cleared on every response, success or failure.
 */
function handleCallback(code: string, params: URLSearchParams) {
  return Effect.gen(function* () {
    const { requestId } = yield* RequestTrace;
    const config = yield* CloverConfig;

    // The state cookie is single-use: clear it (and forbid caching) on *every*
    // callback response — success or failure — so it cannot be replayed. Queued
    // once here; `defineRoute` appends it to whichever Response we return.
    yield* setResponseHeader(
      "Set-Cookie",
      clearStateCookie(config.oauthRedirectUri),
    );
    yield* setResponseHeader("Cache-Control", "no-store");

    const reject = (
      status: "bad_request" | "forbidden",
      failureTag: string,
      stage: string,
      message: string,
    ) =>
      Effect.gen(function* () {
        yield* logRejected(requestId, stage, failureTag);
        return yield* (status === "forbidden" ? forbidden : badRequest)(
          message,
        );
      });

    const state = params.get("state");
    const merchantId = params.get("merchant_id");
    const clientId = params.get("client_id");

    yield* Effect.logInfo("clover.oauth.callback.received", {
      requestId,
      workflowStage: "authorize_callback",
      codePresent: true,
      statePresent: Boolean(state),
      merchantIdPresent: Boolean(merchantId),
      clientIdPresent: Boolean(clientId),
    });

    if (!state || !merchantId || !clientId) {
      return yield* reject(
        "bad_request",
        "missing_parameter",
        "authorize_callback",
        "Invalid callback request",
      );
    }

    // Re-open the sealed state cookie. Missing/malformed/tampered -> invalid.
    const cookies = yield* Cookies;
    const cookieValue = cookies.get(OAUTH_STATE_COOKIE_NAME)?.value;
    const stateResult = yield* Effect.either(
      openOAuthState({
        cookieValue,
        secret: Redacted.value(config.oauthStateSecret),
      }),
    );

    if (stateResult._tag === "Left") {
      return yield* reject(
        "bad_request",
        stateResult.left.reason,
        "validate_state",
        "Invalid state",
      );
    }

    const bound = stateResult.right;
    const nowDate = yield* now;

    // 1. State not expired.
    if (bound.exp <= nowDate.getTime()) {
      return yield* reject(
        "bad_request",
        "expired_state",
        "validate_state",
        "Invalid state",
      );
    }

    // 2. Returned `state` equals the sealed nonce (CSRF / substitution guard).
    if (!safeEqual(state, bound.nonce)) {
      return yield* reject(
        "bad_request",
        "invalid_state",
        "validate_state",
        "Invalid state",
      );
    }

    yield* Effect.logInfo("clover.oauth.state.validated", {
      requestId,
      workflowStage: "validate_state",
    });

    // 3. Merchant binding: callback == sealed == configured allowed merchant.
    if (merchantId !== bound.merchantId || merchantId !== config.merchantId) {
      return yield* reject(
        "forbidden",
        "merchant_not_allowed",
        "validate_merchant",
        "Merchant not allowed",
      );
    }

    // 4. Client binding: callback == sealed == configured app id.
    if (clientId !== bound.clientId || clientId !== config.appId) {
      return yield* reject(
        "forbidden",
        "invalid_client",
        "validate_client",
        "Invalid client",
      );
    }

    // 5. Redirect URI binding: sealed == configured callback URL.
    if (bound.redirectUri !== config.oauthRedirectUri) {
      return yield* reject(
        "bad_request",
        "invalid_state",
        "validate_state",
        "Invalid state",
      );
    }

    yield* Effect.logInfo("clover.oauth.callback.validated", {
      requestId,
      workflowStage: "exchange_code",
      merchantId,
    });

    // Only the validated merchant id (never the raw query param) is persisted.
    yield* exchangeCodeForTokens(merchantId, code);

    yield* Effect.logInfo("clover.oauth.callback.completed", {
      requestId,
      workflowStage: "completed",
      merchantId,
    });

    return yield* ok({ connected: true });
  });
}

function logRejected(requestId: string, stage: string, failureTag: string) {
  return Effect.logWarning("clover.oauth.rejected", {
    requestId,
    workflowStage: stage,
    failureDisposition: "expected_terminal",
    failureTag,
  });
}

function setStateCookie(value: string, redirectUri: string): string {
  return [
    `${OAUTH_STATE_COOKIE_NAME}=${value}`,
    `Path=${OAUTH_STATE_COOKIE_PATH}`,
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(OAUTH_STATE_TTL_MS / 1000)}`,
    ...cookieSecureAttr(redirectUri),
  ].join("; ");
}

function clearStateCookie(redirectUri: string): string {
  return [
    `${OAUTH_STATE_COOKIE_NAME}=`,
    `Path=${OAUTH_STATE_COOKIE_PATH}`,
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    ...cookieSecureAttr(redirectUri),
  ].join("; ");
}

/**
 * `Secure` is emitted when the callback runs over HTTPS (the production
 * `redirect_uri` is validated to be https), and omitted for http sandbox/dev so
 * the cookie is still stored without TLS.
 */
function cookieSecureAttr(redirectUri: string): string[] {
  try {
    return new URL(redirectUri).protocol === "https:" ? ["Secure"] : [];
  } catch {
    return [];
  }
}

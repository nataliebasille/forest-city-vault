import { RequestTrace } from "@/lib/runtime/middleware/request-trace";
import { route } from "@/runtime";
import { buildAuthorizeUrl, exchangeCodeForTokens } from "@/lib/integration/auth";
import { badRequest, redirect } from "@forest-city-vault/platform-nextjs-effect";
import { Effect } from "effect";
import { NextRequest } from "next/server";

/**
 * Clover OAuth callback — also the app's Site URL, so Clover lands the merchant
 * here both when launching the app and after authorization. The two cases are
 * distinguished by the presence of a single-use `code`:
 *
 * - **No `code` (app launch / unauthorized merchant):** Clover sends only
 *   `merchant_id` and `client_id`. We redirect the merchant to Clover's
 *   `/oauth/v2/authorize` endpoint, which — after the merchant authorizes —
 *   redirects them back here *with* a `code`.
 * - **`code` present (authorized merchant):** we exchange the single-use code
 *   for the merchant's expiring access/refresh token pair and persist it
 *   (encrypted). This is the only place the `code` is consumed.
 *
 * Runs on the default `route` factory, so the token upsert commits inside the
 * request's transaction.
 */
const handler = (request: NextRequest) =>
  Effect.gen(function* () {
    const { requestId } = yield* RequestTrace;

    const merchantId = request.nextUrl.searchParams.get("merchant_id");
    const code = request.nextUrl.searchParams.get("code");

    yield* Effect.logInfo("clover.oauth.callback.received", {
      requestId,
      workflowStage: "authorize_callback",
      merchantIdPresent: Boolean(merchantId),
      codePresent: Boolean(code),
    });

    // App launch / unauthorized merchant: no code yet. Kick off authorization
    // by redirecting to Clover; it will redirect back here with a code.
    if (!code) {
      const authorizeUrl = yield* buildAuthorizeUrl(merchantId ?? undefined);

      yield* Effect.logInfo("clover.oauth.callback.redirect_to_authorize", {
        requestId,
        workflowStage: "request_authorization",
        merchantIdPresent: Boolean(merchantId),
      });

      return yield* redirect(authorizeUrl);
    }

    // Authorized merchant: Clover always pairs the code with a merchant_id.
    if (!merchantId) {
      return yield* badRequest("Missing merchant_id");
    }

    yield* exchangeCodeForTokens(merchantId, code);

    yield* Effect.logInfo("clover.oauth.callback.completed", {
      requestId,
      workflowStage: "completed",
    });

    return { connected: true, merchantId };
  });

export const GET = route(handler);

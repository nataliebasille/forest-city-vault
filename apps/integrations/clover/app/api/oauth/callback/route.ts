import { RequestTrace } from "@/lib/runtime/middleware/request-trace";
import { route } from "@/runtime";
import { exchangeCodeForTokens } from "@/lib/integration/auth";
import { badRequest } from "@forest-city-vault/platform-nextjs-effect";
import { Effect } from "effect";
import { NextRequest } from "next/server";

/**
 * Clover OAuth callback.
 *
 * After a merchant installs/authorizes the app, Clover redirects the merchant's
 * browser here (this route is registered as the app's Site URL) with
 * `merchant_id` and a single-use authorization `code`. We exchange that code for
 * the merchant's expiring access/refresh token pair and persist it (encrypted).
 * This is the only place the `code` is consumed.
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

    if (!merchantId || !code) {
      return yield* badRequest("Missing merchant_id or code");
    }

    yield* exchangeCodeForTokens(merchantId, code);

    yield* Effect.logInfo("clover.oauth.callback.completed", {
      requestId,
      workflowStage: "completed",
    });

    return { connected: true, merchantId };
  });

export const GET = route(handler);

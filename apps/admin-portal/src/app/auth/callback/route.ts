import {
  redirect,
  setResponseHeader,
} from "@forest-city-vault/platform-nextjs-effect";
import { route } from "@/runtime";
import { Effect } from "effect";
import type { NextRequest } from "next/server";
import { exchangeCodeForSession } from "@/lib/auth/supabase-session";

/**
 * The magic-link landing route. Supabase appends the single-use PKCE `code` to
 * the `emailRedirectTo` the send action built (`${origin}/auth/callback`), and
 * this handler swaps it for a session:
 *
 *  - success            → session cookies written, redirect to the portal home.
 *  - no code / provider `error` param (expired or denied link) → back to
 *    `/login` with an `error` code the page renders as guidance.
 *  - exchange rejected  → same, `/login?error=link_invalid`.
 *
 * Runs on the app's shared {@link route} factory, whose {@link AppLive} layer
 * provides the `SupabaseConfig` the exchange needs; the writable cookie store the
 * exchange writes the session into is read from `next/headers`. `Cache-Control:
 * no-store` is set on every response so no proxy caches a Set-Cookie meant for
 * one visitor.
 */
export const GET = route((request: NextRequest) =>
  Effect.gen(function* () {
    yield* setResponseHeader("Cache-Control", "no-store");

    const params = request.nextUrl.searchParams;
    const code = params.get("code");
    const providerError = params.get("error");

    if (providerError || !code) {
      const reason =
        params.get("error_code") === "otp_expired" ?
          "link_expired"
        : "link_invalid";
      return yield* redirect(loginUrl(request, reason));
    }

    const outcome = yield* exchangeCodeForSession(code).pipe(Effect.either);

    if (outcome._tag === "Left") {
      return yield* redirect(loginUrl(request, "link_invalid"));
    }

    return yield* redirect(new URL("/", request.url).toString());
  }),
);

function loginUrl(request: NextRequest, error: string): string {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", error);
  return url.toString();
}

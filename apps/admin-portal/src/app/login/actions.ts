"use server";

import { Headers } from "@forest-city-vault/platform-nextjs-effect";
import { serverAction } from "@/runtime";
import { Effect } from "effect";
import { type MagicLinkState, messageForLoginError } from "./magic-link-state";
import {
  SupabaseSessionError,
  sendMagicLink,
} from "@/lib/auth/supabase-session";

/**
 * Sends the passwordless sign-in link for the submitted email.
 *
 * The action is intentionally unauthenticated — it is the entry point to the
 * portal — but it leaks nothing: `sendMagicLink` is invite-only
 * (`shouldCreateUser: false`) and every non-fatal outcome collapses to the same
 * neutral `sent` state, so a caller (including a direct POST) cannot tell whether
 * an address has an account. Only a rate limit or an unexpected failure produces
 * a visible `error`.
 *
 * Runs on the app's shared {@link serverAction} factory; `sendMagicLink` reads
 * `SupabaseConfig` from that layer, and the writable cookie store the PKCE flow
 * needs is read from `next/headers` inside `sendMagicLink`.
 */
export const requestMagicLink = serverAction(
  "login/requestMagicLink",
  (_previous: MagicLinkState, formData: FormData) =>
    Effect.gen(function* () {
      const email = String(formData.get("email") ?? "").trim();

      if (!isLikelyEmail(email)) {
        return {
          status: "error",
          message: "Enter a valid email address.",
        } satisfies MagicLinkState;
      }

      const emailRedirectTo = `${yield* requestOrigin}/auth/callback`;

      const outcome = yield* sendMagicLink({ email, emailRedirectTo }).pipe(
        Effect.either,
      );

      if (outcome._tag === "Left") {
        return handleSendFailure(email, outcome.left);
      }

      return { status: "sent", email } satisfies MagicLinkState;
    }),
);

/**
 * Collapses send failures to a user-facing state. A rate limit (429) is the one
 * failure worth telling the submitter about; any other Supabase-side rejection
 * (most importantly "no such user", which we must not confirm) is reported as the
 * same neutral `sent` panel a real send would produce, while a transport failure
 * — no `status`, so the auth server was unreachable — surfaces as a generic
 * error so the submitter knows to retry.
 */
function handleSendFailure(
  email: string,
  error: SupabaseSessionError,
): MagicLinkState {
  if (error.status === 429) {
    return {
      status: "error",
      message: "Too many attempts. Wait a minute and try again.",
    };
  }

  if (error.status === undefined) {
    return {
      status: "error",
      message: messageForLoginError("unexpected") ?? "Something went wrong.",
    };
  }

  return { status: "sent", email };
}

/**
 * The absolute origin the magic-link email should point back at, taken from the
 * request rather than configuration so the link resolves to whatever host the
 * portal is served on (localhost in dev, the deployed host in prod). Prefers the
 * `Origin` header a same-site form POST always carries, then the proxied
 * `x-forwarded-*` pair, then `Host`.
 */
const requestOrigin = Effect.gen(function* () {
  const headers = yield* Headers;

  const origin = headers.get("origin");
  if (origin) {
    return origin;
  }

  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "";
  const protocol =
    headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ?
      "http"
    : "https");

  return `${protocol}://${host}`;
});

function isLikelyEmail(value: string): boolean {
  // Deliberately loose: Supabase is the real validator. This only rejects the
  // obviously-empty/malformed before spending a network round-trip.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

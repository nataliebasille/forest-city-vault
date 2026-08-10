"use server";

import { Headers as RequestHeaders } from "@forest-city-vault/platform-nextjs-effect";
import {
  type MagicLinkRequestError,
  signInWithMagicLink,
} from "@/lib/auth/auth";
import { serverAction } from "@/runtime";
import { Effect } from "effect";
import { type MagicLinkState, messageForLoginError } from "./magic-link-state";

/**
 * Sends the passwordless sign-in link for the submitted email.
 *
 * The action is intentionally unauthenticated — it is the entry point to the
 * portal — but it leaks nothing: {@link signInWithMagicLink} always succeeds for
 * a well-formed email, and the link itself is only emailed when the address has
 * an active membership. So every normal outcome collapses to the same neutral
 * `sent` state and a caller cannot tell whether an address has an account. Only a
 * rate limit (429) or an unexpected failure produces a visible `error`.
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

      const requestHeaders = yield* RequestHeaders;

      const outcome = yield* signInWithMagicLink(requestHeaders, {
        email,
      }).pipe(Effect.either);

      if (outcome._tag === "Left") {
        return handleSendFailure(outcome.left);
      }

      return { status: "sent", email } satisfies MagicLinkState;
    }),
);

/**
 * Collapses send failures to a user-facing state. A rate limit (429) is the one
 * failure worth telling the submitter about; anything else is an unexpected
 * transport/server failure surfaced as a generic error so they know to retry.
 * "Unknown user" never reaches here — it is a success from Better Auth's side.
 */
function handleSendFailure(error: MagicLinkRequestError) {
  if (error.statusCode === 429) {
    return {
      status: "error",
      message: "Too many attempts. Wait a minute and try again.",
    } satisfies MagicLinkState;
  }

  return {
    status: "error",
    message: messageForLoginError("unexpected") ?? "Something went wrong.",
  } satisfies MagicLinkState;
}

function isLikelyEmail(value: string) {
  // Deliberately loose: Better Auth is the real validator. This only rejects the
  // obviously-empty/malformed before spending a network round-trip.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

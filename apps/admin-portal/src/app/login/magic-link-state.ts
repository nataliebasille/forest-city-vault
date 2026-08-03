/**
 * The result a magic-link submission hands back to the login form via
 * `useActionState`. Kept in its own module (no `"use server"` / `"use client"`
 * directive) so both the Server Action and the client form can import the type
 * without dragging one runtime's code into the other's bundle.
 *
 *  - `idle`  — nothing submitted yet.
 *  - `sent`  — a link was (or would have been) emailed; the form shows a neutral
 *              "check your inbox" panel. Returned even for unknown addresses so a
 *              submitter cannot probe which emails have accounts.
 *  - `error` — the submission itself could not be accepted (invalid email,
 *              rate-limited, or an unexpected failure); `message` is shown inline.
 */
export type MagicLinkState =
  | { readonly status: "idle" }
  | { readonly status: "sent"; readonly email: string }
  | { readonly status: "error"; readonly message: string };

export const initialMagicLinkState: MagicLinkState = { status: "idle" };

/** Human-readable copy for a `/login?error=` code set by the callback route. */
export function messageForLoginError(code: string | undefined): string | null {
  switch (code) {
    case undefined:
    case "":
      return null;
    case "link_expired":
    case "link_invalid":
      return "That sign-in link is invalid or has expired. Request a new one below.";
    default:
      return "We couldn't complete sign-in. Request a new link below.";
  }
}

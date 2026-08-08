"use client";

import Image from "next/image";
import { useActionState } from "react";
import { requestMagicLink } from "./actions";
import { initialMagicLinkState } from "./magic-link-state";

/**
 * The admin portal sign-in panel. Centered over the brand-brown full-bleed
 * background on mobile; left-aligned beside the brand story panel on tablet and
 * desktop. The email label stays left-aligned within its control at every size.
 *
 * Submitting dispatches the {@link requestMagicLink} Server Action through
 * `useActionState`: while it runs the button shows a pending label, a `sent`
 * result swaps the form for a neutral "check your inbox" confirmation, and an
 * `error` result (invalid email, rate limit, or a failed send) renders inline.
 * `initialError` seeds that inline message when the callback route bounced the
 * visitor back here with a `?error=` code.
 */
export function LoginForm({ initialError }: { initialError?: string | null }) {
  const [state, formAction, isPending] = useActionState(
    requestMagicLink,
    initialMagicLinkState,
  );

  const inlineError =
    state.status === "error" ? state.message
    : state.status === "idle" ? (initialError ?? null)
    : null;

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-light-surface-950 px-6 py-16 md:bg-light-surface-50">
      {/* Brand-brown gradient wash — mobile only. Matches the brand story panel
          on desktop; hidden there since this column turns white at md. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(190,153,109,0.35),transparent_45%),radial-gradient(circle_at_90%_90%,rgba(175,95,29,0.35),transparent_45%)] opacity-70 md:hidden"
      />
      <div className="relative flex w-full max-w-md flex-col items-center gap-8 text-center md:max-w-sm md:items-stretch md:text-left">
        {/* Inline logo for mobile — the reverse mark reads on the brown bg.
            Desktop shows the logo in the brand panel instead. */}
        <Image
          src="/branding/primary logo no tag reverse.png"
          alt="Forest City Vault logo"
          width={994}
          height={768}
          priority
          className="h-auto w-36 md:hidden"
        />

        {state.status === "sent" ?
          <CheckYourInbox email={state.email} />
        : <div className="flex flex-col gap-3">
            <span className="font-subheading text-xs font-semibold tracking-[0.28em] text-primary-500 uppercase">
              Admin Portal
            </span>
            <h1 className="font-heading text-4xl font-semibold text-on-light-surface-950 md:text-on-light-surface-50">
              Sign in
            </h1>
            <p className="font-body text-lg/8 text-on-light-surface-950/80 md:text-base/7 md:text-on-light-surface-50/80">
              Access is invite-only. Enter your owner email and we&apos;ll send
              a passwordless sign-in link.
            </p>
          </div>
        }

        {state.status === "sent" ? null : (
          <form action={formAction} className="flex w-full flex-col gap-5">
            {/* Pin the form-control to the fixed light-surface tones so the input
                renders as a white box (tan border, dark text) regardless of OS
                scheme — legible on both the brown mobile column and the white
                desktop column. Without this it inherits the scheme-flipping
                `surface` palette and turns dark brown in OS dark mode. */}
            <div className="form-control [--bg-tone-300:var(--color-light-surface-300)] [--bg-tone-50:var(--color-light-surface-50)] [--bg-tone-800:var(--color-light-surface-800)] [--fg-tone-100:var(--color-on-light-surface-100)] [--fg-tone-50:var(--color-on-light-surface-50)]">
              <label htmlFor="email" className="text-left">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                required
                disabled={isPending}
                placeholder="you@forestcityvault.com"
                aria-invalid={inlineError ? true : undefined}
                aria-describedby={inlineError ? "login-error" : undefined}
              />
            </div>

            {inlineError ?
              <p
                id="login-error"
                role="alert"
                className="font-body text-left text-sm text-light-danger-400 md:text-light-danger-600"
              >
                {inlineError}
              </p>
            : null}

            <button
              type="submit"
              disabled={isPending}
              aria-busy={isPending}
              className="btn btn-solid/primary inline-flex min-h-12 items-center justify-center font-subheading text-sm font-semibold tracking-wide uppercase disabled:opacity-70"
            >
              {isPending ? "Sending link…" : "Email me a sign-in link"}
            </button>
          </form>
        )}

        <p className="font-body text-sm text-on-light-surface-950/60 md:text-on-light-surface-50/60">
          Trouble signing in? Contact a portal administrator.
        </p>
      </div>
    </div>
  );
}

/**
 * Replaces the form once a link has been dispatched. Deliberately generic about
 * the account: it says a link was sent "if an account exists", matching the
 * action's non-enumerating behaviour.
 */
function CheckYourInbox({ email }: { email: string }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="font-subheading text-xs font-semibold tracking-[0.28em] text-primary-500 uppercase">
        Check your inbox
      </span>
      <h1 className="font-heading text-4xl font-semibold text-on-light-surface-950 md:text-on-light-surface-50">
        Link on the way
      </h1>
      <p className="font-body text-lg/8 text-on-light-surface-950/80 md:text-base/7 md:text-on-light-surface-50/80">
        If an account exists for <span className="font-semibold">{email}</span>,
        a sign-in link is on its way. Open it on this device to finish signing
        in — the link expires shortly.
      </p>
    </div>
  );
}

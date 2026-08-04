import { SignOutIcon } from "@ui/icons";
import { signOutAction } from "./actions";

/**
 * The static contents of the portal sidebar — branding, the (currently empty)
 * navigation area, the signed-in owner's account, and the sign-out form. It is a
 * Server Component with no interactivity, rendered into both the desktop sidebar
 * and the mobile off-canvas drawer so the two stay identical.
 *
 * It returns its sections as a fragment so they become direct flex children of
 * whichever `<aside>` hosts them; the empty nav's `flex-1` then pins the account
 * block to the bottom.
 */
export function SidebarContent({
  account,
}: {
  account: { email: string; role: string };
}) {
  return (
    <>
      {/* Brand header */}
      <div className="flex h-[var(--shell-header-h)] items-center justify-between gap-2 border-b border-white/10 px-5">
        <Brand />
      </div>

      {/* Navigation — intentionally empty for now */}
      <nav
        className="flex-1 overflow-y-auto px-4 py-6"
        aria-label="Primary"
      />

      {/* Account + sign out */}
      <div className="border-t border-white/10 px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-500 font-subheading text-sm font-semibold text-on-primary-500">
            {initialsFromEmail(account.email)}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-subheading text-sm font-semibold text-on-secondary-500">
              {toRoleLabel(account.role)}
            </span>
            <span className="block truncate text-xs text-on-secondary-500/60">
              {account.email}
            </span>
          </span>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/15 px-3 py-1.5 font-subheading text-xs font-medium text-on-secondary-500/80 transition-colors hover:bg-white/5 hover:text-on-secondary-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400"
          >
            <SignOutIcon className="h-3.5 w-3.5" />
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}

/** The Forest City Vault wordmark shown in the sidebar header. */
function Brand() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500 font-heading text-sm font-bold text-on-primary-500 shadow-sm">
        FV
      </span>
      <span className="font-heading text-[0.95rem] leading-tight font-semibold tracking-tight">
        Forest City Vault
      </span>
    </span>
  );
}

/** Two-letter avatar initials from an email's local part, e.g. `owner@…` → "OW". */
function initialsFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  const letters = local.replace(/[^a-zA-Z]/g, "");
  return (letters.slice(0, 2) || local.slice(0, 2)).toUpperCase();
}

/** Title-case a store role for display, e.g. `owner` → "Owner". */
function toRoleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

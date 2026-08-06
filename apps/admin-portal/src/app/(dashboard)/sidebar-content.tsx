import { AccountMenu } from "./account-menu";

/**
 * The static contents of the portal sidebar — branding, the (currently empty)
 * navigation area, and the signed-in owner's account menu. It is a Server
 * Component rendered into both the desktop sidebar and the mobile off-canvas
 * drawer so the two stay identical.
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

      {/* Account menu (appearance + sign out) */}
      <div className="border-t border-white/10 px-4 py-4">
        <AccountMenu account={account} />
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

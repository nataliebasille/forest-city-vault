"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccountMenu } from "./account-menu";

/**
 * The static contents of the portal sidebar — branding, primary navigation,
 * and the signed-in owner's account menu. It is a Client Component rendered
 * into both the desktop sidebar and the mobile off-canvas drawer so the two
 * stay identical while the active route updates immediately.
 *
 * It returns its sections as a fragment so they become direct flex children of
 * whichever `<aside>` hosts them; the nav's `flex-1` then pins the account
 * block to the bottom.
 */
export function SidebarContent({
  account,
}: {
  account: { email: string; role: string };
}) {
  const pathname = usePathname();

  return (
    <>
      {/* Brand header */}
      <div className="flex h-[var(--shell-header-h)] items-center justify-between gap-2 border-b border-white/10 px-5">
        <Brand />
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-4 py-6" aria-label="Primary">
        <NavLink href="/" pathname={pathname} exact>
          Dashboard
        </NavLink>
        <NavLink href="/sales-review" pathname={pathname}>
          Sales review
        </NavLink>
      </nav>

      {/* Account menu (appearance + sign out) */}
      <div className="border-t border-white/10 px-4 py-4">
        <AccountMenu account={account} />
      </div>
    </>
  );
}

function NavLink({
  href,
  pathname,
  exact,
  children,
}: {
  href: string;
  pathname: string;
  exact?: boolean;
  children: React.ReactNode;
}) {
  const isActive = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={[
        "flex items-center gap-2.5 rounded-lg px-3 py-2 font-subheading text-sm font-medium transition-colors",
        isActive
          ? "bg-white/15 text-on-secondary-500"
          : "text-on-secondary-500/55 hover:bg-white/8 hover:text-on-secondary-500/85",
      ].join(" ")}
    >
      <span
        className={[
          "h-1.5 w-1.5 shrink-0 rounded-full",
          isActive ? "bg-primary-500" : "bg-transparent",
        ].join(" ")}
      />
      {children}
    </Link>
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

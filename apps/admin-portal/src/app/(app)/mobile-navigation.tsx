"use client";

import { CloseIcon, MenuIcon } from "@ui/icons";
import { usePathname } from "next/navigation";
import { type MouseEvent, type ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * The mobile-only interactive chrome for the portal shell: the top bar with the
 * page title and menu toggle, the tap-to-dismiss overlay, and the off-canvas
 * drawer. It owns the drawer's open/closed state and the current page title.
 *
 * The drawer's contents arrive as the server-rendered {@link sidebar} slot, so
 * this client boundary never imports the sidebar's Server Component — keeping the
 * shared sidebar as server code. Everything here is hidden at `md+`, where the
 * desktop sidebar takes over.
 */
export function MobileNavigation({ sidebar }: { sidebar: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] ?? "";

  // Close the drawer after navigating, since tapping a link inside the
  // server-rendered sidebar can't reach this client component's state directly.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Also close when any link in the drawer is tapped — clicking the link for the
  // current route doesn't change the pathname, so the effect above wouldn't fire.
  const handleDrawerClick = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("a")) {
      setOpen(false);
    }
  };

  return (
    <>
      {/* Mobile top bar: menu toggle + centered page title */}
      <header className="relative flex h-[var(--shell-header-h)] items-center justify-center border-b border-ink/10 bg-[var(--shell-content-bg)] px-4 md:hidden">
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-ink transition-colors hover:bg-secondary-500/10"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
        {title ?
          <span className="font-heading text-xl font-semibold text-ink">
            {title}
          </span>
        : null}
      </header>

      {/* Overlay */}
      {open ?
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
        />
      : null}

      {/* Off-canvas drawer */}
      <aside
        onClick={handleDrawerClick}
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-secondary-500 text-on-secondary-500 shadow-xl transition-transform duration-300 md:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {sidebar}
        {/* Close button, overlaying the shared brand header's right edge */}
        <div className="absolute right-4 top-0 flex h-[var(--shell-header-h)] items-center">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="rounded-lg p-2 text-on-secondary-500/70 transition-colors hover:bg-white/10 hover:text-on-secondary-500"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
      </aside>
    </>
  );
}

/**
 * Titles shown in the mobile top bar per route. The desktop title lives in each
 * page's own header; on mobile that header is hidden to save vertical space, so
 * the shell surfaces the current page's title here instead.
 */
const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/sales-review": "Sales review",
  "/vendors": "Vendors",
};

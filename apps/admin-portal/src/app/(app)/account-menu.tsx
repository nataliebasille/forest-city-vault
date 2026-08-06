"use client";

import {
  ChevronUpDownIcon,
  SignOutIcon,
} from "@ui/icons";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { signOutAction } from "./actions";
import { ThemeToggle } from "./theme-toggle";

/**
 * The account control in the sidebar footer: a button showing the signed-in
 * owner that opens a popover menu holding the appearance (Light / Dark / System)
 * choices and the sign-out action. Grouping both into one menu keeps the footer
 * to a single row until the owner deliberately opens it.
 *
 * The popover opens upward (the trigger sits at the bottom of the sidebar) and
 * closes on outside click or Escape. Picking a theme intentionally leaves the
 * menu open so the change is visible against the live UI; only sign-out and the
 * dismiss gestures close it.
 *
 * Appearance is next-themes' `theme`, so selecting an option calls `setTheme`,
 * which persists the choice to `localStorage`, follows the OS while "System" is
 * selected, and re-stamps `data-theme` on `<html>`. next-themes can't know the
 * stored choice during SSR, but the menu's contents only exist once it is opened
 * (a post-hydration action), so there is no hydration mismatch to guard against.
 */
export function AccountMenu({
  account,
}: {
  account: { email: string; role: string };
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const initials = initialsFromEmail(account.email);
  const roleLabel = toRoleLabel(account.role);

  return (
    <div ref={containerRef} className="relative">
      {open ?
        <div
          role="menu"
          aria-label="Account"
          className="absolute inset-x-0 bottom-full mb-2 overflow-hidden rounded-xl border border-white/15 bg-secondary-500 shadow-2xl shadow-black/40 ring-1 ring-black/20"
        >
          <div className="flex items-center gap-3 px-3 py-3">
            <Avatar initials={initials} />
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-subheading text-sm font-semibold text-on-secondary-500">
                {roleLabel}
              </span>
              <span className="block truncate text-xs text-on-secondary-500/60">
                {account.email}
              </span>
            </span>
          </div>

          <Divider />

          <div className="px-2 py-2">
            <p className="px-0.5 pb-2 font-subheading text-[0.7rem] font-semibold tracking-wide text-on-secondary-500/50 uppercase">
              Appearance
            </p>
            <ThemeToggle />
          </div>

          <Divider />

          <div className="px-1.5 py-1.5">
            <form action={signOutAction}>
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 font-subheading text-sm font-medium text-on-secondary-500/80 transition-colors hover:bg-white/8 hover:text-on-secondary-500 focus-visible:bg-white/8 focus-visible:text-on-secondary-500 focus-visible:outline-none"
              >
                <SignOutIcon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      : null}

      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400",
          open && "bg-white/8",
        )}
      >
        <Avatar initials={initials} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate font-subheading text-sm font-semibold text-on-secondary-500">
            {roleLabel}
          </span>
          <span className="block truncate text-xs text-on-secondary-500/60">
            {account.email}
          </span>
        </span>
        <ChevronUpDownIcon className="h-4 w-4 shrink-0 text-on-secondary-500/50" />
      </button>
    </div>
  );
}

/** The circular initials avatar shared by the trigger and the menu header. */
function Avatar({ initials }: { initials: string }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-500 font-subheading text-sm font-semibold text-on-primary-500">
      {initials}
    </span>
  );
}

/** A hairline separator between menu sections. */
function Divider() {
  return <div className="h-px bg-white/10" />;
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

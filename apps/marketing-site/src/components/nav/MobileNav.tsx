"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CloseIcon, MenuIcon } from "@/components/icons";

type MenuItem = {
  label: string;
  href: string;
  external?: boolean;
  cta?: boolean;
};

export function MobileNav({ mapUrl }: { mapUrl: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const items: MenuItem[] = [
    { label: "Browse vendors", href: "#vendors" },
    { label: "Plan your visit", href: mapUrl, external: true },
    { label: "Become a vendor", href: "#vendors", cta: true },
  ];

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) {
      buttonRef.current?.focus();
    }
  };

  // Portals require a mounted client (document) before rendering.
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // Lock scroll and move focus into the drawer while it is open. The scroll
  // container is <html> (globals.css sets overflow-x: clip there), so the lock
  // and scrollbar-width compensation are applied to documentElement to avoid a
  // horizontal shift when the scrollbar disappears.
  useEffect(() => {
    if (!open) {
      return;
    }
    const root = document.documentElement;
    const scrollbarWidth = window.innerWidth - root.clientWidth;
    const previousOverflow = root.style.overflow;
    const previousPaddingRight = root.style.paddingRight;
    root.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      root.style.paddingRight = `${scrollbarWidth}px`;
    }
    closeButtonRef.current?.focus();
    return () => {
      root.style.overflow = previousOverflow;
      root.style.paddingRight = previousPaddingRight;
    };
  }, [open]);

  // Close when a pointer press lands outside the drawer panel (and not on the
  // toggle button). Uses the capture phase so it fires before inner handlers.
  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        panelRef.current?.contains(target) ||
        buttonRef.current?.contains(target)
      ) {
        return;
      }
      close(false);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [open]);

  const focusables = () => {
    const panel = panelRef.current;
    if (!panel) {
      return [] as HTMLElement[];
    }
    return Array.from(
      panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
  };

  const handlePanelKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    // Trap focus inside the drawer.
    const elements = focusables();
    if (elements.length === 0) {
      return;
    }
    const first = elements[0];
    const last = elements[elements.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="mobile-nav-drawer"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-surface-50/25 text-surface-50 transition-colors hover:bg-surface-50/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-surface-50"
      >
        {open ?
          <CloseIcon className="h-6 w-6" />
        : <MenuIcon className="h-6 w-6" />}
      </button>

      {/* Rendered through a portal so the fixed overlay escapes the header's
          backdrop-filter containing block and covers the whole viewport. */}
      {mounted ?
        createPortal(
          <div className="md:hidden">
            {/* Backdrop */}
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              onClick={() => close(false)}
              className={`fixed inset-0 z-[100] bg-secondary-950/50 backdrop-blur-sm ${
                reducedMotion ? "" : "transition-opacity duration-300"
              } ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
            />

            {/* Sidebar drawer */}
            <div
              ref={panelRef}
              id="mobile-nav-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Site menu"
              onKeyDown={handlePanelKeyDown}
              className={`fixed inset-y-0 right-0 z-[101] flex w-72 max-w-[80vw] flex-col bg-secondary-500 text-surface-50 shadow-[-20px_0_45px_-20px_rgba(0,0,0,0.6)] ${
                reducedMotion ? "" : (
                  "transition-transform duration-300 ease-out"
                )
              } ${open ? "translate-x-0" : "pointer-events-none translate-x-full"}`}
            >
              <div className="flex h-16 items-center justify-between gap-4 border-b border-surface-50/10 px-6">
                <Image
                  src="/branding/primary logo no tag reverse.png"
                  alt="Forest City Vault logo"
                  width={994}
                  height={768}
                  className="h-10 w-auto"
                />
                <button
                  ref={closeButtonRef}
                  type="button"
                  aria-label="Close menu"
                  onClick={() => close()}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-surface-50/25 text-surface-50 transition-colors hover:bg-surface-50/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-surface-50"
                >
                  <CloseIcon className="h-6 w-6" />
                </button>
              </div>

              <nav aria-label="Main menu" className="flex flex-col gap-2 p-4">
                {items.map((item) => {
                  const linkProps = {
                    href: item.href,
                    ...(item.external ?
                      { target: "_blank", rel: "noreferrer" }
                    : {}),
                    onClick: () => close(false),
                  };

                  if (item.cta) {
                    return (
                      <div
                        key={item.label}
                        className="mt-4 flex flex-col gap-4"
                      >
                        <hr
                          className="border-surface-50/15"
                          aria-hidden="true"
                        />
                        <a
                          {...linkProps}
                          className="btn btn-solid/primary justify-center font-subheading text-sm font-semibold tracking-wide uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-surface-50"
                        >
                          {item.label}
                        </a>
                      </div>
                    );
                  }

                  return (
                    <a
                      key={item.label}
                      {...linkProps}
                      className="rounded-lg px-4 py-3 font-subheading text-base font-medium text-surface-50 transition-colors hover:bg-surface-50/10 focus-visible:bg-surface-50/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-surface-50"
                    >
                      {item.label}
                    </a>
                  );
                })}
              </nav>
            </div>
          </div>,
          document.body,
        )
      : null}
    </div>
  );
}

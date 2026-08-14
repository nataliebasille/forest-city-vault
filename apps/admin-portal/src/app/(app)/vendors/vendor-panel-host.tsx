"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { VendorSlideOver } from "./vendor-slide-over";
import { useVendors } from "./vendors-context";

/** Time the slide-out is given to play before the panel unmounts (matches the
 * keyframe duration in {@link VendorSlideOver}). */
const EXIT_MS = 250;

/**
 * Keeps the vendor slide-over mounted across route changes so it can animate in
 * *and* out. It lives in the vendors layout (which persists while the URL moves
 * between the roster, `/vendors/new`, and `/vendors/[id]`) and derives the panel
 * purely from the pathname. Because every way of closing — the panel's own
 * controls, an in-app link, or the browser back/forward buttons — ends on
 * `/vendors`, they all funnel through one transition: `open` flips to false, the
 * slide-out plays, and the panel unmounts a beat later.
 *
 * The `/vendors/new` draft is created on entry and discarded once the panel has
 * finished animating away, so it shows in the list behind the panel and never
 * lingers after close.
 */
export function VendorPanelHost() {
  const pathname = usePathname();
  const { ensureDraft, discardDraft } = useVendors();

  const segment =
    pathname.startsWith("/vendors/") ?
      pathname.slice("/vendors/".length)
    : null;
  const isNew = segment === "new";
  const editId =
    segment !== null && !isNew && !segment.includes("/") ? segment : null;

  // Seed straight from the pathname so a deep-linked edit renders its panel on
  // the first paint (the `/vendors/new` draft is minted in the effect instead).
  const [renderId, setRenderId] = useState<string | null>(editId);
  const [open, setOpen] = useState(editId !== null);

  useEffect(() => {
    if (isNew) {
      setRenderId(ensureDraft());
      setOpen(true);
      return;
    }
    if (editId !== null) {
      setRenderId(editId);
      setOpen(true);
      return;
    }
    // Back on the roster: play the slide-out, then unmount and drop any draft.
    setOpen(false);
    const timer = setTimeout(() => {
      setRenderId(null);
      discardDraft();
    }, EXIT_MS);
    return () => clearTimeout(timer);
  }, [isNew, editId, ensureDraft, discardDraft]);

  if (renderId === null) {
    return null;
  }

  return <VendorSlideOver vendorId={renderId} open={open} />;
}

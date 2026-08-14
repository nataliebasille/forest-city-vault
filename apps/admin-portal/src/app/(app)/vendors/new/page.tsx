"use client";

import { useEffect, useState } from "react";
import { VendorSlideOver } from "../vendor-slide-over";
import { useVendors } from "../vendors-context";

/**
 * The `/vendors/new` route: opens the slide-over on a fresh, blank vendor draft.
 * The draft is created in the shared store on entry (so it also appears in the
 * list behind the panel) and discarded on exit, since edits are not persisted
 * yet — navigating away from this route leaves the roster as it was.
 */
export default function NewVendorPage() {
  const { ensureDraft, discardDraft } = useVendors();
  const [vendorId, setVendorId] = useState<string | null>(null);

  useEffect(() => {
    setVendorId(ensureDraft());
    return () => discardDraft();
  }, [ensureDraft, discardDraft]);

  if (vendorId === null) {
    return null;
  }

  return <VendorSlideOver vendorId={vendorId} />;
}

"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import {
  applyVendorPatch,
  blankVendor,
  prependVendor,
  removeVendor,
  toggleVendorStatus,
  type VendorStatus,
  type VendorView,
} from "./vendor-view";

export type VendorFilter = "all" | VendorStatus;

type VendorsContextValue = {
  vendors: VendorView[];
  filter: VendorFilter;
  setFilter: (filter: VendorFilter) => void;
  /** Merge a patch into one vendor (name, items, status, …). */
  updateVendor: (id: string, patch: Partial<VendorView>) => void;
  /** Flip a vendor between active and inactive. */
  toggleStatus: (id: string) => void;
  /**
   * Ensures a blank "add vendor" draft exists in the list and returns its id.
   * Idempotent — repeated calls (e.g. React Strict Mode's double-invoked mount
   * effect) reuse the same draft rather than stacking blanks.
   */
  ensureDraft: () => string;
  /** Removes the current draft, if any — used when leaving the add route. */
  discardDraft: () => void;
};

const VendorsContext = createContext<VendorsContextValue | null>(null);

/**
 * Client store for the vendor management workspace. Holds the vendor list (with
 * local, not-yet-persisted edits), the status filter, and the lifecycle of the
 * "add vendor" draft. It lives in the vendors layout so its state survives
 * navigation between the list, the add route, and each edit route — the sub-route
 * panels read and mutate the same vendors the list behind them renders.
 */
export function VendorsProvider({
  initial,
  children,
}: {
  initial: VendorView[];
  children: React.ReactNode;
}) {
  const [vendors, setVendors] = useState<VendorView[]>(initial);
  const [filter, setFilter] = useState<VendorFilter>("all");

  // The draft id is tracked in a ref (not state) so `ensureDraft` can return it
  // synchronously and stay idempotent across a mount effect's double-invocation,
  // without an extra render just to expose it.
  const draftIdRef = useRef<string | null>(null);

  const updateVendor = useCallback((id: string, patch: Partial<VendorView>) => {
    setVendors((prev) => applyVendorPatch(prev, id, patch));
  }, []);

  const toggleStatus = useCallback((id: string) => {
    setVendors((prev) => toggleVendorStatus(prev, id));
  }, []);

  const ensureDraft = useCallback(() => {
    const existing = draftIdRef.current;
    if (existing !== null) {
      return existing;
    }
    const draft = blankVendor();
    draftIdRef.current = draft.id;
    setVendors((prev) => prependVendor(prev, draft));
    return draft.id;
  }, []);

  const discardDraft = useCallback(() => {
    const id = draftIdRef.current;
    if (id === null) {
      return;
    }
    draftIdRef.current = null;
    setVendors((prev) => removeVendor(prev, id));
  }, []);

  const value: VendorsContextValue = {
    vendors,
    filter,
    setFilter,
    updateVendor,
    toggleStatus,
    ensureDraft,
    discardDraft,
  };

  return (
    <VendorsContext.Provider value={value}>{children}</VendorsContext.Provider>
  );
}

/** Reads the vendors store; throws if used outside {@link VendorsProvider}. */
export function useVendors() {
  const value = useContext(VendorsContext);
  if (value === null) {
    throw new Error("useVendors must be used within a VendorsProvider");
  }
  return value;
}

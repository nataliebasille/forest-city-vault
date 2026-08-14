"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  blankItem,
  type ItemSyncState,
  type ItemView,
  parseDollars,
  unsyncedCount,
  type VendorStatus,
} from "./vendor-view";
import { useVendors } from "./vendors-context";

/**
 * The add/edit panel for a single vendor, built around its items. It reads the
 * vendor from the shared store by `vendorId` and writes edits straight back to
 * it, so the list behind the panel reflects changes live. It is rendered by the
 * `/vendors/new` and `/vendors/[vendorId]` routes; closing it navigates back to
 * the list. A `vendorId` with no matching vendor (e.g. a stale deep link)
 * redirects to `/vendors` rather than rendering an empty shell.
 *
 * Edits are not persisted yet — mutations live only in the client store.
 */
export function VendorSlideOver({ vendorId }: { vendorId: string }) {
  const { vendors, updateVendor } = useVendors();
  const router = useRouter();
  const vendor = vendors.find((v) => v.id === vendorId);

  // Send stale deep links (unknown id) back to the list.
  useEffect(() => {
    if (vendor === undefined) {
      router.replace("/vendors");
    }
  }, [vendor, router]);

  // Lock the page scroll while the panel is open, compensating for the
  // scrollbar's width so the background doesn't shift when it disappears.
  useEffect(() => {
    const root = document.documentElement;
    const scrollbarWidth = window.innerWidth - root.clientWidth;
    const prevOverflow = root.style.overflow;
    const prevPaddingRight = root.style.paddingRight;
    root.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      root.style.paddingRight = `${scrollbarWidth}px`;
    }
    return () => {
      root.style.overflow = prevOverflow;
      root.style.paddingRight = prevPaddingRight;
    };
  }, []);

  if (vendor === undefined) {
    return null;
  }

  const unsynced = unsyncedCount(vendor);
  const active = vendor.status === "active";
  const items = vendor.items;
  const close = () => router.push("/vendors");
  const onChange = (patch: Partial<typeof vendor>) =>
    updateVendor(vendorId, patch);

  function setItem(id: string, patch: Partial<ItemView>) {
    onChange({
      items: items.map((item) =>
        item.id === id ?
          {
            ...item,
            ...patch,
            syncState:
              item.syncState === "new" ? "new"
              : item.syncState === "removed" ? "removed"
              : "edited",
          }
        : item,
      ),
    });
  }

  function addItem() {
    onChange({ items: [...items, blankItem()] });
  }

  function removeItem(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    if (item.syncState === "new") {
      onChange({ items: items.filter((i) => i.id !== id) });
    } else {
      onChange({
        items: items.map((i) =>
          i.id === id ? { ...i, syncState: "removed" } : i,
        ),
      });
    }
  }

  function restoreItem(id: string) {
    onChange({
      items: items.map((i) =>
        i.id === id ?
          { ...i, syncState: i.cloverItemId ? "edited" : "new" }
        : i,
      ),
    });
  }

  function syncToClover() {
    onChange({
      items: items
        .filter((i) => i.syncState !== "removed")
        .map((i) => ({
          ...i,
          cloverItemId:
            i.cloverItemId ?? `CI-${Math.floor(Math.random() * 9000 + 1000)}`,
          syncState: "synced",
        })),
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className="absolute inset-0 bg-black/30"
      />
      <aside className="palette-surface relative flex h-full w-full max-w-2xl animate-[slideIn_.25s_ease-out] flex-col bg-surface-50 shadow-2xl">
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-secondary-500/15 px-5 py-4">
          <button
            type="button"
            onClick={close}
            aria-label="Back to vendors"
            className="-ml-1 shrink-0 rounded-md p-1 text-on-surface-50/60 hover:bg-secondary-500/10 hover:text-ink"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="form-control min-w-0 flex-1">
            <label htmlFor="vendor-name">Vendor name</label>
            <input
              id="vendor-name"
              value={vendor.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="Untitled vendor"
            />
          </div>
          <div className="shrink-0">
            <StatusToggle
              status={vendor.status}
              onToggle={() =>
                onChange({ status: active ? "inactive" : "active" })
              }
            />
          </div>
        </header>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
          {/* Pricing model — above vendor details */}
          <div className="border-b border-secondary-500/10 px-5 py-4">
            <p className="mb-3 font-heading text-lg font-semibold text-ink">
              Pricing model
            </p>
            <div className="flex items-center gap-3">
              <span
                className={`font-subheading text-sm ${
                  vendor.pricingModel === "consignment" ?
                    "font-medium text-ink"
                  : "text-on-surface-50/50"
                }`}
              >
                Consignment
              </span>
              <label className="toggle-solid">
                <input
                  type="checkbox"
                  checked={vendor.pricingModel === "wholesale"}
                  onChange={(e) =>
                    onChange({
                      pricingModel:
                        e.target.checked ? "wholesale" : "consignment",
                    })
                  }
                />
              </label>
              <span
                className={`font-subheading text-sm ${
                  vendor.pricingModel === "wholesale" ?
                    "font-medium text-ink"
                  : "text-on-surface-50/50"
                }`}
              >
                Wholesale
              </span>
            </div>
          </div>

          {/* Vendor details — always visible */}
          <div className="border-b border-secondary-500/10 px-5 py-4">
            <p className="mb-3 font-heading text-lg font-semibold text-ink">
              Vendor details
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="form-control sm:col-span-2">
                <label htmlFor="vendor-tags">Tags</label>
                <input
                  id="vendor-tags"
                  value={vendor.tags}
                  onChange={(e) => onChange({ tags: e.target.value })}
                  placeholder="e.g. handmade, local, ceramics"
                />
              </div>
              <div className="form-control sm:col-span-2">
                <label htmlFor="vendor-contact">Contact email</label>
                <input
                  id="vendor-contact"
                  value={vendor.contact}
                  onChange={(e) => onChange({ contact: e.target.value })}
                  placeholder="team@vendor.com"
                />
              </div>
            </div>
          </div>

          {/* Items — the centrepiece */}
          <div className="flex flex-col px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-heading text-lg font-semibold text-ink">
                  Items
                </p>
                <p className="text-xs text-on-surface-50/55">
                  {vendor.items.filter((i) => i.syncState !== "removed").length}{" "}
                  items
                </p>
              </div>
              <button
                type="button"
                onClick={addItem}
                className="rounded-md border border-secondary-500/25 px-3 py-1.5 font-subheading text-xs text-on-surface-50/80 hover:bg-secondary-500/5"
              >
                + Add item
              </button>
            </div>

            <ul className="mt-3 flex flex-col gap-2 pb-4">
              {vendor.items.length === 0 && (
                <li className="rounded-lg border border-dashed border-secondary-500/25 px-4 py-8 text-center text-sm text-on-surface-50/55">
                  No items yet. Add one, then sync it into Clover.
                </li>
              )}
              {vendor.items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onChange={(patch) => setItem(item.id, patch)}
                  onRemove={() => removeItem(item.id)}
                  onRestore={() => restoreItem(item.id)}
                />
              ))}
            </ul>
          </div>
        </div>

        {/* Footer — Sync to Clover saves the whole vendor (details + items) */}
        <footer className="flex items-center justify-between gap-3 border-t border-secondary-500/15 px-5 py-3">
          <div className="flex flex-col">
            <span className="font-subheading text-xs text-on-surface-50/55">
              {unsynced > 0 ?
                `${unsynced} item change${unsynced === 1 ? "" : "s"} pending sync`
              : "Everything synced"}
            </span>
            <span className="font-subheading text-xs text-on-surface-50/40">
              Updated {vendor.updatedAt}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-md px-4 py-2 font-subheading text-sm text-on-surface-50/70 hover:bg-secondary-500/5"
            >
              Done
            </button>
            <button
              type="button"
              onClick={syncToClover}
              className="btn-solid/primary font-subheading text-sm"
            >
              ⟳ Sync to Clover
            </button>
          </div>
        </footer>
      </aside>

      <style>{`@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
    </div>
  );
}

function ItemRow({
  item,
  onChange,
  onRemove,
  onRestore,
}: {
  item: ItemView;
  onChange: (patch: Partial<ItemView>) => void;
  onRemove: () => void;
  onRestore: () => void;
}) {
  const removed = item.syncState === "removed";

  return (
    <li
      className={`flex min-w-0 items-center gap-3 py-1 ${removed ? "opacity-60" : ""}`}
    >
      <input
        value={item.name}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder="Item name"
        disabled={removed}
        className="min-w-0 flex-1 disabled:line-through disabled:opacity-60"
      />
      <div className="form-control w-28 shrink-0">
        <span className="form-control-prefix">$</span>
        <input
          inputMode="decimal"
          value={(item.priceCents / 100).toString()}
          onChange={(e) => onChange({ priceCents: parseDollars(e.target.value) })}
          disabled={removed}
          className="w-full min-w-0 text-right tabular-nums"
        />
      </div>
      <SyncBadge state={item.syncState} />
      {removed ?
        <button
          type="button"
          onClick={onRestore}
          className="shrink-0 rounded-md px-2 py-1 font-subheading text-xs text-primary-600 hover:bg-primary-500/10"
        >
          Undo
        </button>
      : <button
          type="button"
          onClick={onRemove}
          aria-label="Remove item"
          className="shrink-0 rounded-md px-2 py-1 text-lg leading-none text-on-surface-50/40 hover:bg-danger-500/10 hover:text-danger-600"
        >
          ×
        </button>
      }
    </li>
  );
}

const badgeStyle: Record<ItemSyncState, string> = {
  synced: "bg-success-500/15 text-success-700",
  edited: "bg-accent-500/20 text-accent-700",
  new: "bg-primary-500/15 text-primary-700",
  removed: "bg-danger-500/15 text-danger-700",
};

const badgeLabel: Record<ItemSyncState, string> = {
  synced: "Synced",
  edited: "Edited",
  new: "New",
  removed: "Removing",
};

function SyncBadge({ state }: { state: ItemSyncState }) {
  return (
    <span
      className={`hidden shrink-0 rounded-full px-2 py-0.5 font-subheading text-[10px] font-semibold uppercase tracking-wide sm:inline ${badgeStyle[state]}`}
    >
      {badgeLabel[state]}
    </span>
  );
}

function StatusToggle({
  status,
  onToggle,
}: {
  status: VendorStatus;
  onToggle: () => void;
}) {
  const active = status === "active";
  return (
    <button type="button" onClick={onToggle} className="flex items-center gap-2">
      <span
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 ${
          active ? "bg-success-500" : "bg-secondary-500/30"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-300 ${
            active ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </span>
      <span className="hidden font-subheading text-sm text-on-surface-50/75 sm:inline">
        {active ? "Active" : "Inactive"}
      </span>
    </button>
  );
}

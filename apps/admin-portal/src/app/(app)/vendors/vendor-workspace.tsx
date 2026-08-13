"use client";

import { useEffect, useState } from "react";
import {
  blankItem,
  blankVendor,
  type ItemSyncState,
  type ItemView,
  parseDollars,
  type PricingModel,
  unsyncedCount,
  type VendorStatus,
  type VendorView,
} from "./vendor-view";

const pricingLabel: Record<PricingModel, string> = {
  consignment: "Consignment",
  wholesale: "Wholesale",
};

const pricingBadge: Record<PricingModel, string> = {
  consignment: "badge-soft/accent",
  wholesale: "badge-soft/primary",
};

export function VendorWorkspace({
  vendors: initialVendors,
}: {
  vendors: VendorView[];
}) {
  const [vendors, setVendors] = useState<VendorView[]>(initialVendors);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | VendorStatus>("all");

  const editing = vendors.find((v) => v.id === editingId) ?? null;
  const shown = vendors.filter((v) => filter === "all" || v.status === filter);
  const activeCount = vendors.filter((v) => v.status === "active").length;

  function updateVendor(id: string, patch: Partial<VendorView>) {
    setVendors((prev) =>
      prev.map((v) =>
        v.id === id ? { ...v, ...patch, updatedAt: "just now" } : v,
      ),
    );
  }

  function addVendor() {
    const draft = blankVendor();
    setVendors((prev) => [draft, ...prev]);
    setEditingId(draft.id);
  }

  function toggleStatus(id: string) {
    setVendors((prev) =>
      prev.map((v) =>
        v.id === id ?
          {
            ...v,
            status: v.status === "active" ? "inactive" : "active",
            updatedAt: "just now",
          }
        : v,
      ),
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-surface-50 text-on-surface-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-on-surface-50/60">
            {activeCount} active · {vendors.length} total
          </p>
          <div className="flex items-center gap-3">
            <div className="flex overflow-hidden rounded-md border border-secondary-500/20 text-sm">
              {(["all", "active", "inactive"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`px-3 py-1.5 font-subheading capitalize ${
                    filter === key ?
                      "bg-secondary-500 text-on-secondary-500"
                    : "text-on-surface-50/70 hover:bg-secondary-500/5"
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={addVendor}
              className="btn-solid/primary font-subheading text-sm"
            >
              + Add vendor
            </button>
          </div>
        </div>

        <section className="mt-6 overflow-hidden rounded-lg border border-secondary-500/15">
          {/* Desktop table */}
          <table className="hidden w-full text-left text-sm sm:table">
            <thead className="bg-secondary-500/5 font-subheading text-xs uppercase tracking-wide text-on-surface-50/55">
              <tr>
                <th className="px-4 py-2.5 font-medium">Vendor</th>
                <th className="px-4 py-2.5 font-medium">Tags</th>
                <th className="px-4 py-2.5 font-medium">Pricing</th>
                <th className="px-4 py-2.5 font-medium">Items</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-secondary-500/10">
              {shown.map((v) => {
                const unsynced = unsyncedCount(v);
                return (
                  <tr
                    key={v.id}
                    className="group cursor-pointer hover:bg-secondary-500/5"
                    onClick={() => setEditingId(v.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-subheading font-semibold text-ink">
                        {v.name || "Untitled vendor"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-on-surface-50/75">
                      {v.tags || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`${pricingBadge[v.pricingModel]} font-subheading font-semibold`}
                      >
                        {pricingLabel[v.pricingModel]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="tabular-nums text-on-surface-50/75">
                        {
                          v.items.filter((i) => i.syncState !== "removed")
                            .length
                        }
                      </span>
                      {unsynced > 0 && (
                        <span className="ml-2 rounded-full bg-accent-500/20 px-2 py-0.5 font-subheading text-[10px] font-semibold uppercase tracking-wide text-accent-700">
                          {unsynced} unsynced
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={statusBadge[v.status]}>{v.status}</span>
                    </td>
                    <td
                      className="px-4 py-3 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex justify-end gap-2 opacity-60 transition group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => setEditingId(v.id)}
                          className="rounded-md border border-secondary-500/25 px-2.5 py-1 font-subheading text-xs text-on-surface-50/80 hover:bg-secondary-500/5"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleStatus(v.id)}
                          className="rounded-md border border-secondary-500/25 px-2.5 py-1 font-subheading text-xs text-on-surface-50/80 hover:bg-secondary-500/5"
                        >
                          {v.status === "active" ? "Deactivate" : "Reactivate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Mobile list */}
          <ul className="divide-y divide-secondary-500/10 sm:hidden">
            {shown.map((v) => {
              const unsynced = unsyncedCount(v);
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => setEditingId(v.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary-500/5"
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-heading text-sm font-bold ${
                        v.status === "inactive" ?
                          "bg-secondary-500/10 text-on-surface-50/50"
                        : "bg-primary-500/15 text-primary-700"
                      }`}
                    >
                      {(v.name || "??").slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-subheading text-sm font-semibold text-ink">
                        {v.name || "Untitled vendor"}
                      </span>
                      <span className="mt-1 flex items-center gap-2">
                        <span
                          className={`${pricingBadge[v.pricingModel]} font-subheading font-semibold`}
                        >
                          {pricingLabel[v.pricingModel]}
                        </span>
                        <span className="text-xs text-on-surface-50/55">
                          {
                            v.items.filter((i) => i.syncState !== "removed")
                              .length
                          }{" "}
                          items
                        </span>
                      </span>
                    </span>
                    {unsynced > 0 && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-accent-500" />
                    )}
                    <span className={statusBadge[v.status]}>{v.status}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {editing && (
        <VendorSlideOver
          key={editing.id}
          vendor={editing}
          onClose={() => setEditingId(null)}
          onChange={(patch) => updateVendor(editing.id, patch)}
        />
      )}
    </div>
  );
}

const statusBadge: Record<VendorStatus, string> = {
  active: "badge-soft/success",
  inactive: "badge-soft/surface",
};

function VendorSlideOver({
  vendor,
  onClose,
  onChange,
}: {
  vendor: VendorView;
  onClose: () => void;
  onChange: (patch: Partial<VendorView>) => void;
}) {
  const unsynced = unsyncedCount(vendor);
  const active = vendor.status === "active";

  // Lock the page scroll while the slide-over is open, compensating for the
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

  function setItem(id: string, patch: Partial<ItemView>) {
    onChange({
      items: vendor.items.map((item) =>
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
    onChange({ items: [...vendor.items, blankItem()] });
  }

  function removeItem(id: string) {
    const item = vendor.items.find((i) => i.id === id);
    if (!item) return;
    if (item.syncState === "new") {
      onChange({ items: vendor.items.filter((i) => i.id !== id) });
    } else {
      onChange({
        items: vendor.items.map((i) =>
          i.id === id ? { ...i, syncState: "removed" } : i,
        ),
      });
    }
  }

  function restoreItem(id: string) {
    onChange({
      items: vendor.items.map((i) =>
        i.id === id ?
          { ...i, syncState: i.cloverItemId ? "edited" : "new" }
        : i,
      ),
    });
  }

  function syncToClover() {
    onChange({
      items: vendor.items
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
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />
      <aside className="palette-surface relative flex h-full w-full max-w-2xl animate-[slideIn_.25s_ease-out] flex-col bg-surface-50 shadow-2xl">
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-secondary-500/15 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
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
              onClick={onClose}
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
          onChange={(e) =>
            onChange({ priceCents: parseDollars(e.target.value) })
          }
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
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-2"
    >
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

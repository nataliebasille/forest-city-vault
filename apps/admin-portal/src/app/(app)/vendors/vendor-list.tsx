"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type PricingModel,
  unsyncedCount,
  type VendorStatus,
} from "./vendor-view";
import { useVendors } from "./vendors-context";

const pricingLabel: Record<PricingModel, string> = {
  consignment: "Consignment",
  wholesale: "Wholesale",
};

const pricingBadge: Record<PricingModel, string> = {
  consignment: "badge-soft/accent",
  wholesale: "badge-soft/primary",
};

const statusBadge: Record<VendorStatus, string> = {
  active: "badge-soft/success",
  inactive: "badge-soft/surface",
};

/**
 * The vendor roster: a desktop table and a mobile list, with a status filter and
 * an "add vendor" action. It renders behind the add/edit slide-over and stays
 * mounted across sub-route navigation, so filter and local edits persist. Opening
 * a vendor navigates (`/vendors/[id]`) rather than toggling local state, so the
 * URL reflects what's open; status changes mutate the shared store in place.
 */
export function VendorList() {
  const { vendors, filter, setFilter, toggleStatus } = useVendors();
  const router = useRouter();

  const shown = vendors.filter((v) => filter === "all" || v.status === filter);
  const activeCount = vendors.filter((v) => v.status === "active").length;

  return (
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
          <Link
            href="/vendors/new"
            className="btn-solid/primary font-subheading text-sm"
          >
            + Add vendor
          </Link>
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
                  onClick={() => router.push(`/vendors/${v.id}`)}
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
                      {v.items.filter((i) => i.syncState !== "removed").length}
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
                      <Link
                        href={`/vendors/${v.id}`}
                        className="rounded-md border border-secondary-500/25 px-2.5 py-1 font-subheading text-xs text-on-surface-50/80 hover:bg-secondary-500/5"
                      >
                        Edit
                      </Link>
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
                <Link
                  href={`/vendors/${v.id}`}
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
                        {v.items.filter((i) => i.syncState !== "removed").length}{" "}
                        items
                      </span>
                    </span>
                  </span>
                  {unsynced > 0 && (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-accent-500" />
                  )}
                  <span className={statusBadge[v.status]}>{v.status}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

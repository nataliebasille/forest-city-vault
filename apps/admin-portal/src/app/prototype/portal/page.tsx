// PROTOTYPE — throwaway. Host route for the chosen logged-in admin-portal design
// exploration (Variant B, "Sidebar workspace"), kept for reference during future
// development. This is a *public* route rendering stub data on purpose: the real
// logged-in home ("/") is auth-gated behind a live session + database,
// which isn't available in a bare checkout, so the fully-fleshed design lives
// here. Delete this whole `prototype/` folder once the real portal has caught up.

import { VariantB } from "./variant-b";

export const dynamic = "force-dynamic";

export default function PrototypePortalPage() {
  return (
    <div className="palette-surface min-h-screen bg-surface-50 text-on-surface-50">
      <VariantB />
    </div>
  );
}


"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import {
  NavVariantA,
  NavVariantB,
  NavVariantC,
  variantAName,
  variantBName,
  variantCName,
} from "./nav-variants";
import {
  metrics,
  navItems,
  owner,
  recentSales,
  store,
} from "./stub-data";

const VARIANTS = [
  { key: "A", name: variantAName, Nav: NavVariantA },
  { key: "B", name: variantBName, Nav: NavVariantB },
  { key: "C", name: variantCName, Nav: NavVariantC },
] as const;

type VariantKey = "A" | "B" | "C";

export default function PrototypePortalPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawVariant = searchParams.get("variant")?.toUpperCase() as VariantKey | null;
  const variantKey: VariantKey = rawVariant && ["A", "B", "C"].includes(rawVariant) ? rawVariant : "A";
  const variantIdx = VARIANTS.findIndex((v) => v.key === variantKey);
  const { Nav, name } = VARIANTS[variantIdx];

  function goTo(key: string) {
    router.replace(`?variant=${key}`);
  }

  function cyclePrev() {
    const prev = VARIANTS[(variantIdx - 1 + VARIANTS.length) % VARIANTS.length];
    goTo(prev.key);
  }

  function cycleNext() {
    const next = VARIANTS[(variantIdx + 1) % VARIANTS.length];
    goTo(next.key);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === "ArrowLeft") cyclePrev();
      if (e.key === "ArrowRight") cycleNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const saleStatus: Record<string, string> = {
    completed: "badge-soft/success",
    refunded: "badge-soft/danger",
    pending: "badge-soft/accent",
  };

  return (
    <div className="flex min-h-screen bg-surface-50 text-on-surface-50">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-secondary-500 text-on-secondary-500 md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-500 font-heading text-sm font-bold text-on-primary-500">
            FV
          </span>
          <span className="font-heading text-base font-semibold">
            {store.name}
          </span>
        </div>

        <Nav items={navItems} activeKey="dashboard" />

        <div className="border-t border-white/10 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-500 font-subheading text-sm font-semibold text-on-primary-500">
              {owner.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate font-subheading text-sm font-semibold">{owner.name}</div>
              <div className="truncate text-xs text-on-secondary-500/60">{owner.email}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-secondary-500/15 px-8 py-4">
          <div>
            <h1 className="font-heading text-2xl font-semibold text-ink">Dashboard</h1>
            <p className="text-sm text-on-surface-50/60">{store.name} · {store.timeZone}</p>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-6 px-8 py-6">
          <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-secondary-500/15 bg-secondary-500/15 sm:grid-cols-3 lg:grid-cols-6">
            {metrics.map((m) => (
              <div key={m.key} className="flex flex-col gap-0.5 bg-surface-50 px-4 py-3">
                <span className="font-subheading text-[11px] font-medium uppercase tracking-wide text-on-surface-50/55">
                  {m.label}
                </span>
                <span className="font-heading text-xl font-semibold text-ink">{m.value}</span>
                <span className="text-[11px] text-on-surface-50/50">{m.delta}</span>
              </div>
            ))}
          </section>

          <section className="overflow-hidden rounded-lg border border-secondary-500/15">
            <div className="flex items-center justify-between border-b border-secondary-500/15 px-4 py-3">
              <h2 className="font-heading text-base font-semibold text-ink">Recent sales</h2>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-secondary-500/5 font-subheading text-xs uppercase tracking-wide text-on-surface-50/55">
                <tr>
                  <th className="px-4 py-2 font-medium">Sale</th>
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 font-medium">Vendor</th>
                  <th className="px-4 py-2 font-medium">Time</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary-500/10">
                {recentSales.map((s) => (
                  <tr key={s.id} className="hover:bg-secondary-500/5">
                    <td className="px-4 py-2.5 font-mono text-xs text-on-surface-50/60">{s.id}</td>
                    <td className="px-4 py-2.5 font-subheading font-medium text-ink">{s.summary}</td>
                    <td className="px-4 py-2.5 text-on-surface-50/75">{s.vendor}</td>
                    <td className="px-4 py-2.5 text-on-surface-50/60">{s.time}</td>
                    <td className="px-4 py-2.5"><span className={saleStatus[s.status]}>{s.status}</span></td>
                    <td className="px-4 py-2.5 text-right font-subheading font-semibold text-ink">{s.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </main>
      </div>

      {/* Floating variant switcher */}
      <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-gray-900/95 px-2 py-1.5 text-white shadow-xl ring-1 ring-white/10 backdrop-blur">
        <button
          type="button"
          onClick={cyclePrev}
          className="flex h-7 w-7 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
          aria-label="Previous variant"
        >
          ←
        </button>
        <div className="px-3 text-center font-mono text-xs leading-none">
          <span className="text-white/50">Variant </span>
          <span className="font-bold text-white">{variantKey}</span>
          <span className="mx-1 text-white/30">—</span>
          <span className="text-white/80">{name}</span>
        </div>
        <button
          type="button"
          onClick={cycleNext}
          className="flex h-7 w-7 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
          aria-label="Next variant"
        >
          →
        </button>
      </div>
    </div>
  );
}


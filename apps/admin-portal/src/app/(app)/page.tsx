import { privatePage } from "@/runtime";
import { Effect } from "effect";

// The auth gate reads request cookies and the database per request, so this page
// must render dynamically (never statically prerendered at build time).
export const dynamic = "force-dynamic";

export default privatePage("admin-dashboard", () =>
  Effect.gen(function* () {
    return (
      <div className="flex flex-1 flex-col">
        <header className="hidden h-[var(--shell-header-h)] items-center justify-between gap-4 border-b border-ink/10 px-6 md:flex md:px-8">
          <h1 className="font-heading font-semibold text-ink">Dashboard</h1>
        </header>

        <main className="flex flex-1 flex-col px-6 py-6 md:px-8">
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-ink/20 px-6 py-20 text-center">
            <div className="flex max-w-sm flex-col items-center gap-2">
              <h2 className="font-heading text-xl font-semibold text-ink">
                Nothing here yet
              </h2>
              <p className="font-body text-sm/6 text-ink/60">
                Your dashboard is taking shape. Metrics and activity will appear
                in this space as features come online.
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  }),
);

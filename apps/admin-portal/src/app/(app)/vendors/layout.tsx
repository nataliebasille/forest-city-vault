import { privatePage } from "@/runtime";
import { Effect } from "effect";
import { VendorList } from "./vendor-list";
import { VendorsProvider } from "./vendors-context";
import { vendorsList } from "./vendors-list";
import { toVendorViews } from "./vendors-list-view";

// The auth gate reads request cookies and the database per request, so this
// segment must render dynamically (never statically prerendered at build time).
export const dynamic = "force-dynamic";

/**
 * Chrome for the vendor management area. Loads the vendor roster once (wired to
 * the real `Vendor` read model) and hosts the {@link VendorsProvider} client
 * store, then renders the {@link VendorList} with each sub-route's slide-over
 * (`{children}`) layered over it. Living in the layout keeps the list and its
 * local, not-yet-persisted edits mounted while the URL moves between the roster,
 * the add route, and each edit route.
 */
export default privatePage(
  "vendors",
  ({ children }: { children: React.ReactNode }) =>
    Effect.gen(function* () {
      const rows = yield* vendorsList;
      const vendors = toVendorViews(rows);

      return (
        <div className="flex flex-1 flex-col">
          <header className="hidden h-[var(--shell-header-h)] items-center border-b border-ink/10 px-6 md:flex md:px-8">
            <h1 className="font-heading font-semibold text-ink">Vendors</h1>
          </header>
          <VendorsProvider initial={vendors}>
            <div className="flex flex-1 flex-col bg-surface-50 text-on-surface-50">
              <VendorList />
              {children}
            </div>
          </VendorsProvider>
        </div>
      );
    }),
);

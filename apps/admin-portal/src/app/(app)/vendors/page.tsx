import { privatePage } from "@/runtime";
import { Effect } from "effect";
import { VendorWorkspace } from "./vendor-workspace";
import { vendorsList } from "./vendors-list";
import { toVendorViews } from "./vendors-list-view";

// The auth gate reads request cookies and the database per request, so this page
// must render dynamically (never statically prerendered at build time).
export const dynamic = "force-dynamic";

/**
 * The vendor management page: a roster of every vendor with a slide-over editor
 * built around each vendor's items. Displaying data is wired to the real
 * `Vendor` read model; the editor's mutations are not persisted yet.
 */
export default privatePage("vendors", () =>
  Effect.gen(function* () {
    const rows = yield* vendorsList;
    const vendors = toVendorViews(rows);

    return (
      <div className="flex flex-1 flex-col">
        <header className="hidden h-[var(--shell-header-h)] items-center border-b border-ink/10 px-6 md:flex md:px-8">
          <h1 className="font-heading font-semibold text-ink">Vendors</h1>
        </header>
        <VendorWorkspace vendors={vendors} />
      </div>
    );
  }),
);

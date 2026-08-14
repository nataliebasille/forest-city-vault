import { privatePage } from "@/runtime";
import { Effect } from "effect";
import { VendorSlideOver } from "../vendor-slide-over";

// The auth gate reads request cookies per request, so this route must render
// dynamically (never statically prerendered at build time).
export const dynamic = "force-dynamic";

/**
 * The `/vendors/[vendorId]` route: opens the slide-over to edit one vendor. It
 * only threads the route's `vendorId` to the client panel, which reads that
 * vendor from the shared store the layout populated; an unknown id redirects back
 * to the roster from within the panel.
 */
export default privatePage(
  "vendor-edit",
  ({ params }: { params: Promise<{ vendorId: string }> }) =>
    Effect.gen(function* () {
      const { vendorId } = yield* Effect.promise(() => params);
      return <VendorSlideOver vendorId={vendorId} />;
    }),
);

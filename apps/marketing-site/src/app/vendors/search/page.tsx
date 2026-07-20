import { permanentRedirect } from "next/navigation";

/**
 * Legacy compatibility shim. Vendor browsing and search now live on the single
 * `/vendors` route (`/vendors?q=…`); this preserves any shared or bookmarked
 * `/vendors/search?q=…` links by redirecting them to the unified directory.
 */
export default async function VendorsSearchRedirect({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : (q ?? "")).trim();
  permanentRedirect(
    query ? `/vendors?q=${encodeURIComponent(query)}` : "/vendors",
  );
}

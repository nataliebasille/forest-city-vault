// PROTOTYPE — throwaway. Host route for the chosen logged-in admin-portal design
// exploration (Variant B, "Sidebar workspace"), kept for reference during future
// development. This is a *public* route rendering stub data on purpose: the real
// logged-in home ("/") is auth-gated behind a live Supabase session + database,
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

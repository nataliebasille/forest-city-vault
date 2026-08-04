import { CurrentUser } from "@/lib/auth";
import { privatePage } from "@/runtime";
import { Effect } from "effect";
import { AppShell } from "./app-shell";

// The shell reads the signed-in owner (per request, from cookies + database), so
// this layout must render dynamically and never be statically prerendered.
export const dynamic = "force-dynamic";

/**
 * Chrome for the authenticated portal. Resolves the signed-in owner via the same
 * `privatePage` gate the pages use (an unauthorized visitor is redirected to
 * `/login` before any child renders) and wraps every page in this route group in
 * the {@link AppShell}, handing it the owner's account for the sidebar footer.
 */
export default privatePage(
  "admin-layout",
  ({ children }: { children: React.ReactNode }) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;

      return (
        <AppShell account={{ email: user.email, role: user.role }}>
          {children}
        </AppShell>
      );
    }),
);

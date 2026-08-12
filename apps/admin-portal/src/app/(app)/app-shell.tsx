import { headers } from "next/headers";
import { MobileNavigation } from "./mobile-navigation";
import { SidebarContent } from "./sidebar-content";

/**
 * The authenticated portal shell: a persistent left sidebar beside the page
 * content. This outer shell is a Server Component that owns the overall layout —
 * the desktop sidebar (always in the flow at `md+`) and the main content column
 * that renders each page's `children`.
 *
 * The mobile-only interactive behaviour — the off-canvas drawer, its overlay, and
 * the top-bar menu toggle — is isolated in the {@link MobileNavigation} client
 * component. The sidebar itself stays server code: the same {@link SidebarContent}
 * is rendered directly into the desktop sidebar and handed to
 * {@link MobileNavigation} as a server-rendered slot, so the shared branding,
 * navigation, and account/sign-out never cross into client code.
 */
export async function AppShell({
  account,
  children,
}: {
  account: { email: string; role: string };
  children: React.ReactNode;
}) {
  const pathname = (await headers()).get("x-pathname") ?? "/";
  return (
    <div className="flex min-h-screen bg-[var(--shell-content-bg)]">
      {/* Desktop sidebar — permanently in the flow at md+ */}
      <aside className="hidden w-64 shrink-0 flex-col bg-secondary-500 text-on-secondary-500 md:flex">
        <SidebarContent account={account} pathname={pathname} />
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNavigation sidebar={<SidebarContent account={account} pathname={pathname} />} />
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}

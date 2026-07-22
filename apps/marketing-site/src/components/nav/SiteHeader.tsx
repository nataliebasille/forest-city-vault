import Image from "next/image";
import Link from "next/link";
import { MobileNav } from "./MobileNav";
import { DesktopNav } from "./DesktopNav";

/**
 * Shared sticky marketing header: branding, desktop navigation, and the mobile
 * drawer. Rendered on the homepage and the vendor directory so navigation stays
 * consistent across the site. Navigation content lives in {@link NAV_ITEMS}.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-on-secondary-500/10 bg-secondary-500/95 text-on-secondary-500 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6 md:h-20 md:px-10">
        <Link
          href="/"
          aria-label="Forest City Vault home"
          className="flex items-center gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-on-secondary-500"
        >
          <Image
            src="/branding/fcv-monogram reverse.png"
            alt="Forest City Vault logo"
            width={1152}
            height={768}
            priority
            className="h-auto max-h-10 w-16 md:hidden"
          />
          <Image
            src="/branding/primary logo no tag reverse.png"
            alt="Forest City Vault logo"
            width={994}
            height={768}
            priority
            className="hidden h-auto max-h-12 w-28 md:inline-block md:w-32"
          />
        </Link>
        <DesktopNav />
        <MobileNav />
      </div>
    </header>
  );
}

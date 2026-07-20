import Link from "next/link";
import { NAV_ITEMS } from "./nav";

/**
 * Desktop primary navigation. Hidden below `md`; the mobile drawer
 * ({@link MobileNav}) takes over there. Reads the shared {@link NAV_ITEMS} so it
 * stays in lockstep with the drawer.
 */
export function DesktopNav() {
  return (
    <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
      {NAV_ITEMS.map((item) => {
        const externalProps =
          item.external ? { target: "_blank", rel: "noreferrer" } : {};

        if (item.cta) {
          return (
            <Link
              key={item.label}
              href={item.href}
              {...externalProps}
              className="btn btn-solid/primary font-subheading text-sm font-semibold text-current"
            >
              {item.label}
            </Link>
          );
        }

        return (
          <Link
            key={item.label}
            href={item.href}
            {...externalProps}
            className="nav-link font-subheading text-sm font-medium text-surface-50"
          >
            <span className="nav-underline">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

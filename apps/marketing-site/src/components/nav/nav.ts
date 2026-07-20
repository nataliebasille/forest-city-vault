/** Google Maps link for the physical Ohio City storefront. */
export const MAP_URL =
  "https://maps.google.com/?q=2808+Church+Ave,+Cleveland,+OH+44113";

export type NavItem = {
  label: string;
  href: string;
  /** Opens in a new tab with `rel="noreferrer"`. */
  external?: boolean;
  /** Rendered as the primary call-to-action button. */
  cta?: boolean;
};

/**
 * Single source of truth for the marketing site's primary navigation, shared by
 * the desktop nav and the mobile drawer so the two never drift.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Shop vendors", href: "/vendors" },
  { label: "Visit the store", href: MAP_URL, external: true },
  { label: "Become a vendor", href: "/become-a-vendor", cta: true },
];

/**
 * Single source of truth for the legal/business details shown on the Privacy
 * Policy and EULA pages. Update these values (especially `contactEmail`) to the
 * real business details before publishing.
 */
export const COMPANY = {
  /** Public-facing business name. */
  name: "Forest City Vault",
  /** Physical storefront address. */
  address: "2808 Church Ave, Cleveland, OH 44113",
  /** Contact address for privacy / legal inquiries. Update before publishing. */
  contactEmail: "samantha@forestcityvault.com",
  /** State whose law governs the terms. */
  governingState: "Ohio",
  governingCountry: "United States",
} as const;

/**
 * Formatted "Last updated" date shown at the top of each legal document, kept in
 * one place so both pages stay in sync when the policies change.
 */
export const LEGAL_LAST_UPDATED = "August 2, 2026";

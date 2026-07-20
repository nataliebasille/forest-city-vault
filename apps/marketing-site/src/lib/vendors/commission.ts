/**
 * Consignment commission structure for Forest City Vault, kept in one place so
 * the marketing copy stays consistent and mirrors the data model
 * (`vendors.defaultVendorShare` defaults to 6000 bps = 60% to the vendor).
 */
export type CommissionTier = {
  /** Short label, e.g. "Standard". */
  label: string;
  /** Percentage the vendor keeps of each sale. */
  vendorShare: number;
  /** Percentage the store keeps of each sale. */
  storeShare: number;
  /** One-line description of the tier. */
  description: string;
  /** Requirement to unlock the tier, if any. */
  requirement?: string;
  /**
   * Short, reassuring note about the commitment level for this tier (e.g.
   * whether it's automatic or opt-in), used to lower application friction.
   */
  note?: string;
  /** Highlight this tier as the best/recommended split. */
  featured?: boolean;
};

export const COMMISSION_TIERS: readonly CommissionTier[] = [
  {
    label: "Standard",
    vendorShare: 60,
    storeShare: 40,
    description:
      "Our default consignment split for every vendor in the Vault. List your pieces, we sell them, you get paid.",
    note: "Automatic for every vendor, with nothing to sign up for.",
  },
  {
    label: "Working vendor",
    vendorShare: 70,
    storeShare: 30,
    description:
      "Prefer a bigger cut? Lend a hand around the store and your split bumps up, a reward for helping the community thrive.",
    requirement: "Work the store at least once a month",
    note: "Completely optional. Opt in whenever you're ready, or never.",
    featured: true,
  },
] as const;

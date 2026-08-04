// PROTOTYPE — throwaway. In-memory stub data for the logged-in admin-portal
// design explorations. No persistence, no real queries. Delete with the rest of
// the /prototype/portal route once a direction is chosen.

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Format integer cents as USD, e.g. 128450 -> "$1,284.50". */
export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

export const owner = {
  name: "Marta Ellison",
  email: "marta@forestcityvault.com",
  role: "Owner",
} as const;

export const store = {
  name: "Forest City Vault",
  status: "active",
  timeZone: "America/New_York",
  currency: "USD",
} as const;

export type Metric = {
  key: string;
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down" | "flat";
  hint: string;
};

export const metrics: Metric[] = [
  {
    key: "sales-today",
    label: "Sales today",
    value: "38",
    delta: "+12%",
    trend: "up",
    hint: "vs. same day last week",
  },
  {
    key: "revenue-today",
    label: "Revenue today",
    value: formatCents(214860),
    delta: "+8.4%",
    trend: "up",
    hint: "gross, before payouts",
  },
  {
    key: "revenue-week",
    label: "Revenue this week",
    value: formatCents(1288740),
    delta: "+3.1%",
    trend: "up",
    hint: "Mon–today",
  },
  {
    key: "active-vendors",
    label: "Active vendors",
    value: "42",
    delta: "+2",
    trend: "up",
    hint: "3 new this month",
  },
  {
    key: "active-members",
    label: "Active members",
    value: "1,204",
    delta: "-6",
    trend: "down",
    hint: "18 renewals due",
  },
  {
    key: "pending-apps",
    label: "Vendor applications",
    value: "5",
    delta: "needs review",
    trend: "flat",
    hint: "awaiting approval",
  },
];

export type Sale = {
  id: string;
  time: string;
  summary: string;
  vendor: string;
  items: number;
  total: string;
  status: "completed" | "refunded" | "pending";
};

export const recentSales: Sale[] = [
  {
    id: "S-4821",
    time: "2:14 PM",
    summary: "Reclaimed oak side table",
    vendor: "Timberline Goods",
    items: 1,
    total: formatCents(24500),
    status: "completed",
  },
  {
    id: "S-4820",
    time: "1:58 PM",
    summary: "Vintage brass lamp + 2 more",
    vendor: "Harbor & Hearth",
    items: 3,
    total: formatCents(13120),
    status: "completed",
  },
  {
    id: "S-4819",
    time: "1:41 PM",
    summary: "Hand-poured soy candles",
    vendor: "Ember Lane",
    items: 4,
    total: formatCents(4800),
    status: "completed",
  },
  {
    id: "S-4818",
    time: "1:12 PM",
    summary: "Wool throw blanket",
    vendor: "North Field Textiles",
    items: 1,
    total: formatCents(8900),
    status: "refunded",
  },
  {
    id: "S-4817",
    time: "12:47 PM",
    summary: "Ceramic dinnerware set",
    vendor: "Kiln & Co.",
    items: 1,
    total: formatCents(16800),
    status: "completed",
  },
  {
    id: "S-4816",
    time: "12:20 PM",
    summary: "Cold brew concentrate + mug",
    vendor: "Ember Lane",
    items: 2,
    total: formatCents(3650),
    status: "pending",
  },
];

export type Vendor = {
  name: string;
  category: string;
  salesWeek: number;
  revenue: string;
  status: "active" | "onboarding" | "paused";
};

export const topVendors: Vendor[] = [
  {
    name: "Timberline Goods",
    category: "Furniture",
    salesWeek: 47,
    revenue: formatCents(412300),
    status: "active",
  },
  {
    name: "Ember Lane",
    category: "Home fragrance",
    salesWeek: 129,
    revenue: formatCents(238950),
    status: "active",
  },
  {
    name: "Kiln & Co.",
    category: "Ceramics",
    salesWeek: 63,
    revenue: formatCents(191200),
    status: "active",
  },
  {
    name: "North Field Textiles",
    category: "Textiles",
    salesWeek: 38,
    revenue: formatCents(142600),
    status: "paused",
  },
  {
    name: "Harbor & Hearth",
    category: "Decor",
    salesWeek: 51,
    revenue: formatCents(133400),
    status: "onboarding",
  },
];

export type Attention = {
  id: string;
  kind: "application" | "dispute" | "renewal" | "payout";
  title: string;
  detail: string;
  cta: string;
  severity: "high" | "medium" | "low";
};

export const attention: Attention[] = [
  {
    id: "att-1",
    kind: "application",
    title: "5 vendor applications waiting",
    detail:
      "Harbor & Hearth and 4 others submitted booth applications. Oldest is 6 days old.",
    cta: "Review applications",
    severity: "high",
  },
  {
    id: "att-2",
    kind: "dispute",
    title: "Refund dispute on sale S-4818",
    detail:
      "North Field Textiles flagged a $89.00 wool throw refund as issued in error.",
    cta: "Open dispute",
    severity: "high",
  },
  {
    id: "att-3",
    kind: "renewal",
    title: "18 memberships renew this week",
    detail:
      "6 are set to lapse without auto-renew. Last reminder sent 4 days ago.",
    cta: "Send renewal nudge",
    severity: "medium",
  },
  {
    id: "att-4",
    kind: "payout",
    title: "Weekly vendor payouts ready",
    detail: `${formatCents(1288740)} across 42 vendors is queued for Friday's run.`,
    cta: "Review payout run",
    severity: "low",
  },
];

export const navItems = [
  { key: "dashboard", label: "Dashboard", icon: "◧" },
  { key: "sales", label: "Sales", icon: "◈" },
  { key: "vendors", label: "Vendors", icon: "◇" },
  { key: "members", label: "Members", icon: "◎" },
  { key: "payouts", label: "Payouts", icon: "◐" },
  { key: "settings", label: "Store settings", icon: "⚙" },
] as const;

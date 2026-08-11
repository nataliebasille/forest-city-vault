import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { RecentSale } from "./recent-sales";
import { toRecentSaleRows } from "./recent-sales-view";

const BASE: RecentSale = {
  id: "01920000-0000-7000-8000-0000000abc01",
  occurredAt: new Date("2024-06-01T18:14:00.000Z"),
  totalCents: 24500,
  timeZone: "America/New_York",
  items: [
    {
      name: "Reclaimed oak side table",
      vendorName: "Timberline Goods",
      amountCents: 24500,
    },
  ],
};

function row(
  overrides: Partial<RecentSale> = {},
  now: Date = new Date("2024-06-01T23:00:00.000Z"),
) {
  return toRecentSaleRows([{ ...BASE, ...overrides }], now)[0];
}

describe("toRecentSaleRows", () => {
  test("shortens the sale id into a reference", () => {
    assert.equal(row().reference, "#0ABC01");
  });

  test("formats the total as USD", () => {
    assert.equal(row({ totalCents: 24500 }).total, "$245.00");
    assert.equal(row({ totalCents: 3650 }).total, "$36.50");
  });

  test("formats the time in the sale's store time zone", () => {
    // 18:14 UTC is 2:14 PM in America/New_York (EDT, UTC-4).
    assert.equal(
      row({}, new Date("2024-06-01T23:00:00.000Z")).time,
      "Today, 2:14 PM",
    );
    // The same instant is 11:14 AM on the US west coast.
    assert.equal(
      row(
        { timeZone: "America/Los_Angeles" },
        new Date("2024-06-01T23:00:00.000Z"),
      ).time,
      "Today, 11:14 AM",
    );
  });

  test("labels a sale on the current local day 'Today'", () => {
    // Still June 1 in New York when now is 7 PM local that day.
    assert.equal(
      row({}, new Date("2024-06-01T23:00:00.000Z")).time,
      "Today, 2:14 PM",
    );
  });

  test("labels a sale on the previous local day 'Yesterday'", () => {
    // Now is June 2 local; the sale is one calendar day earlier.
    assert.equal(
      row({}, new Date("2024-06-02T18:00:00.000Z")).time,
      "Yesterday, 2:14 PM",
    );
  });

  test("labels a sale earlier in the past week by weekday", () => {
    // June 1 2024 is a Saturday; now is June 4 (three days later).
    assert.equal(
      row({}, new Date("2024-06-04T18:00:00.000Z")).time,
      "Saturday, 2:14 PM",
    );
  });

  test("labels a sale older than a week by its date, dropping the current year", () => {
    // More than six days back, same year as now → "Jun 1".
    assert.equal(
      row({}, new Date("2024-06-20T18:00:00.000Z")).time,
      "Jun 1, 2:14 PM",
    );
  });

  test("carries the year when an older sale falls outside now's year", () => {
    assert.equal(
      row({}, new Date("2025-01-10T18:00:00.000Z")).time,
      "Jun 1, 2024, 2:14 PM",
    );
  });

  test("shows the lead item alone for a single-item sale", () => {
    assert.equal(
      row({ items: [item("Wool throw blanket")] }).item,
      "Wool throw blanket",
    );
  });

  test("appends '+ N more' for a multi-item sale, counting from the lead", () => {
    assert.equal(
      row({
        items: [
          item("Vintage brass lamp"),
          item("Ceramic mug"),
          item("Enamel pin"),
        ],
      }).item,
      "Vintage brass lamp + 2 more",
    );
  });

  test("shows an em dash when a sale has no line items", () => {
    assert.equal(row({ items: [] }).item, "—");
  });

  test("groups the breakdown items under each vendor, lead vendor first", () => {
    assert.deepEqual(
      row({
        items: [
          item("Vintage brass lamp", "Birch & Co.", 6000),
          item("Ceramic mug", "Aspen Woodworks", 2500),
          item("Enamel pin", "Aspen Woodworks", 1200),
        ],
      }).vendorGroups,
      [
        {
          vendor: "Birch & Co.",
          items: [{ name: "Vintage brass lamp", price: "$60.00" }],
        },
        {
          vendor: "Aspen Woodworks",
          items: [
            { name: "Ceramic mug", price: "$25.00" },
            { name: "Enamel pin", price: "$12.00" },
          ],
        },
      ],
    );
  });

  test("groups items with no vendor under a single 'Custom item' group", () => {
    assert.deepEqual(
      row({
        items: [
          item("Hand-thrown vase", null, 3000),
          item("Soy candle", null, 1200),
        ],
      }).vendorGroups,
      [
        {
          vendor: "Custom item",
          items: [
            { name: "Hand-thrown vase", price: "$30.00" },
            { name: "Soy candle", price: "$12.00" },
          ],
        },
      ],
    );
  });

  test("has no vendor groups when a sale has no line items", () => {
    assert.deepEqual(row({ items: [] }).vendorGroups, []);
  });

  test("carries the sale id through as the row key and preserves order", () => {
    const rows = toRecentSaleRows(
      [
        { ...BASE, id: "sale-a" },
        { ...BASE, id: "sale-b" },
      ],
      new Date("2024-06-01T23:00:00.000Z"),
    );
    assert.deepEqual(
      rows.map((r) => r.id),
      ["sale-a", "sale-b"],
    );
  });
});

function item(
  name: string,
  vendorName: string | null = "Timberline Goods",
  amountCents = 24500,
) {
  return { name, vendorName, amountCents };
}

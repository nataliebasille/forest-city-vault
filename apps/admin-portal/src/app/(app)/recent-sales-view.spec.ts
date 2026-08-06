import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { RecentSale } from "./recent-sales";
import { toRecentSaleRows } from "./recent-sales-view";

const BASE: RecentSale = {
  id: "01920000-0000-7000-8000-0000000abc01",
  occurredAt: new Date("2024-06-01T18:14:00.000Z"),
  totalCents: 24500,
  timeZone: "America/New_York",
  leadItemName: "Reclaimed oak side table",
  itemCount: 1,
  vendorNames: ["Timberline Goods"],
};

function row(overrides: Partial<RecentSale> = {}) {
  return toRecentSaleRows([{ ...BASE, ...overrides }])[0];
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
    assert.equal(row().time, "2:14 PM");
    // The same instant is 11:14 AM on the US west coast.
    assert.equal(row({ timeZone: "America/Los_Angeles" }).time, "11:14 AM");
  });

  test("shows the lead item alone for a single-item sale", () => {
    assert.equal(
      row({ leadItemName: "Wool throw blanket", itemCount: 1 }).item,
      "Wool throw blanket",
    );
  });

  test("appends '+ N more' for a multi-item sale", () => {
    assert.equal(
      row({ leadItemName: "Vintage brass lamp", itemCount: 3 }).item,
      "Vintage brass lamp + 2 more",
    );
  });

  test("shows an em dash when a sale has no line items", () => {
    assert.equal(row({ leadItemName: null, itemCount: 0 }).item, "—");
  });

  test("shows the single vendor name", () => {
    assert.equal(row({ vendorNames: ["Ember Lane"] }).vendor, "Ember Lane");
  });

  test("collapses several vendors into 'Multiple vendors'", () => {
    assert.equal(
      row({ vendorNames: ["Ember Lane", "Kiln & Co."] }).vendor,
      "Multiple vendors",
    );
  });

  test("shows an em dash when a sale has no linked vendor", () => {
    assert.equal(row({ vendorNames: [] }).vendor, "—");
  });

  test("carries the sale id through as the row key and preserves order", () => {
    const rows = toRecentSaleRows([
      { ...BASE, id: "sale-a" },
      { ...BASE, id: "sale-b" },
    ]);
    assert.deepEqual(
      rows.map((r) => r.id),
      ["sale-a", "sale-b"],
    );
  });
});

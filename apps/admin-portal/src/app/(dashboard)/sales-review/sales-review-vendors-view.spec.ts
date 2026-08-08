import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { VendorRollup } from "./sales-review-vendors";
import { toVendorRows } from "./sales-review-vendors-view";

const ROLLUPS: VendorRollup[] = [
  { name: "Timberline Goods", grossCents: 500000 },
  { name: "Ember Lane", grossCents: 250000 },
];

describe("toVendorRows", () => {
  test("assigns a 1-based rank in the given order", () => {
    assert.deepEqual(
      toVendorRows(ROLLUPS).map((row) => row.rank),
      [1, 2],
    );
  });

  test("carries the vendor name through unchanged", () => {
    assert.deepEqual(
      toVendorRows(ROLLUPS).map((row) => row.name),
      ["Timberline Goods", "Ember Lane"],
    );
  });

  test("formats gross as whole-dollar USD", () => {
    assert.deepEqual(
      toVendorRows(ROLLUPS).map((row) => row.grossCents),
      ["$5,000", "$2,500"],
    );
  });

  test("returns an empty list for no vendors", () => {
    assert.deepEqual(toVendorRows([]), []);
  });
});

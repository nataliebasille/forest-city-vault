import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { MonthRollup } from "./sales-review-history";
import { toMonthBars } from "./sales-review-history-view";

const MONTHS: MonthRollup[] = [
  { key: "2026-08", year: 2026, month: 8, grossCents: 400000, saleCount: 40 },
  { key: "2026-07", year: 2026, month: 7, grossCents: 200000, saleCount: 20 },
  { key: "2026-06", year: 2026, month: 6, grossCents: 0, saleCount: 0 },
];

describe("toMonthBars", () => {
  test("formats each month's full label", () => {
    assert.deepEqual(
      toMonthBars(MONTHS).map((bar) => bar.label),
      ["August 2026", "July 2026", "June 2026"],
    );
  });

  test("scales each bar's width relative to the highest-grossing month", () => {
    assert.deepEqual(
      toMonthBars(MONTHS).map((bar) => bar.widthPercent),
      [100, 50, 0],
    );
  });

  test("formats gross as whole-dollar USD", () => {
    assert.deepEqual(
      toMonthBars(MONTHS).map((bar) => bar.grossCents),
      ["$4,000", "$2,000", "$0"],
    );
  });

  test("carries sale count and key through unchanged", () => {
    const bars = toMonthBars(MONTHS);
    assert.equal(bars[0]?.saleCount, 40);
    assert.equal(bars[0]?.key, "2026-08");
  });

  test("does not divide by zero when every month has no sales", () => {
    const bars = toMonthBars([
      { key: "2026-08", year: 2026, month: 8, grossCents: 0, saleCount: 0 },
    ]);
    assert.deepEqual(
      bars.map((bar) => bar.widthPercent),
      [0],
    );
  });
});

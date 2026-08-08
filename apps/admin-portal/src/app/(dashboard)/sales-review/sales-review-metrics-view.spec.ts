import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { SalesReviewMetrics } from "./sales-review-metrics";
import {
  isPacingAhead,
  toCurrentMonthLabel,
  toCurrentMonthName,
  toPaceDeltaLabel,
  toPreviousMonthPaceLabel,
  toSalesReviewMetricTiles,
} from "./sales-review-metrics-view";

const BASE: SalesReviewMetrics = {
  monthToDateSaleCount: 40,
  monthToDateGrossCents: 400000,
  previousMonthPaceGrossCents: 350000,
  monthStartYear: 2026,
  monthStartMonth: 8,
};

function tiles(overrides: Partial<SalesReviewMetrics> = {}) {
  return toSalesReviewMetricTiles({ ...BASE, ...overrides });
}

describe("toSalesReviewMetricTiles", () => {
  test("renders exactly Gross, Sales, and Avg. sale tiles, in order", () => {
    assert.deepEqual(
      tiles().map((tile) => tile.key),
      ["gross", "sales", "avg"],
    );
  });

  test("formats the gross tile as whole-dollar USD", () => {
    assert.equal(tiles().find((t) => t.key === "gross")?.value, "$4,000");
  });

  test("computes a positive pace delta vs. the previous month's same-day window", () => {
    // 400000 / 350000 - 1 = +14.3%
    assert.equal(
      tiles().find((t) => t.key === "gross")?.delta,
      "+14.3% vs last month",
    );
  });

  test("computes a negative pace delta", () => {
    assert.equal(
      tiles({ monthToDateGrossCents: 300000 }).find((t) => t.key === "gross")
        ?.delta,
      "-14.3% vs last month",
    );
  });

  test("reports a zero pace delta when there is no previous-month figure", () => {
    assert.equal(
      tiles({ previousMonthPaceGrossCents: 0 }).find((t) => t.key === "gross")
        ?.delta,
      "0.0% vs last month",
    );
  });

  test("formats the sales count tile", () => {
    assert.equal(tiles().find((t) => t.key === "sales")?.value, "40");
  });

  test("computes the average sale from gross over sale count", () => {
    // 400000 / 40 = 10000 cents = $100.00
    assert.equal(tiles().find((t) => t.key === "avg")?.value, "$100.00");
  });

  test("does not divide by zero when there are no sales yet", () => {
    assert.equal(
      tiles({ monthToDateSaleCount: 0, monthToDateGrossCents: 0 }).find(
        (t) => t.key === "avg",
      )?.value,
      "$0.00",
    );
  });
});

describe("toCurrentMonthLabel", () => {
  test("formats the month and year", () => {
    assert.equal(toCurrentMonthLabel(BASE), "August 2026");
  });
});

describe("toCurrentMonthName", () => {
  test("formats the bare month name", () => {
    assert.equal(toCurrentMonthName(BASE), "August");
  });
});

describe("toPaceDeltaLabel", () => {
  test("matches the gross tile's delta text (without the trailing suffix)", () => {
    assert.equal(toPaceDeltaLabel(BASE), "+14.3%");
  });
});

describe("isPacingAhead", () => {
  test("is true when month-to-date gross beats the comparison window", () => {
    assert.equal(isPacingAhead(BASE), true);
  });

  test("is false when month-to-date gross trails the comparison window", () => {
    assert.equal(
      isPacingAhead({ ...BASE, monthToDateGrossCents: 300000 }),
      false,
    );
  });

  test("is true (not ahead-or-behind ambiguous) when there is no previous figure", () => {
    assert.equal(
      isPacingAhead({ ...BASE, previousMonthPaceGrossCents: 0 }),
      true,
    );
  });
});

describe("toPreviousMonthPaceLabel", () => {
  test("formats the previous month's comparison window as whole-dollar USD", () => {
    assert.equal(toPreviousMonthPaceLabel(BASE), "$3,500");
  });
});

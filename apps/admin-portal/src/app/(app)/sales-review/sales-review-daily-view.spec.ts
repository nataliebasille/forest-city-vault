import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { DailyGross } from "./sales-review-daily";
import { toDailyBars } from "./sales-review-daily-view";

const DAILY: DailyGross[] = [
  { day: 1, grossCents: 0 },
  { day: 2, grossCents: 20000 },
  { day: 3, grossCents: 10000 },
];

describe("toDailyBars", () => {
  test("scales each day's height relative to the month's highest day", () => {
    const bars = toDailyBars(DAILY, "August");

    assert.deepEqual(
      bars.map((bar) => bar.heightPercent),
      [0, 100, 50],
    );
  });

  test("formats the tooltip with the month name, day, and whole-dollar gross", () => {
    const bars = toDailyBars(DAILY, "August");

    assert.equal(bars[1]?.tooltip, "August 2 · $200");
  });

  test("does not divide by zero when every day so far has no sales", () => {
    const bars = toDailyBars(
      [
        { day: 1, grossCents: 0 },
        { day: 2, grossCents: 0 },
      ],
      "August",
    );

    assert.deepEqual(
      bars.map((bar) => bar.heightPercent),
      [0, 0],
    );
  });

  test("preserves day order", () => {
    const bars = toDailyBars(DAILY, "August");
    assert.deepEqual(
      bars.map((bar) => bar.day),
      [1, 2, 3],
    );
  });
});

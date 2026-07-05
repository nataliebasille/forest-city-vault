import { describe, test } from "node:test";
import { expect } from "expect";
import { expectTypeOf } from "expect-type";
import { Effect, Layer } from "effect";
import { Clock, currentTimeMillis, now } from "./public";
import { SystemClock, makeClock, staticClock } from "./clocks";

const FIXED_DATE = new Date("2024-06-01T00:00:00.000Z");
const FIXED_MS = FIXED_DATE.getTime();

describe("staticClock", () => {
  test("returns the fixed millisecond value when constructed from a number", async () => {
    const result = await Effect.runPromise(
      currentTimeMillis.pipe(Effect.provide(staticClock(FIXED_MS))),
    );
    expect(result).toBe(FIXED_MS);
  });

  test("returns the fixed millisecond value when constructed from a Date", async () => {
    const result = await Effect.runPromise(
      currentTimeMillis.pipe(Effect.provide(staticClock(FIXED_DATE))),
    );
    expect(result).toBe(FIXED_MS);
  });

  test("returns the fixed Date when constructed from a number", async () => {
    const result = await Effect.runPromise(
      now.pipe(Effect.provide(staticClock(FIXED_MS))),
    );
    expect(result).toEqual(FIXED_DATE);
  });

  test("returns the fixed Date when constructed from a Date", async () => {
    const result = await Effect.runPromise(
      now.pipe(Effect.provide(staticClock(FIXED_DATE))),
    );
    expect(result).toEqual(FIXED_DATE);
  });

  test("two calls return the same value (static, not advancing)", async () => {
    const layer = staticClock(FIXED_MS);
    const [a, b] = await Effect.runPromise(
      Effect.all([currentTimeMillis, currentTimeMillis]).pipe(
        Effect.provide(layer),
      ),
    );
    expect(a).toBe(b);
  });
});

describe("SystemClock", () => {
  test("currentTimeMillis is within a reasonable range of Date.now()", async () => {
    const before = Date.now();
    const result = await Effect.runPromise(
      currentTimeMillis.pipe(Effect.provide(SystemClock)),
    );
    const after = Date.now();
    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });

  test("now returns a Date within a reasonable range", async () => {
    const before = Date.now();
    const result = await Effect.runPromise(
      now.pipe(Effect.provide(SystemClock)),
    );
    const after = Date.now();
    expect(result.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.getTime()).toBeLessThanOrEqual(after);
  });
});

describe("Clock – types", () => {
  test("currentTimeMillis requires Clock in context", () => {
    expectTypeOf<
      Effect.Effect.Context<typeof currentTimeMillis>
    >().toExtend<Clock>();
  });

  test("now requires Clock in context", () => {
    expectTypeOf<Effect.Effect.Context<typeof now>>().toExtend<Clock>();
  });

  test("staticClock produces a Layer<Clock>", () => {
    expectTypeOf<ReturnType<typeof staticClock>>().toExtend<
      Layer.Layer<Clock>
    >();
  });

  test("makeClock produces a Layer<Clock>", () => {
    expectTypeOf<ReturnType<typeof makeClock>>().toExtend<Layer.Layer<Clock>>();
  });

  test("SystemClock is a Layer<Clock>", () => {
    expectTypeOf<typeof SystemClock>().toExtend<Layer.Layer<Clock>>();
  });
});

import { describe, test } from "node:test";
import { expect } from "expect";
import { expectTypeOf } from "expect-type";
import { Effect, Layer } from "effect";
import {
  IdGenerator,
  makeIdGenerator,
  next,
  staticIdGenerator,
  SystemIdGenerator,
} from "./public";

describe("staticIdGenerator", () => {
  test("returns the fixed id", async () => {
    const result = await Effect.runPromise(
      next.pipe(Effect.provide(staticIdGenerator("fixed-id"))),
    );
    expect(result).toBe("fixed-id");
  });
});

describe("SystemIdGenerator", () => {
  test("generates UUID v7 values", async () => {
    const [a, b] = await Effect.runPromise(
      Effect.all([next, next]).pipe(Effect.provide(SystemIdGenerator)),
    );

    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(b).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(a).not.toBe(b);
  });
});

describe("IdGenerator – types", () => {
  test("next requires IdGenerator in context", () => {
    expectTypeOf<Effect.Effect.Context<typeof next>>().toExtend<IdGenerator>();
  });

  test("makeIdGenerator produces a Layer<IdGenerator>", () => {
    expectTypeOf<ReturnType<typeof makeIdGenerator>>().toExtend<
      Layer.Layer<IdGenerator>
    >();
  });
});

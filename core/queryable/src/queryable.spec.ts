import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { expectTypeOf } from "expect-type";
import { Context, Effect, Layer } from "effect";
import { makeQueryable, type Queryable } from "./public";

class ReadError {
  readonly _tag = "ReadError";
}

// A minimal in-memory handle standing in for a driver's read-only surface.
type FakeReadDb = {
  readonly find: (id: number) => Promise<number>;
};

describe("Queryable", () => {
  test("query threads the handle through and preserves the error channel", async () => {
    const queryable: Queryable<FakeReadDb, ReadError> = {
      query: (operation) =>
        Effect.tryPromise({
          try: () => operation({ find: async (id) => id * 2 }),
          catch: () => new ReadError(),
        }),
    };

    const result = await Effect.runPromise(
      queryable.query((db) => db.find(21)),
    );

    assert.equal(result, 42);
  });

  test("query is typed with the handle and error it was instantiated with", () => {
    expectTypeOf<Queryable<FakeReadDb, ReadError>["query"]>().toBeFunction();
    expectTypeOf<
      ReturnType<Queryable<FakeReadDb, ReadError>["query"]>
    >().toExtend<Effect.Effect<unknown, ReadError>>();
  });
});

describe("makeQueryable", () => {
  test("builds a Layer that provides the tag, carrying the query's requirements", async () => {
    class FakeDb extends Context.Tag("test/FakeDb")<
      FakeDb,
      { readonly find: (id: number) => Promise<number> }
    >() {}

    const FakeQueryable =
      Context.GenericTag<Queryable<FakeReadDb, ReadError>>(
        "test/FakeQueryable",
      );

    const FakeQueryableLive = makeQueryable(
      FakeQueryable,
      Effect.map(
        FakeDb,
        (db): Queryable<FakeReadDb, ReadError>["query"] =>
          (operation) =>
            Effect.tryPromise({
              try: () => operation(db),
              catch: () => new ReadError(),
            }),
      ),
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const q = yield* FakeQueryable;
        return yield* q.query((db) => db.find(21));
      }).pipe(
        Effect.provide(
          FakeQueryableLive.pipe(
            Layer.provide(
              Layer.succeed(FakeDb, { find: async (id) => id * 2 }),
            ),
          ),
        ),
      ),
    );

    assert.equal(result, 42);
  });
});

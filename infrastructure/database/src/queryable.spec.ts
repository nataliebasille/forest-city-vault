import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Effect, Layer } from "effect";
import { sql } from "drizzle-orm";
import { Database } from "./database";
import {
  QueryableLive,
  SapphoQueryable,
  type SapphoReadDatabase,
} from "./queryable";
import * as schema from "./schema";
import { DatabaseTest } from "./testing";

const { stores } = schema;

/** The Queryable stack built over the in-memory test database. */
const QueryableTest = QueryableLive.pipe(Layer.provideMerge(DatabaseTest));

function run<A>(effect: Effect.Effect<A, unknown, SapphoQueryable | Database>) {
  return Effect.runPromise(
    effect.pipe(Effect.provide(QueryableTest)) as Effect.Effect<
      A,
      never,
      never
    >,
  );
}

describe("Queryable", () => {
  test("runs a read query through the wrapped Database", async () => {
    const rows = await run(
      Effect.gen(function* () {
        const q = yield* SapphoQueryable;
        return yield* q.query((db) =>
          db.select({ one: sql<number>`1` }).from(stores),
        );
      }),
    );

    // No stores seeded, so the select returns no rows — but it executed.
    assert.deepEqual(rows, []);
  });

  test("read handle exposes no mutation surface (compile-time)", () => {
    // Type-level guard: the read handle must not carry insert/update/delete or
    // the raw execute escape hatch. Each suppressed line below is expected to
    // error; if any becomes accessible, its directive goes unused and the build
    // breaks.
    type _Assert = (db: SapphoReadDatabase) => void;
    const _assert: _Assert = (db) => {
      // @ts-expect-error insert must not exist on the read-only handle
      db.insert;
      // @ts-expect-error update must not exist on the read-only handle
      db.update;
      // @ts-expect-error delete must not exist on the read-only handle
      db.delete;
      // @ts-expect-error execute must not exist on the read-only handle
      db.execute;
    };
    void _assert;
    assert.ok(true);
  });
});

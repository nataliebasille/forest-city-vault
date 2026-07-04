import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Cause, Data, Effect, Exit, Option } from "effect";
import {
  Transactor,
  TransactorError,
  withCommitScope,
} from "@forest-city-vault/application-core";
import { Database } from "./index";
import * as schema from "./schema";
import { DatabaseTest } from "./testing";
import { TransactorLive } from "./transactor";

const { vendors } = schema;

const vendorRow = (name: string) => ({
  name,
  createdAt: new Date(),
  updatedAt: new Date(),
});

class BoomError extends Data.TaggedError("BoomError")<{ why: string }> {}

describe("TransactorLive", () => {
  test("commits the work when the effect succeeds", async () => {
    await runWith(
      Effect.gen(function* () {
        const db = yield* Database;

        yield* withCommitScope(
          db.query((sql) => sql.insert(vendors).values(vendorRow("committed"))),
        );

        const rows = yield* db.query((sql) => sql.select().from(vendors));
        assert.equal(rows.length, 1);
        assert.equal(rows[0].name, "committed");
      }),
    );
  });

  test("rolls back and re-raises the original typed error on failure", async () => {
    const exit = await runWithExit(
      Effect.gen(function* () {
        const db = yield* Database;

        yield* withCommitScope(
          Effect.gen(function* () {
            yield* db.query((sql) =>
              sql.insert(vendors).values(vendorRow("rolled-back")),
            );
            return yield* Effect.fail(new BoomError({ why: "nope" }));
          }),
        );
      }),
    );

    assert.ok(Exit.isFailure(exit), "the effect should fail");
    const error = Exit.isFailure(exit)
      ? Option.getOrUndefined(Cause.failureOption(exit.cause))
      : undefined;
    // the caller's typed error survives the transaction boundary unchanged
    assert.ok(error instanceof BoomError, "original BoomError is preserved");
    assert.ok(
      !(error instanceof TransactorError),
      "the error is not swallowed by a TransactorError",
    );

    // and the write made before the failure was rolled back
    const rows = await runWith(
      Effect.flatMap(Database, (db) =>
        db.query((sql) => sql.select().from(vendors)),
      ),
    );
    assert.equal(rows.length, 0);
  });

  test("rolls back and re-raises the original defect on die", async () => {
    const exit = await runWithExit(
      Effect.gen(function* () {
        const db = yield* Database;

        yield* withCommitScope(
          Effect.gen(function* () {
            yield* db.query((sql) =>
              sql.insert(vendors).values(vendorRow("defected")),
            );
            return yield* Effect.die(new Error("unexpected defect"));
          }),
        );
      }),
    );

    assert.ok(Exit.isFailure(exit), "the effect should die");
    const defect = Exit.isFailure(exit)
      ? Option.getOrUndefined(Cause.dieOption(exit.cause))
      : undefined;
    assert.ok(defect instanceof Error, "original defect is preserved");
    assert.equal((defect as Error).message, "unexpected defect");

    const rows = await runWith(
      Effect.flatMap(Database, (db) =>
        db.query((sql) => sql.select().from(vendors)),
      ),
    );
    assert.equal(rows.length, 0);
  });

  test("commits an independent scope after a previous scope rolled back", async () => {
    await runWith(
      Effect.gen(function* () {
        const db = yield* Database;

        // first scope fails and rolls back
        yield* withCommitScope(
          Effect.gen(function* () {
            yield* db.query((sql) =>
              sql.insert(vendors).values(vendorRow("first")),
            );
            return yield* Effect.fail(new BoomError({ why: "rollback" }));
          }),
        ).pipe(Effect.exit);

        // second scope commits
        yield* withCommitScope(
          db.query((sql) => sql.insert(vendors).values(vendorRow("second"))),
        );

        const rows = yield* db.query((sql) => sql.select().from(vendors));
        assert.equal(rows.length, 1);
        assert.equal(rows[0].name, "second");
      }),
    );
  });
});

/** Runs an Effect against a fresh in-memory database with a live Transactor. */
function runWith<A>(
  effect: Effect.Effect<A, unknown, Database | Transactor>,
): Promise<A> {
  return Effect.runPromise(
    effect.pipe(
      Effect.provide(TransactorLive),
      Effect.provide(DatabaseTest),
    ) as Effect.Effect<A, never, never>,
  );
}

/** Runs an Effect and returns its Exit, so failures/defects can be inspected. */
function runWithExit<A, E>(
  effect: Effect.Effect<A, E, Database | Transactor>,
): Promise<Exit.Exit<A, E>> {
  return Effect.runPromise(
    effect.pipe(
      Effect.provide(TransactorLive),
      Effect.provide(DatabaseTest),
      Effect.exit,
    ) as Effect.Effect<Exit.Exit<A, E>, never, never>,
  );
}

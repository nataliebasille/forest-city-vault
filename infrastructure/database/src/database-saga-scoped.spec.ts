import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Cause, Data, Effect, Exit, Option } from "effect";
import { SagaError, withSaga } from "@forest-city-vault/platform-saga";
import { Database } from "./index";
import * as schema from "./schema";
import { DatabaseTest } from "./testing";
import { databaseSagaScoped } from "./database-saga-scoped";

const { vendors } = schema;

const vendorRow = (name: string) => ({
  name,
  createdAt: new Date(),
  updatedAt: new Date(),
});

class BoomError extends Data.TaggedError("BoomError")<{ why: string }> {}

/**
 * Runs `effect` inside a saga the database has joined: `withSaga` provides the
 * registry and drives commit/rollback, while `databaseSagaScoped` provides a
 * transaction-bound {@link Database} for the scope and registers it as the
 * participant — the same `sagaScoped` seam any scoped service would use. Code
 * inside `effect` obtains that transaction-bound database via `yield* Database`.
 */
const inSaga = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  withSaga(effect.pipe(Effect.provide(databaseSagaScoped)));

describe("databaseSagaScoped", () => {
  test("commits the work when the effect succeeds", async () => {
    await runWith(
      Effect.gen(function* () {
        yield* inSaga(
          Effect.gen(function* () {
            const db = yield* Database;
            yield* db.query((sql) =>
              sql.insert(vendors).values(vendorRow("committed")),
            );
          }),
        );

        const db = yield* Database;
        const rows = yield* db.query((sql) => sql.select().from(vendors));
        assert.equal(rows.length, 1);
        assert.equal(rows[0].name, "committed");
      }),
    );
  });

  test("rolls back and re-raises the original typed error on failure", async () => {
    const exit = await runWithExit(
      inSaga(
        Effect.gen(function* () {
          const db = yield* Database;
          yield* db.query((sql) =>
            sql.insert(vendors).values(vendorRow("rolled-back")),
          );
          return yield* Effect.fail(new BoomError({ why: "nope" }));
        }),
      ),
    );

    assert.ok(Exit.isFailure(exit), "the effect should fail");
    const error =
      Exit.isFailure(exit) ?
        Option.getOrUndefined(Cause.failureOption(exit.cause))
      : undefined;
    // the caller's typed error survives the transaction boundary unchanged
    assert.ok(error instanceof BoomError, "original BoomError is preserved");
    assert.ok(
      !(error instanceof SagaError),
      "the error is not swallowed by a SagaError",
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
      inSaga(
        Effect.gen(function* () {
          const db = yield* Database;
          yield* db.query((sql) =>
            sql.insert(vendors).values(vendorRow("defected")),
          );
          return yield* Effect.die(new Error("unexpected defect"));
        }),
      ),
    );

    assert.ok(Exit.isFailure(exit), "the effect should die");
    const defect =
      Exit.isFailure(exit) ?
        Option.getOrUndefined(Cause.dieOption(exit.cause))
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

  test("commits an independent saga after a previous one rolled back", async () => {
    await runWith(
      Effect.gen(function* () {
        // first saga fails and rolls back
        yield* inSaga(
          Effect.gen(function* () {
            const db = yield* Database;
            yield* db.query((sql) =>
              sql.insert(vendors).values(vendorRow("first")),
            );
            return yield* Effect.fail(new BoomError({ why: "rollback" }));
          }),
        ).pipe(Effect.exit);

        // second saga commits
        yield* inSaga(
          Effect.gen(function* () {
            const db = yield* Database;
            yield* db.query((sql) =>
              sql.insert(vendors).values(vendorRow("second")),
            );
          }),
        );

        const db = yield* Database;
        const rows = yield* db.query((sql) => sql.select().from(vendors));
        assert.equal(rows.length, 1);
        assert.equal(rows[0].name, "second");
      }),
    );
  });
});

/** Runs an Effect against a fresh in-memory database. */
function runWith<A>(effect: Effect.Effect<A, unknown, Database>): Promise<A> {
  return Effect.runPromise(
    effect.pipe(Effect.provide(DatabaseTest)) as Effect.Effect<A, never, never>,
  );
}

/** Runs an Effect and returns its Exit, so failures/defects can be inspected. */
function runWithExit<A, E>(
  effect: Effect.Effect<A, E, Database>,
): Promise<Exit.Exit<A, E>> {
  return Effect.runPromise(
    effect.pipe(Effect.provide(DatabaseTest), Effect.exit) as Effect.Effect<
      Exit.Exit<A, E>,
      never,
      never
    >,
  );
}

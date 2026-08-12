import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Cause, Data, Effect, Exit, Layer, Option } from "effect";
import { provideSagaScoped, withSaga } from "@forest-city-vault/platform-saga";
import { Orders } from "@forest-city-vault/domain";
import { Database } from "../index";
import * as schema from "../schema";
import { DatabaseTest } from "../testing";
import { RepositoriesSagaScoped } from "./index";

const { orders } = schema;

class BoomError extends Data.TaggedError("BoomError")<{ why: string }> {}

const orderPayload = (merchantId: string, orderId: string) => ({
  order: {
    idempotencyKey: `${merchantId}:${orderId}`,
    merchantId,
    orderId,
    timestamp: new Date(),
    modifiedTime: Date.now(),
    paymentState: "PAID" as const,
    subtotal: 0,
    tax: 0,
    discount: 0,
    total: 0,
    payments: [] as const,
  },
  items: [] as const,
});

/**
 * Runs `effect` inside a saga: `withSaga` opens the saga, rebuilds the
 * boundary-declared saga-scoped layer (here {@link RepositoriesSagaScoped},
 * wired in `runWith`) against the saga's fresh `Saga`, and builds a
 * transaction-bound Order repository for it. Code inside `effect` uses
 * `Orders.repository` and gets that per-saga, transaction-bound instance.
 */
const inSaga = <A, E, R>(effect: Effect.Effect<A, E, R>) => withSaga(effect);

describe("RepositoriesSagaScoped", () => {
  test("commits repository writes through the saga transaction on success", async () => {
    const orderId = "ORDER-1";

    await runWith(
      Effect.gen(function* () {
        yield* inSaga(
          Effect.gen(function* () {
            const order = yield* Orders.actions.fromCloverOrder(
              Orders.pristine(orderId),
              orderPayload("merchant-1", orderId),
            );

            yield* Orders.repository.save(order);
          }),
        );

        const db = yield* Database;
        const rows = yield* db.query((sql) => sql.select().from(orders));

        assert.equal(rows.length, 1);
        assert.equal(rows[0].id, orderId);
      }),
    );
  });

  test("rolls back repository writes when the saga fails", async () => {
    const exit = await runWithExit(
      inSaga(
        Effect.gen(function* () {
          const order = yield* Orders.actions.fromCloverOrder(
            Orders.pristine("ORDER-2"),
            orderPayload("merchant-2", "ORDER-2"),
          );

          yield* Orders.repository.save(order);

          return yield* Effect.fail(new BoomError({ why: "nope" }));
        }),
      ),
    );

    assert.ok(Exit.isFailure(exit), "the saga should fail");
    const error =
      Exit.isFailure(exit) ?
        Option.getOrUndefined(Cause.failureOption(exit.cause))
      : undefined;
    assert.ok(error instanceof BoomError, "original BoomError is preserved");

    // The write made before the failure was rolled back with the saga.
    const rows = await runWith(
      Effect.flatMap(Database, (db) =>
        db.query((sql) => sql.select().from(orders)),
      ),
    );
    assert.equal(rows.length, 0);
  });

  test("builds a fresh transaction-bound repository for each saga", async () => {
    const firstId = "ORDER-first";
    const secondId = "ORDER-second";

    await runWith(
      Effect.gen(function* () {
        // First saga rolls back.
        yield* inSaga(
          Effect.gen(function* () {
            const order = yield* Orders.actions.fromCloverOrder(
              Orders.pristine(firstId),
              orderPayload("merchant-3", firstId),
            );
            yield* Orders.repository.save(order);
            return yield* Effect.fail(new BoomError({ why: "rollback" }));
          }),
        ).pipe(Effect.exit);

        // Second, independent saga commits on a fresh repository/transaction.
        yield* inSaga(
          Effect.gen(function* () {
            const order = yield* Orders.actions.fromCloverOrder(
              Orders.pristine(secondId),
              orderPayload("merchant-4", secondId),
            );
            yield* Orders.repository.save(order);
          }),
        );

        const db = yield* Database;
        const rows = yield* db.query((sql) => sql.select().from(orders));

        assert.equal(rows.length, 1);
        assert.equal(rows[0].id, secondId);
      }),
    );
  });
});

/** The saga-scoped services `RepositoriesSagaScoped` provides — satisfied at the
 * boundary in the helpers below and rebuilt per saga by `withSaga`. */
type RepoScoped = Layer.Layer.Success<typeof RepositoriesSagaScoped>;

/** Runs an Effect against a fresh in-memory database, with the saga's scoped
 * repositories declared at the boundary so `withSaga` rebuilds them per saga. */
function runWith<A>(effect: Effect.Effect<A, unknown, RepoScoped>): Promise<A> {
  return Effect.runPromise(
    effect.pipe(
      Effect.provide(provideSagaScoped(RepositoriesSagaScoped)),
      Effect.provide(DatabaseTest),
    ) as Effect.Effect<A, never, never>,
  );
}

/** Runs an Effect and returns its Exit, so failures/defects can be inspected. */
function runWithExit<A, E>(
  effect: Effect.Effect<A, E, RepoScoped>,
): Promise<Exit.Exit<A, E>> {
  return Effect.runPromise(
    effect.pipe(
      Effect.provide(provideSagaScoped(RepositoriesSagaScoped)),
      Effect.provide(DatabaseTest),
      Effect.exit,
    ) as Effect.Effect<Exit.Exit<A, E>, never, never>,
  );
}

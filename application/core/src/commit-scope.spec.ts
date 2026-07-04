import { describe, test } from "node:test";
import { expect } from "expect";

import { Data, Effect, Either, Layer } from "effect";

import { Transactor, TransactorError } from "./transactor";
import { withCommitScope } from "./commit-scope";

class BoomError extends Data.TaggedError("BoomError")<{ why: string }> {}

/**
 * A fake {@link Transactor} that runs the wrapped effect directly, without any
 * real transaction. This keeps the application layer testable in complete
 * isolation from infrastructure — the concrete, database-backed behaviour is
 * covered by the `Transactor` integration tests in the infrastructure package.
 */
const passthrough = Layer.succeed(Transactor, {
  transaction: ((effect) => effect) as Transactor.Service["transaction"],
});

const run = <A, E>(program: Effect.Effect<A, E, Transactor>) =>
  Effect.runPromise(program.pipe(Effect.provide(passthrough), Effect.either));

describe("withCommitScope", () => {
  test("delegates to the Transactor and returns the effect's value", async () => {
    const result = await run(withCommitScope(Effect.succeed(42)));

    expect(Either.isRight(result)).toBe(true);
    expect((result as Either.Right<never, number>).right).toBe(42);
  });

  test("propagates the wrapped effect's failure", async () => {
    const result = await run(
      withCommitScope(Effect.fail(new BoomError({ why: "nope" }))),
    );

    expect(Either.isLeft(result)).toBe(true);
    expect(
      (result as Either.Left<BoomError | TransactorError, never>).left,
    ).toBeInstanceOf(BoomError);
  });
});

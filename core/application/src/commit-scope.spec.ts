import { describe, test } from "node:test";
import { expect } from "expect";

import { Data, Effect, Either, Layer } from "effect";
import { EventTracker } from "@forest-city-vault/core-domain";

import { Transactor, TransactorError } from "./transactor";
import { withCommitScope } from "./commit-scope";

class BoomError extends Data.TaggedError("BoomError")<{ why: string }> {}

// Builds a minimal pristine aggregate to hand to EventTracker.track. The id is
// a branded AggregateId at the type level; a plain string stands in for it here.
type TrackFromAgg = Parameters<EventTracker.Service["track"]>[1];
const widget = (id: string): TrackFromAgg =>
  ({ id, version: 0 }) as unknown as TrackFromAgg;

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

  test("provides a per-request EventTracker, satisfying the requirement", async () => {
    // The wrapped effect requires an EventTracker (as a real dispatcher/
    // repository would). withCommitScope must satisfy it without the caller
    // providing one, so `run` — which only provides the Transactor — succeeds.
    const tracked = withCommitScope(
      Effect.gen(function* () {
        const tracker = yield* EventTracker;
        yield* tracker.track("Widget", widget("w1"), [
          { type: "Created", payload: { value: 1 } },
        ]);

        return yield* tracker.peek("Widget", "w1");
      }),
    );

    const result = await run(tracked);

    expect(Either.isRight(result)).toBe(true);
    expect((result as Either.Right<never, unknown>).right).toEqual([
      { type: "Created", payload: { value: 1 } },
    ]);
  });

  test("gives each commit scope its own isolated tracker", async () => {
    // Scope A tracks an event but never drains it. A second, independent commit
    // scope must not observe scope A's staged events — proving the tracker is
    // built fresh per scope rather than shared across requests.
    await run(
      withCommitScope(
        Effect.gen(function* () {
          const tracker = yield* EventTracker;
          yield* tracker.track("Widget", widget("w1"), [
            { type: "Created", payload: { value: 1 } },
          ]);
        }),
      ),
    );

    const secondScope = await run(
      withCommitScope(
        Effect.gen(function* () {
          const tracker = yield* EventTracker;
          return yield* tracker.peek("Widget", "w1");
        }),
      ),
    );

    expect(Either.isRight(secondScope)).toBe(true);
    expect((secondScope as Either.Right<never, unknown>).right).toEqual([]);
  });
});

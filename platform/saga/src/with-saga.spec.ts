import { describe, test } from "node:test";
import { expect } from "expect";

import { Data, Effect, Either, Ref } from "effect";
import { EventTracker } from "@forest-city-vault/core-domain";

import { Participant, Saga, SagaError } from "./saga";
import { withSaga } from "./with-saga";

class BoomError extends Data.TaggedError("BoomError")<{ why: string }> {}

class CommitError extends Data.TaggedError("CommitError")<{ what: string }> {}

// Builds a minimal pristine aggregate to hand to EventTracker.track. The id is
// a branded AggregateId at the type level; a plain string stands in for it here.
type TrackFromAgg = Parameters<EventTracker.Service["track"]>[1];
const widget = (id: string): TrackFromAgg =>
  ({ id, version: 0 }) as unknown as TrackFromAgg;

/**
 * A spy participant that appends its label to a shared log whenever it is
 * committed or rolled back, so tests can assert ordering across participants.
 */
const spyParticipant = (
  log: Ref.Ref<string[]>,
  label: string,
  options: { readonly commit?: Participant["commit"] } = {},
): Participant => ({
  commit:
    options.commit ??
    Ref.update(log, (entries) => [...entries, `commit:${label}`]),
  rollback: Ref.update(log, (entries) => [...entries, `rollback:${label}`]),
});

/** Registers a participant with the current saga. */
const register = (participant: Participant) =>
  Effect.flatMap(Saga, (saga) => saga.register(participant));

const run = <A, E>(program: Effect.Effect<A, E, never>) =>
  Effect.runPromise(Effect.either(program));

describe("withSaga", () => {
  test("returns the wrapped effect's value on success", async () => {
    const result = await run(withSaga(Effect.succeed(42)));

    expect(Either.isRight(result)).toBe(true);
    expect((result as Either.Right<never, number>).right).toBe(42);
  });

  test("commits registered participants in registration order on success", async () => {
    const program = Effect.gen(function* () {
      const log = yield* Ref.make<string[]>([]);

      yield* withSaga(
        Effect.gen(function* () {
          yield* register(spyParticipant(log, "a"));
          yield* register(spyParticipant(log, "b"));
        }),
      );

      return yield* Ref.get(log);
    });

    const result = await run(program);

    expect((result as Either.Right<never, string[]>).right).toEqual([
      "commit:a",
      "commit:b",
    ]);
  });

  test("maps a participant commit failure to a SagaError", async () => {
    const result = await run(
      withSaga(
        register({
          commit: Effect.fail(new CommitError({ what: "disk full" })),
          rollback: Effect.void,
        }),
      ),
    );

    expect(Either.isLeft(result)).toBe(true);
    const error = (result as Either.Left<SagaError, never>).left;
    expect(error).toBeInstanceOf(SagaError);
    expect((error as SagaError).cause).toBeInstanceOf(CommitError);
  });

  test("rolls back in reverse order and re-raises the original error on failure", async () => {
    const program = Effect.gen(function* () {
      const log = yield* Ref.make<string[]>([]);

      const outcome = yield* Effect.either(
        withSaga(
          Effect.gen(function* () {
            yield* register(spyParticipant(log, "a"));
            yield* register(spyParticipant(log, "b"));
            return yield* Effect.fail(new BoomError({ why: "nope" }));
          }),
        ),
      );

      return { outcome, log: yield* Ref.get(log) };
    });

    const { outcome, log } = await Effect.runPromise(program);

    expect(Either.isLeft(outcome)).toBe(true);
    expect((outcome as Either.Left<BoomError, never>).left).toBeInstanceOf(
      BoomError,
    );
    expect(log).toEqual(["rollback:b", "rollback:a"]);
  });

  test("does not commit participants when the effect fails", async () => {
    const program = Effect.gen(function* () {
      const log = yield* Ref.make<string[]>([]);

      yield* Effect.either(
        withSaga(
          Effect.gen(function* () {
            yield* register(spyParticipant(log, "a"));
            return yield* Effect.fail(new BoomError({ why: "nope" }));
          }),
        ),
      );

      return yield* Ref.get(log);
    });

    const log = await Effect.runPromise(program);

    expect(log).not.toContain("commit:a");
  });

  test("a caller-provided EventTracker is scoped to the saga", async () => {
    const tracked = withSaga(
      Effect.gen(function* () {
        const tracker = yield* EventTracker;
        yield* tracker.track("Widget", widget("w1"), [
          { type: "Created", payload: { value: 1 } },
        ]);

        return yield* tracker.peek("Widget", "w1");
      }).pipe(Effect.provide(EventTracker.make)),
    );

    const result = await run(tracked);

    expect(Either.isRight(result)).toBe(true);
    expect((result as Either.Right<never, unknown>).right).toEqual([
      { type: "Created", payload: { value: 1 } },
    ]);
  });

  test("gives each saga its own isolated tracker", async () => {
    await run(
      withSaga(
        Effect.gen(function* () {
          const tracker = yield* EventTracker;
          yield* tracker.track("Widget", widget("w1"), [
            { type: "Created", payload: { value: 1 } },
          ]);
        }).pipe(Effect.provide(EventTracker.make)),
      ),
    );

    const secondScope = await run(
      withSaga(
        Effect.gen(function* () {
          const tracker = yield* EventTracker;
          return yield* tracker.peek("Widget", "w1");
        }).pipe(Effect.provide(EventTracker.make)),
      ),
    );

    expect(Either.isRight(secondScope)).toBe(true);
    expect((secondScope as Either.Right<never, unknown>).right).toEqual([]);
  });
});

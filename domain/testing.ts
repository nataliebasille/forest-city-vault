import { EventTracker } from "@forest-city-vault/core-domain";
import { staticClock } from "@forest-city-vault/core-clock";
import { Effect, Exit } from "effect";

/**
 * A fixed point in time every domain test runs against, so timestamps written
 * into events/snapshots are deterministic (the actions read `now` from the
 * {@link staticClock} layer rather than the wall clock).
 */
export const FIXED_NOW = new Date("2024-01-02T03:04:05.000Z");

const testLayers = <A, E>(effect: Effect.Effect<A, E, EventTracker>) =>
  effect.pipe(
    Effect.provide(EventTracker.make),
    Effect.provide(staticClock(FIXED_NOW)),
  );

/**
 * Runs an aggregate action (or any Effect needing an `EventTracker` + `Clock`)
 * to its success value, providing an in-memory event tracker and a static
 * clock. Throws if the effect fails — use {@link runActionExit} to assert on
 * expected failures.
 */
export const runAction = <A, E>(effect: Effect.Effect<A, E, EventTracker>) =>
  Effect.runSync(testLayers(effect) as Effect.Effect<A, E, never>);

/** Runs an aggregate action and returns its {@link Exit}, so an expected typed
 * failure can be inspected without throwing. */
export const runActionExit = <A, E>(
  effect: Effect.Effect<A, E, EventTracker>,
) => Effect.runSyncExit(testLayers(effect) as Effect.Effect<A, E, never>);

/** Extracts the failure from an {@link Exit}, or throws if it did not fail. */
export const expectFailure = <A, E>(exit: Exit.Exit<A, E>) => {
  if (Exit.isSuccess(exit)) {
    throw new Error("expected the effect to fail, but it succeeded");
  }

  const error = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
  if (error === undefined) {
    throw new Error(`expected a Fail cause, got ${exit.cause._tag}`);
  }

  return error;
};

import { Effect } from "effect";
import { makeClock } from "./make-clock";

/**
 * A Clock layer that always returns a fixed point in time.
 * Useful for deterministic tests.
 */
export function staticClock(time: Date | number) {
  const date = time instanceof Date ? time : new Date(time);
  return makeClock({ now: Effect.succeed(date) });
}

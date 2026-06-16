import { Effect } from "effect";
import { makeClock } from "./make-clock";

export const SystemClock = makeClock({
  now: Effect.sync(() => new Date()),
});

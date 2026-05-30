import { Layer } from "effect";
import { Clock, ClockService } from "../layer";

export function makeClock(implementation: ClockService): Layer.Layer<Clock> {
  return Layer.succeed(Clock, implementation);
}

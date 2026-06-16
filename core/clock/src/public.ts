export * from "./clocks";
export * from "./layer";

import { Effect } from "effect";
import { Clock } from "./layer";

export const now = Effect.flatMap(Clock, (c) => c.now);
export const currentTimeMillis = Effect.map(now, (d) => d.getTime());

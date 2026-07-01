export * from "./generators";
export * from "./layer";

import { Effect } from "effect";
import { IdGenerator } from "./layer";

export const Id = {
  next: Effect.flatMap(IdGenerator, (generator) => generator.next),
};

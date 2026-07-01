import { Effect, Layer } from "effect";
import { IdGenerator, type IdGeneratorService } from "../layer";

export const makeIdGenerator = (generate: () => string) =>
  Layer.succeed<IdGenerator, IdGeneratorService>(IdGenerator, {
    next: Effect.sync(generate),
  });

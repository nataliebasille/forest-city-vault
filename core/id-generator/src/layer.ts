import { Context, Effect } from "effect";

export interface IdGeneratorService {
  readonly next: Effect.Effect<string>;
}

export class IdGenerator extends Context.Tag(
  "@forest-city-vault/core-id-generator/IdGenerator",
)<IdGenerator, IdGeneratorService>() {}

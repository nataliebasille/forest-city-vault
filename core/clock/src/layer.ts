import { Context, Effect } from "effect";

export interface ClockService {
  readonly now: Effect.Effect<Date>;
}

export class Clock extends Context.Tag("@forest-city-vault/core-clock/Clock")<
  Clock,
  ClockService
>() {}

import { Effect } from "effect";

export const tryPromiseOrElse = <A, E, R>(
  try_: () => Promise<A>,
  orElse: (cause: unknown) => Effect.Effect<never, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.tryPromise({
    try: try_,
    catch: (cause) => cause,
  }).pipe(Effect.catchAll(orElse));

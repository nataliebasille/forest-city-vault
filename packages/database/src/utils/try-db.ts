import { Data, Effect } from "effect";

export class DbError extends Data.TaggedError("DbError")<{
  readonly operation?: string;
  readonly cause: unknown;
}> {}

export function tryDb<A>(run: () => PromiseLike<A>): Effect.Effect<A, DbError>;

export function tryDb<A>(
  operation: string,
  run: () => PromiseLike<A>,
): Effect.Effect<A, DbError>;

export function tryDb<A>(
  operationOrRun: string | (() => PromiseLike<A>),
  maybeRun?: () => PromiseLike<A>,
): Effect.Effect<A, DbError> {
  const operation =
    typeof operationOrRun === "string" ? operationOrRun : undefined;

  const run = typeof operationOrRun === "string" ? maybeRun : operationOrRun;

  if (!run) {
    return Effect.die(
      new TypeError("tryDb requires a database operation function"),
    );
  }

  return Effect.tryPromise({
    try: run,
    catch: (cause) =>
      new DbError(operation === undefined ? { cause } : { operation, cause }),
  });
}

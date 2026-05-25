import { Effect, Exit, Cause, ManagedRuntime } from "effect";
import { NextRequest, NextResponse } from "next/server";

/**
 * Wraps an Effect into a Next.js Route Handler.
 * Runs the effect and returns a NextResponse with the result as JSON,
 * or a 500 response if the effect fails.
 */
export const routeHandler =
  <A, E>(
    effect: (req: NextRequest) => Effect.Effect<A, E>,
  ): ((req: NextRequest) => Promise<NextResponse>) =>
  async (req) => {
    const exit = await Effect.runPromiseExit(effect(req));
    if (Exit.isSuccess(exit)) {
      return NextResponse.json(exit.value);
    }
    const error = Cause.squash(exit.cause);
    console.error("[routeHandler]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  };

/**
 * Runs an Effect as a Next.js Server Action.
 * Returns the result or throws so Next.js error boundaries can handle it.
 */
export const serverAction = async <A, E>(
  effect: Effect.Effect<A, E>,
): Promise<A> => {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }
  throw Cause.squash(exit.cause);
};

export { Effect, Exit, Cause };

const runtime = ManagedRuntime.make();

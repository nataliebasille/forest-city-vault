import { Effect } from "effect";
import { InferredTransform, Middleware, NextEffect } from "./app.internal";

export function defineMiddleware<AExpr, EExpr, RExpr>(
  run: (next: NextEffect) => Effect.Effect<AExpr, EExpr, RExpr>,
): Middleware<InferredTransform<AExpr, EExpr, RExpr>> {
  return ((next: Effect.Effect<unknown, unknown, unknown>) => {
    return run(next as NextEffect);
  }) as unknown as Middleware<InferredTransform<AExpr, EExpr, RExpr>>;
}

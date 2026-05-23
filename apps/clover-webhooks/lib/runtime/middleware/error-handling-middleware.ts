import { NextMiddleware } from "@mcrovero/effect-nextjs";
import { RouteError } from "../http/public";
import { Effect, Layer, Schema } from "effect";

export class RouteErrorMiddleware extends NextMiddleware.Tag<RouteErrorMiddleware>()(
  "RouteErrorMiddleware",
  {
    wrap: true,
    catches: RouteError,
    returns: Schema.Unknown,
  },
) {}

export const RouteErrorMiddlewareLive = Layer.succeed(
  RouteErrorMiddleware,
  RouteErrorMiddleware.of(({ next }) =>
    next.pipe(
      Effect.catchTag("BadRequest", (error) =>
        Effect.succeed(
          Response.json(
            {
              error: "bad_request",
              message: error.message,
            },
            { status: 400 },
          ),
        ),
      ),
    ),
  ),
);

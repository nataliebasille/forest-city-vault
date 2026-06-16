import { defineMiddleware, HttpFailure } from "@forest-city-vault/nextjs-core";
import { Effect } from "effect";

export const NonHttpTo500Middleware = defineMiddleware()((next) =>
  next.pipe(
    Effect.catchAll((error) => {
      if (error instanceof HttpFailure) {
        return Effect.fail(error);
      }
      return Effect.fail(
        new HttpFailure({
          status: 500,
          message: "Internal Server Error",
          cause: error,
        }),
      );
    }),
  ),
);

import { Effect } from "effect";
import { NextRequest } from "next/server";
import { HttpResult, httpResultToResponse } from "../http/http-result";
import { MustBeNever } from "../types.internal";
import { buildRequestStateLayer, RequestStateDeps } from "./request/layer";

const identityTransform = <A, E, R>(next: Effect.Effect<A, E, R>) => next;
export function defineRoute<AIn, EIn, RIn, AOut, EOut, ROut>(
  effect: (
    self: Effect.Effect<AIn, EIn, RIn>,
  ) => Effect.Effect<AOut, EOut, ROut>,
) {
  const finalEffect = effect;
  return (
    action: (
      req: NextRequest,
    ) => Effect.Effect<AIn, EIn, RIn> &
      MustBeNever<
        Exclude<
          Effect.Effect.Context<ReturnType<typeof finalEffect>>,
          RequestStateDeps
        >
      >,
  ) => {
    return (req: NextRequest) => {
      return Effect.runPromise(
        action(req).pipe(
          finalEffect,
          Effect.provide(buildRequestStateLayer("route", req)),
          Effect.match({
            onFailure: (error) =>
              httpResultToResponse(failureToHttpResult(error)),

            onSuccess: (value) =>
              httpResultToResponse(successToHttpResult(value)),
          }),
        ) as unknown as Effect.Effect<Response, never, never>,
      );
    };
  };
}

export function successToHttpResult<A>(value: A): HttpResult<A> {
  if (
    HttpResult.$is("Ok")(value) ||
    HttpResult.$is("Error")(value) ||
    HttpResult.$is("NoContent")(value)
  ) {
    return value as HttpResult<A>;
  }

  return HttpResult.Ok({ body: value });
}

export function failureToHttpResult(error: unknown) {
  if (HttpResult.$is("Error")(error)) {
    return error;
  }

  return HttpResult.Error({
    status: 500,
    message: "Internal Server Error",
    cause: error,
  });
}

import { AppRoute, badRequest, tryPromiseOrElse } from "@/runtime";
import { Effect } from "effect";

const parseBody = (request: Request) =>
  tryPromiseOrElse(
    () => request.json() as Promise<unknown>,
    (cause: unknown) => badRequest("Invalid JSON body", cause),
  );

const getSignature = (request: Request) =>
  Effect.sync(() => request.headers.get("x-clover-signature"));

export const POST = AppRoute.build((request: Request) =>
  Effect.gen(function* () {
    const body = yield* parseBody(request);
    console.log(body);
    return "";
  }),
);

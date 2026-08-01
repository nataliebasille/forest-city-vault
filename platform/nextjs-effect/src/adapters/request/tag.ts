import { Context, Effect, Layer } from "effect";
import type { NextRequest } from "next/server";

/**
 * A request-state tag whose service value is a **deferred resolver**
 * (`Effect<Value>`) rather than the resolved value itself. The underlying
 * source — for pages, `next/headers`' `cookies()`/`headers()` — is only touched
 * when a handler actually runs the resolver (see the `Headers`/`Cookies`/`Body`
 * accessors), and the resolver is memoized per request so repeated reads resolve
 * once. This is what keeps a page that never reads request state eligible for
 * static rendering instead of being forced dynamic: providing the layer no
 * longer calls the dynamic Next.js APIs — only reading does.
 */
export type RequestStateTagClass<
  Name extends string,
  Self,
  Value,
> = Context.TagClass<Self, Name, Effect.Effect<Value>> & {
  new (): Self;
  readonly fromRequest: (req: NextRequest) => Layer.Layer<Self>;
  readonly forPage: () => Layer.Layer<Self>;
};

export function createRequestStateTag<N extends string>(
  name: N,
): <Self, Value>(config: {
  fromRequest(req: NextRequest): Effect.Effect<Value>;
  forPage(): Effect.Effect<Value>;
}) => RequestStateTagClass<N, Self, Value> {
  return <Self, Value>(config: {
    fromRequest(req: NextRequest): Effect.Effect<Value>;
    forPage(): Effect.Effect<Value>;
  }) => {
    return class Tag extends Context.Tag(`nextjs-effect/request/${name}`)<
      Self,
      Effect.Effect<Value>
    >() {
      // `Effect.cached` builds a memoized view of the resolver *without* running
      // it, so `Layer.effect` stores the deferred rather than eagerly resolving.
      // The source is hit at most once, and only when a handler reads the value.
      static fromRequest(req: NextRequest) {
        return Layer.effect(Tag, Effect.cached(config.fromRequest(req)));
      }

      static forPage() {
        return Layer.effect(Tag, Effect.cached(config.forPage()));
      }
    } as unknown as RequestStateTagClass<N, Self, Value>;
  };
}

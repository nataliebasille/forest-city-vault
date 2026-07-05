import { Context, Effect, Layer } from "effect";
import type { NextRequest } from "next/server";

export type RequestStateTagClass<
  Name extends string,
  Self,
  Shape,
> = Context.TagClass<Self, Name, Shape> & {
  new (): Self;
  readonly fromRequest: (req: NextRequest) => Layer.Layer<Self>;
  readonly forPage: () => Layer.Layer<Self>;
};

export function createRequestStateTag<N extends string>(
  name: N,
): <Self, Shape>(config: {
  fromRequest(req: NextRequest): Effect.Effect<Shape>;
  forPage(): Effect.Effect<Shape>;
}) => RequestStateTagClass<N, Self, Shape> {
  return <Self, Shape>(config: {
    fromRequest(req: NextRequest): Effect.Effect<Shape>;
    forPage(): Effect.Effect<Shape>;
  }) => {
    return class Tag extends Context.Tag(`nextjs-effect/request/${name}`)<
      Self,
      Shape
    >() {
      static fromRequest(req: NextRequest) {
        return Layer.effect(Tag, config.fromRequest(req));
      }

      static forPage() {
        return Layer.effect(Tag, config.forPage());
      }
    } as unknown as RequestStateTagClass<N, Self, Shape>;
  };
}

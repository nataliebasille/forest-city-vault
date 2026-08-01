import { Saga, withSaga } from "@forest-city-vault/platform-saga";
import { Effect, Layer } from "effect";
import { MustBeNever } from "../types.internal";
import { toSafeErrorDetails } from "./error-details.internal";
import { buildRequestStateLayer, RequestStateDeps } from "./request/layer";

/**
 * A pure wrapper applied around a page handler. It typically leaves the success
 * and error channels intact (the node the handler renders is the node the page
 * returns) while enriching the requirement channel — for example reading a
 * request-trace service to annotate every log the handler emits.
 */
type PageMiddleware = (
  self: Effect.Effect<unknown, unknown, unknown>,
) => Effect.Effect<unknown, unknown, unknown>;

const identityTransform: PageMiddleware = (next) => next;

const PageOverride = Symbol.for("platform-nextjs-effect/PageOverride");

/**
 * A page produced by {@link definePage}. It is callable as a Next.js page/layout
 * component `(props) => Promise<A>` and additionally carries a hidden seam
 * ({@link PageOverride}) that {@link testPage} uses to run the same pipeline
 * against replacement layers.
 */
export type PageHandler<Props, A, LOut> = ((props: Props) => Promise<A>) & {
  readonly [PageOverride]: (
    layer: Layer.Layer<LOut, unknown, Saga | RequestStateDeps>,
    requestState: Layer.Layer<RequestStateDeps, unknown, never>,
    props: Props,
  ) => Promise<A>;
};

/**
 * Creates a page factory bound to a dependency `layer` (and optional
 * `middleware`). The returned function wraps a handler into an `async` page
 * component `(props) => Promise<A>` suitable for a Next.js `page.tsx` (or
 * `layout.tsx`) default export.
 *
 * This is the page analog of `defineServerAction`. Where a server action
 * receives its own argument list, a page receives the single props object Next
 * passes to a route segment (e.g. `{ params, searchParams }`, each a promise)
 * and resolves with the handler's rendered value. Request state (`Headers`,
 * `Cookies`, …) is read from the ambient Next.js request via `next/headers`, so
 * the `layer` — and any `middleware` — may `yield* Headers` to, for example,
 * recover or mint a request id and expose it as a service the handler carries.
 *
 * Wiring, from the handler outwards:
 *  1. `middleware` wraps the handler, so it can annotate logs (e.g. with a
 *     request id) around everything the handler does.
 *  2. `layer` is provided, satisfying the handler's and middleware's services.
 *     The layer may require request-state services (provided below) and may
 *     require {@link Saga} (satisfied next).
 *  3. {@link withSaga} opens one scope per render and provides `Saga`, so a
 *     handler may require `Saga` — and provide saga-scoped layers such as a
 *     database transaction — without it counting as a missing dependency.
 *  4. The page request-state layer is provided (backed by `next/headers`).
 *
 * The boundary logs one lifecycle line per render — `page.completed` on success,
 * `page.failed` on a typed failure, `page.defect` on an unexpected defect — each
 * tagged with the page `name`. A typed failure or defect is re-raised, so
 * `Effect.runPromise` rejects and the failure surfaces to Next.js (its error
 * boundary / `error.tsx`); a handler that redirects or renders `notFound()`
 * should call those `next/navigation` helpers, which throw the control-flow
 * signals Next expects.
 *
 * The `layer` is kept as a distinct, replaceable input so tests can swap it via
 * {@link testPage} without the production layer ever being constructed.
 */
export function definePage<LOut, LErr>(config: {
  layer: Layer.Layer<LOut, LErr, Saga | RequestStateDeps>;
  middleware?: PageMiddleware;
}): <Props, A, E, R>(
  name: string,
  handler: (
    props: Props,
  ) => Effect.Effect<A, E, R> &
    MustBeNever<Exclude<R, LOut | RequestStateDeps | Saga>>,
) => PageHandler<Props, A, LOut> {
  const middleware = config.middleware ?? identityTransform;

  return ((
    name: string,
    handler: (props: unknown) => Effect.Effect<unknown, unknown, unknown>,
  ): PageHandler<unknown, unknown, unknown> => {
    const run = (
      layer: Layer.Layer<unknown, unknown, Saga | RequestStateDeps>,
      requestState: Layer.Layer<RequestStateDeps, unknown, never>,
      props: unknown,
    ) => {
      const startedAt = Date.now();
      const pageContext = { page: name };

      return Effect.runPromise(
        middleware(handler(props)).pipe(
          Effect.provide(layer),
          withSaga,
          Effect.provide(requestState),
          Effect.tapBoth({
            onFailure: (error) =>
              Effect.logError("page.failed", {
                ...pageContext,
                durationMs: Date.now() - startedAt,
                failureDisposition: "expected_terminal",
                error: toSafeErrorDetails(error),
              }),
            onSuccess: () =>
              Effect.logInfo("page.completed", {
                ...pageContext,
                durationMs: Date.now() - startedAt,
              }),
          }),
          Effect.tapDefect((cause) =>
            Effect.logError("page.defect", {
              ...pageContext,
              durationMs: Date.now() - startedAt,
              failureDisposition: "unexpected_defect",
              error: toSafeErrorDetails(cause),
            }),
          ),
        ) as unknown as Effect.Effect<unknown, unknown, never>,
      );
    };

    const pageFn = ((props: unknown) =>
      run(
        config.layer as Layer.Layer<unknown, unknown, Saga | RequestStateDeps>,
        buildRequestStateLayer("page"),
        props,
      )) as PageHandler<unknown, unknown, unknown>;

    (pageFn as { [PageOverride]: typeof run })[PageOverride] = run;

    return pageFn;
  }) as ReturnType<typeof definePage<LOut, LErr>>;
}

/**
 * Runs a {@link definePage} handler with replacement layers.
 *
 * The production `layer` bound in `definePage` is not referenced, so its
 * resources are never acquired. `options.layer` must cover the same service
 * surface (`LOut`) as the production layer. `options.requestState` replaces the
 * `next/headers`-backed request state, which is unavailable outside a real
 * Next.js request; supply a layer that provides `Headers`, `Cookies` and `Body`.
 */
export function testPage<Props, A, LOut>(
  page: PageHandler<Props, A, LOut>,
  options: {
    layer: Layer.Layer<LOut, unknown, Saga | RequestStateDeps>;
    requestState: Layer.Layer<RequestStateDeps, unknown, never>;
  },
) {
  return (props: Props) =>
    page[PageOverride](options.layer, options.requestState, props);
}

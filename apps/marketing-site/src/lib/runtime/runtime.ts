import { defineServerAction } from "@forest-city-vault/platform-nextjs-effect";
import { AppLive } from "./live";
import { RequestTraceMiddleware } from "./request-trace";

export { AppLive } from "./live";

/**
 * The default server-action factory for marketing-site. Every action runs with
 * {@link AppLive} provided (email transport + request trace) and every log it
 * emits is annotated with the request id via {@link RequestTraceMiddleware}.
 *
 * This is the server-action analog of Clover's `route`: a single boundary that
 * owns dependency wiring, request-id correlation and lifecycle logging so each
 * handler can focus on its own work.
 */
export const action = defineServerAction({
  layer: AppLive,
  middleware: RequestTraceMiddleware,
});

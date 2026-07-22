import { ResendEmailSender } from "@forest-city-vault/core-email";
import { Layer } from "effect";
import { RequestTraceLayer } from "./request-trace";

/**
 * Production dependency layer for marketing-site server actions.
 *
 * Merges the two services every action carries:
 *  - {@link EmailSender} — the Resend-backed email transport.
 *  - {@link RequestTrace} — the per-request id, derived from the request headers.
 *
 * The residual `Headers` requirement (pulled in by {@link RequestTraceLayer}) is
 * satisfied by the request-state layer that `defineServerAction` provides from
 * `next/headers`.
 *
 * Kept in its own module so tests can supply a replacement layer via
 * `testServerAction` without ever constructing the production resources.
 */
export const AppLive = Layer.merge(ResendEmailSender, RequestTraceLayer);

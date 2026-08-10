import {
  definePage,
  defineRoute,
  defineServerAction,
  HttpResult,
} from "@forest-city-vault/platform-nextjs-effect";
import { Effect, Layer } from "effect";
import { redirect as nextRedirect } from "next/navigation";
import { CurrentUser } from "../auth/current-user";
import { requireActiveOwner } from "../auth/require-active-owner";
import { AppLive } from "./live";

export { AppLive } from "./live";

/**
 * The app's route factory. Every Route Handler in the portal is built with it so
 * they share one dependency surface — the {@link AppLive} base layer (database,
 * Better Auth session) — and the Effect route pipeline (logging,
 * request-state, `HttpResult` handling). Handlers may `yield*` any service the
 * layer provides without naming it; the request `Cookies`/`Headers` the layer
 * needs are supplied per request from `next/headers`. This is the admin-portal
 * analog of Clover's `route` helper.
 */
export const route = defineRoute({ layer: AppLive });

/**
 * The app's server-action factory — the {@link route} analog for Server Actions.
 * Bound to the same {@link AppLive} layer so actions (e.g. the magic-link send)
 * read the same services and get the same boundary logging, while their request
 * state (`Headers`, `Cookies`) comes from the ambient Next.js request.
 */
export const serverAction = defineServerAction({ layer: AppLive });

/**
 * A page anyone can reach. It runs on the Effect page pipeline (logging,
 * request-state, `HttpResult` handling) but with no application services — no
 * database, no Supabase auth, and never a `CurrentUser`. This keeps public pages
 * like `/login` cheap (they acquire no resources), though they are still rendered
 * on demand because the pipeline reads request state. A public page that needs a
 * service should be given a dedicated layer.
 */
export const publicPage = definePage({ layer: Layer.empty });

/**
 * A page that requires an authenticated, active owner. The layer resolves a
 * {@link CurrentUser} via {@link requireActiveOwner}; a failed gate (no session,
 * or no active owner membership) is turned into a redirect to `/login` before the
 * page handler ever runs. Handlers may `yield* CurrentUser` to read the visitor.
 */
export const privatePage = definePage({ layer: PrivateLive() });

/** Where the auth gate sends anonymous or unauthorized visitors. */
const LOGIN_PATH = "/login";

function PrivateLive() {
  const currentUser = Layer.effect(
    CurrentUser,
    requireActiveOwner.pipe(
      // Both "no session" (401) and "not an active owner" (403) send the visitor
      // to the login page. `redirect` throws Next's control-flow error, which
      // `definePage` re-raises so Next performs the navigation.
      Effect.catchIf(isAuthFailure, () =>
        Effect.sync(() => nextRedirect(LOGIN_PATH)),
      ),
    ),
  );

  return currentUser.pipe(Layer.provideMerge(AppLive));
}

function isAuthFailure(error: unknown): boolean {
  return (
    HttpResult.$is("Error")(error) &&
    (error.status === 401 || error.status === 403)
  );
}

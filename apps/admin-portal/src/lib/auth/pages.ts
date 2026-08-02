import {
  definePage,
  HttpResult,
} from "@forest-city-vault/platform-nextjs-effect";
import { Effect, Layer } from "effect";
import { redirect as nextRedirect } from "next/navigation";
import { AppLive } from "./app-layer";
import { CurrentUser } from "./current-user";
import { requireActiveOwner } from "./require-active-owner";

/** Where the auth gate sends anonymous or unauthorized visitors. */
const LOGIN_PATH = "/login";

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

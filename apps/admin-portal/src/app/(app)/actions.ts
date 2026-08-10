"use server";

import { Headers as RequestHeaders } from "@forest-city-vault/platform-nextjs-effect";
import { signOut } from "@/lib/auth/auth";
import { serverAction } from "@/runtime";
import { Effect } from "effect";
import { redirect } from "next/navigation";

/**
 * Signs the current owner out and returns them to `/login`.
 *
 * {@link signOut} clears the session cookie; its result is ignored so a transient
 * failure still ends the session locally and sends the visitor to `/login`. The
 * `redirect` throws Next's control-flow signal, which the {@link serverAction}
 * boundary re-raises so Next performs the navigation.
 */
export const signOutAction = serverAction("app/signOut", (_formData: FormData) =>
  Effect.gen(function* () {
    const requestHeaders = yield* RequestHeaders;

    yield* signOut(requestHeaders).pipe(Effect.ignore);

    return yield* Effect.sync(() => redirect("/login"));
  }),
);

"use server";

import { signOut } from "@/lib/auth/supabase-session";
import { serverAction } from "@/runtime";
import { Effect } from "effect";
import { redirect } from "next/navigation";

/**
 * Signs the current owner out and returns them to `/login`.
 *
 * `signOut` clears the session cookies; its result is ignored so a transient
 * failure to reach the Supabase auth server still ends the session locally and
 * sends the visitor to `/login`. The `redirect` throws Next's control-flow
 * signal, which the {@link serverAction} boundary re-raises so Next performs the
 * navigation.
 */
export const signOutAction = serverAction("app/signOut", (_formData: FormData) =>
  Effect.gen(function* () {
    yield* signOut.pipe(Effect.ignore);
    return yield* Effect.sync(() => redirect("/login"));
  }),
);

import type {
  StoreMembershipStatus,
  StoreRole,
} from "@forest-city-vault/domain";
import { Context } from "effect";

/**
 * The authenticated, authorized visitor a `privatePage` hands to its handler:
 * the Supabase user id paired with the active store membership that granted
 * access. `email`/`role`/`status` come from the membership row (the durable
 * source of truth), not the Supabase profile.
 */
export type CurrentUserValue = {
  readonly id: string;
  readonly email: string;
  readonly role: StoreRole;
  readonly status: StoreMembershipStatus;
};

/**
 * Service holding the {@link CurrentUserValue} for the current request. It is
 * provided by `privatePage` (never by `publicPage`), so a handler that
 * `yield* CurrentUser` is only reachable once the auth gate has passed.
 */
export class CurrentUser extends Context.Tag("admin-portal/CurrentUser")<
  CurrentUser,
  CurrentUserValue
>() {}

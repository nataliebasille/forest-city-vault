import { createdAt, fcvTable, id, updatedAt } from "./+helpers";
import {
  index,
  integer,
  pgEnum,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { stores } from "./stores";

export const storeRole = pgEnum("store_role", ["owner"]);

export const storeMembershipStatus = pgEnum("store_membership_status", [
  "active",
  "disabled",
]);

/**
 * Snapshot table for the `StoreMembership` aggregate: one user's access to one
 * store, keyed for authorization by `email`.
 *
 * `email` is the identity the admin portal gates on: the auth provider (Better
 * Auth) proves email ownership at sign-in, and the matching active membership is
 * what grants access. `user_id` is an opaque, non-authoritative identifier kept
 * only to satisfy its NOT NULL constraint and the historical unique index; it is
 * **not** a foreign key into the auth provider's tables and nothing reads it to
 * authorize a request.
 *
 * The `(store_id, user_id)` unique index enforces "a user may have only one
 * membership in a given store" at the database, backing the same rule in the
 * aggregate/application layer.
 */
export const storeMemberships = fcvTable(
  "store_memberships",
  {
    id: id(),

    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "no action" }),

    userId: uuid("user_id").notNull(),

    email: text("email").notNull(),

    role: storeRole("role").notNull(),
    status: storeMembershipStatus("status").notNull(),

    version: integer("version").notNull().default(0),

    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("store_memberships_store_user_uidx").on(
      table.storeId,
      table.userId,
    ),
    index("store_memberships_user_id_idx").on(table.userId),
    index("store_memberships_store_id_idx").on(table.storeId),
    // Supports active-membership lookups per store, including the active-owner
    // count the owner-preservation policy relies on.
    index("store_memberships_store_status_role_idx").on(
      table.storeId,
      table.status,
      table.role,
    ),
  ],
);

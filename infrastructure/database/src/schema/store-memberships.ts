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

export const storeRole = pgEnum("store_role", [
  "owner",
  "manager",
  "inventory",
  "finance",
  "readOnly",
]);

export const storeMembershipStatus = pgEnum("store_membership_status", [
  "active",
  "disabled",
]);

/**
 * Snapshot table for the `StoreMembership` aggregate: one Supabase user's access
 * to one store.
 *
 * `user_id` holds the Supabase Auth user UUID. It is intentionally **not** a
 * foreign key into Supabase-managed `auth.*` tables — the repo has no
 * established convention for referencing auth schema objects, and coupling this
 * table to them would make migrations and local testing depend on that schema.
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

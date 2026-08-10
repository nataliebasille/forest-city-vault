import { boolean, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createdAt, fcvTable, updatedAt } from "./+helpers";

/**
 * Better Auth's core tables, owned by Better Auth's Drizzle adapter rather than
 * by any domain aggregate. They back the admin portal's passwordless magic-link
 * sign-in: `authUser` is the authenticated identity, `authSession` the issued
 * session, `authAccount` the credential linkage, and `authVerification` the
 * single-use magic-link tokens (stored hashed).
 *
 * The primary keys are `text`, not the repo's `uuid` `id()` helper: Better Auth
 * generates its own string ids and supplies them on insert, so the column must
 * accept an arbitrary string. These tables are intentionally **not** linked by a
 * foreign key to `store_memberships` — the portal's authorization gate matches
 * on the verified email (see `StoreMembershipQueries.findByStoreAndEmail`), so
 * the Better Auth identity and the membership snapshot stay decoupled.
 *
 * The JS property names (`emailVerified`, `expiresAt`, `userId`, …) are the field
 * names Better Auth's adapter expects; the snake_case column names are the
 * physical schema. The adapter is handed these tables via its `schema` map in
 * `apps/admin-portal/src/lib/auth/auth.ts`.
 */
export const authUser = fcvTable(
  "auth_user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex("auth_user_email_uidx").on(table.email)],
);

export const authSession = fcvTable(
  "auth_session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex("auth_session_token_uidx").on(table.token)],
);

export const authAccount = fcvTable("auth_account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => authUser.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt,
  updatedAt,
});

export const authVerification = fcvTable("auth_verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt,
  updatedAt,
});

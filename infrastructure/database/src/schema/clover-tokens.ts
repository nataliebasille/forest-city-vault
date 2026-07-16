import { createdAt, fcvTable, updatedAt } from "./+helpers";
import { text, timestamp } from "drizzle-orm/pg-core";

/**
 * Per-merchant Clover OAuth tokens.
 *
 * Clover access tokens are issued per merchant via the authorization-code flow
 * (`/oauth/v2/token`) and expire, so each merchant's `access_token` /
 * `refresh_token` pair is persisted here and refreshed via `/oauth/v2/refresh`.
 *
 * `access_token` and `refresh_token` are credentials and are stored **encrypted
 * at rest** (see the token crypto helper in the Clover app); the columns hold
 * ciphertext, never plaintext.
 */
export const cloverMerchantTokens = fcvTable("clover_merchant_tokens", {
  merchantId: text("merchant_id").primaryKey(),

  appId: text("app_id").notNull(),

  accessToken: text("access_token").notNull(),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),

  refreshToken: text("refresh_token"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }),

  createdAt,
  updatedAt,
});

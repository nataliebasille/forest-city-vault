import { Effect, Option } from "effect";
import { eq } from "drizzle-orm";
import { Database } from "../database";
import { cloverMerchantTokens } from "../schema/clover-tokens";
import { tryDb } from "../utils/try-db";
import { onAmbientDatabase } from "../utils/on-ambient-database";

export type CloverMerchantTokenRow = typeof cloverMerchantTokens.$inferSelect;
export type CloverMerchantTokenInsert =
  typeof cloverMerchantTokens.$inferInsert;

/**
 * Persistence for per-merchant Clover OAuth tokens.
 *
 * Like the other repositories, every method reads the **ambient**
 * {@link Database} at call time (via {@link onAmbientDatabase}), so it runs on
 * the saga's transaction inside a `withSaga` boundary and on the base connection
 * otherwise, without the caller re-providing `Database`.
 *
 * Token values are opaque strings here — encryption/decryption is the caller's
 * responsibility (the Clover app encrypts before `upsert` and decrypts after
 * `getByMerchantId`), so ciphertext is all that ever touches the database.
 */
export const CloverTokenRepository = {
  getByMerchantId: (merchantId: string) =>
    onAmbientDatabase(
      Effect.gen(function* () {
        const db = yield* Database;
        const rows = yield* db.query((sql) =>
          sql
            .select()
            .from(cloverMerchantTokens)
            .where(eq(cloverMerchantTokens.merchantId, merchantId))
            .limit(1),
        );

        return Option.fromNullable(rows[0]);
      }),
    ),

  /**
   * Inserts the merchant's tokens, or overwrites them when the merchant
   * re-authorizes or the tokens are refreshed. `merchant_id` is the primary key,
   * so a conflict updates the token columns and bumps `updated_at`.
   */
  upsert: (row: CloverMerchantTokenInsert) =>
    onAmbientDatabase(
      Effect.gen(function* () {
        const db = yield* Database;
        yield* db.query((sql) =>
          sql
            .insert(cloverMerchantTokens)
            .values([row])
            .onConflictDoUpdate({
              target: cloverMerchantTokens.merchantId,
              set: {
                appId: row.appId,
                accessToken: row.accessToken,
                accessTokenExpiresAt: row.accessTokenExpiresAt,
                refreshToken: row.refreshToken,
                refreshTokenExpiresAt: row.refreshTokenExpiresAt,
                updatedAt: row.updatedAt,
              },
            }),
        );
      }),
    ),
} as const;

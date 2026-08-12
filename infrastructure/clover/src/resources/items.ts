import { Effect, Redacted, Schema } from "effect";
import { makeRequest } from "../make-request";
import { resolveMerchantAccessToken } from "../auth";

// Clover returns monetary values as either JSON numbers or strings in cents
// (e.g. `"price": "1000"`), so decode tolerates both and lands as a number.
const CloverNumber = Schema.Union(Schema.Number, Schema.NumberFromString);

const CloverReference = Schema.Struct({ id: Schema.String });

/**
 * A Clover inventory item. Each item is the source of a vendor item
 * (`vendor_items.clover_item_id`). `categories` is an expandable collection that
 * maps the item to the vendor's Clover category — request `expand=categories` to
 * populate it (see {@link getCloverItem}/{@link listCloverItems}). `price` is in
 * cents; `modifiedTime` is the watermark axis for the mutable items stream.
 */
export const CloverItemSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.optional(Schema.String),
  price: Schema.optional(CloverNumber),
  modifiedTime: Schema.Number,
  categories: Schema.optional(
    Schema.Struct({
      elements: Schema.optional(Schema.Array(CloverReference)),
    }),
  ),
});

export type CloverItem = typeof CloverItemSchema.Type;

export const CloverItemListSchema = Schema.Struct({
  elements: Schema.Array(CloverItemSchema),
  href: Schema.optional(Schema.String),
});

export type CloverItemList = typeof CloverItemListSchema.Type;

/**
 * Fetches a single inventory item with its categories expanded, so the caller
 * can resolve which vendor (Clover category) the item belongs to.
 *
 * `expand=categories` requires the merchant token to hold the **Read inventory**
 * permission; a token without it is rejected by Clover with a `403`.
 */
export function getCloverItem(merchantId: string, itemId: string) {
  return Effect.gen(function* () {
    const redactedToken = yield* resolveMerchantAccessToken(merchantId);
    const accessToken = Redacted.value(redactedToken);

    return yield* makeRequest({
      method: "GET",
      path: `/v3/merchants/${merchantId}/items/${itemId}`,
      accessToken,
      responseSchema: CloverItemSchema,
      urlParams: { expand: "categories" },
    });
  });
}

/**
 * Lists a page of inventory items for the merchant.
 *
 * `filter` is a Clover query filter (e.g. `modifiedTime>=1700000000000`).
 * `orderBy` is a Clover sort spec (e.g. `modifiedTime ASC`).
 *
 * Categories are expanded by default (`expand=categories`) so the importer can
 * map each item to its vendor without a second call; pass a different `expand`
 * to override. This requires the token to hold **Read inventory** permission.
 */
export function listCloverItems(
  merchantId: string,
  options?: {
    readonly limit?: number;
    readonly offset?: number;
    readonly filter?: string;
    readonly orderBy?: string;
    readonly expand?: string;
  },
) {
  return Effect.gen(function* () {
    const redactedToken = yield* resolveMerchantAccessToken(merchantId);
    const accessToken = Redacted.value(redactedToken);

    const urlParams: Record<string, string> = {
      expand: options?.expand ?? "categories",
    };
    if (options?.limit !== undefined) {
      urlParams.limit = String(options.limit);
    }
    if (options?.offset !== undefined) {
      urlParams.offset = String(options.offset);
    }
    if (options?.filter !== undefined) {
      urlParams.filter = options.filter;
    }
    if (options?.orderBy !== undefined) {
      urlParams.orderBy = options.orderBy;
    }

    return yield* makeRequest({
      method: "GET",
      path: `/v3/merchants/${merchantId}/items`,
      accessToken,
      responseSchema: CloverItemListSchema,
      urlParams,
    });
  });
}

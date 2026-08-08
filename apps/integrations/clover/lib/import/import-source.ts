import { Effect } from "effect";

/**
 * Describes how to incrementally pull one kind of entity from Clover into its
 * inbox. The generic {@link runImport} engine owns the cursor/paging loop; a
 * source supplies only the entity-specific pieces, so adding a new entity (e.g.
 * vendor items) is a new descriptor plus a list resource — no engine changes.
 *
 * Type parameters:
 * - `Element` the shape of one listed record.
 * - `R`       the services the `list`/`enqueue` effects require (e.g. HttpClient,
 *             CloverConfig, Database). They are all provided at the route
 *             boundary, so this simply threads their requirements through.
 */
export type ImportSource<Element, R> = {
  /**
   * Stream identity, used as the cursor's `entity_type` and in logs. Stable per
   * entity kind, e.g. `"payment"` or `"vendor_item"`.
   */
  readonly entityType: string;

  /**
   * The Clover field the watermark tracks. Append-mostly streams (payments) use
   * `createdTime`; mutable streams (items) should use `modifiedTime` so edits are
   * re-pulled. Documents the axis the source's `list` filters/sorts on.
   */
  readonly watermarkAxis: "createdTime" | "modifiedTime";

  /**
   * Fetches one ascending page at/after `startTimestamp` (inclusive) on the
   * watermark axis. The engine pages by `offset` until a short page is returned.
   */
  readonly list: (input: {
    readonly merchantId: string;
    readonly startTimestamp: number;
    readonly limit: number;
    readonly offset: number;
  }) => Effect.Effect<readonly Element[], unknown, R>;

  /** The watermark-axis timestamp (epoch ms) of a listed element. */
  readonly getTimestamp: (element: Element) => number;

  /**
   * Persists a page of elements into the entity's inbox, idempotently (so the
   * re-included watermark boundary and any webhook overlap never duplicate). It
   * owns its inbox table and idempotency-key scheme; it returns how many rows it
   * newly inserted.
   */
  readonly enqueue: (
    elements: readonly Element[],
    context: {
      readonly merchantId: string;
      readonly requestId: string;
      readonly receivedAt: Date;
    },
  ) => Effect.Effect<{ readonly inserted: number }, unknown, R>;
};

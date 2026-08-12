import { Effect } from "effect";

/**
 * Describes how to incrementally pull one kind of entity from Clover into its
 * inbox. The generic {@link runImport} engine owns the cursor/watermark; a
 * source supplies only the entity-specific pieces — including how many records a
 * single list page holds — so adding a new entity (e.g. vendor items) is a new
 * descriptor plus a list resource — no engine changes.
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
   * entity kind, e.g. `"order"` or `"vendor_item"`.
   */
  readonly entityType: string;

  /**
   * The Clover field the watermark tracks. Mutable streams (orders/items) use
   * `modifiedTime`; append-mostly streams can use `createdTime`.
   * Documents the axis the source's `list` filters/sorts on.
   */
  readonly watermarkAxis: "createdTime" | "modifiedTime";

  /**
   * Fetches a single ascending page at/after `startTimestamp` (inclusive) on the
   * watermark axis. The source owns how many records the page holds; the engine
   * fetches one page per run and advances the watermark, so a backlog is worked
   * off across successive runs.
   */
  readonly list: (input: {
    readonly merchantId: string;
    readonly startTimestamp: number;
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

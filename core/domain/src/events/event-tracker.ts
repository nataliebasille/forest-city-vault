import { Context, Effect, Layer } from "effect";
import { AggregateEvent } from "./event";
import { ConcurrencyError } from "./event-store";
import { AnyAggregateRoot } from "../aggregates/aggregate-root";

const streamKey = (aggType: string, aggId: string) => `${aggType}:${aggId}`;

type TrackedStream = {
  baseVersion: number;
  events: AggregateEvent<string, unknown>[];
};

/**
 * Tracks the events applied to aggregates during a unit of work, keeping the
 * event store decoupled from aggregation. Action dispatchers record the events
 * they apply here; the repository drains them when saving (appending them to
 * the durable event stream) and replays any still-tracked events onto an
 * aggregate it loads via {@link EventTracker.Service.peek}.
 *
 * Buffering, version bookkeeping and concurrency detection all live here — the
 * {@link EventStore} is only responsible for durable persistence.
 */
export class EventTracker extends Context.Tag("core/domain/EventTracker")<
  EventTracker,
  EventTracker.Service
>() {
  /**
   * Builds an in-memory {@link EventTracker}. Tracked events are staged per
   * aggregate until they are drained (on save) or discarded when the layer is
   * released.
   */
  static readonly make: Layer.Layer<EventTracker> = Layer.sync(
    EventTracker,
    () => {
      const trackedStreams = new Map<string, TrackedStream>();

      return {
        track: (aggType, fromAgg, events) =>
          Effect.gen(function* () {
            const aggId = String(fromAgg.id);
            const key = streamKey(aggType, aggId);
            const existing = trackedStreams.get(key);

            if (!existing) {
              trackedStreams.set(key, {
                baseVersion: fromAgg.version,
                events: [...events],
              });

              return;
            }

            const expectedVersion =
              existing.baseVersion + existing.events.length;
            if (fromAgg.version !== expectedVersion) {
              return yield* Effect.fail(
                new ConcurrencyError({
                  aggType,
                  aggId,
                  expectedVersion,
                  actualVersion: fromAgg.version,
                }),
              );
            }

            existing.events.push(...events);
          }),

        drain: (aggType, aggId) =>
          Effect.sync(() => {
            const key = streamKey(aggType, aggId);
            const existing = trackedStreams.get(key);

            if (!existing) {
              return undefined;
            }

            trackedStreams.delete(key);

            return {
              baseVersion: existing.baseVersion,
              events: existing.events,
            } satisfies EventTracker.TrackedEvents;
          }),

        peek: (aggType, aggId) =>
          Effect.sync(() => {
            const existing = trackedStreams.get(streamKey(aggType, aggId));

            return existing ? existing.events : [];
          }),
      } satisfies EventTracker.Service;
    },
  );
}

export namespace EventTracker {
  export type TrackedEvents = {
    readonly baseVersion: number;
    readonly events: readonly AggregateEvent<string, unknown>[];
  };

  export type Service = {
    /**
     * Records the events applied to an aggregate. `fromAgg` is the aggregate as
     * it was *before* the events were applied; its version anchors the tracked
     * stream and is used to detect concurrent modifications across successive
     * tracks within the same unit of work.
     */
    track: (
      aggType: string,
      fromAgg: AnyAggregateRoot,
      events: readonly AggregateEvent<string, any>[],
    ) => Effect.Effect<void, ConcurrencyError>;

    /**
     * Removes and returns the events tracked for an aggregate, along with the
     * base version they should be appended after. Returns `undefined` when
     * nothing has been tracked.
     */
    drain: (
      aggType: string,
      aggId: string,
    ) => Effect.Effect<TrackedEvents | undefined>;

    /**
     * Returns the events currently tracked for an aggregate without removing
     * them, so they can be replayed onto a freshly loaded aggregate.
     */
    peek: (
      aggType: string,
      aggId: string,
    ) => Effect.Effect<readonly AggregateEvent<string, unknown>[]>;
  };
}

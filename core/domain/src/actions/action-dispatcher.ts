import { Effect } from "effect";
import {
  AggregateType_GetActionDefinitions,
  AggregateType_GetEvents,
  AggregateType_GetId,
  AggregateType_GetInstance,
  AggregateType_GetName,
  AggregateType_GetSnapshot,
  AnyAggregateMetadata,
  WithAggregateMetadata,
} from "../aggregate-type-factory";
import {
  MaterializedAggregateRoot,
  PristineAggregateRoot,
} from "../aggregates/aggregate-root";
import { Reducer } from "../events/events.internal";
import {
  ConcurrencyError,
  EventStore,
  UnknownEventStoreError,
} from "../events/event-store";

type ActionDispatchEffect<M extends WithAggregateMetadata<AnyAggregateMetadata>, E, R> =
  Effect.Effect<
    MaterializedAggregateRoot<
      AggregateType_GetId<M>,
      AggregateType_GetSnapshot<M>
    >,
    E | ConcurrencyError | UnknownEventStoreError,
    EventStore | R
  >;

export type InitializingActionDispatcher<
  M extends WithAggregateMetadata<AnyAggregateMetadata>,
  Payload,
  E = never,
  R = never,
> = (
  aggregate: PristineAggregateRoot<AggregateType_GetId<M>>,
  payload: Payload,
) => ActionDispatchEffect<M, E, R>;

export type UpdatingActionDispatcher<
  M extends WithAggregateMetadata<AnyAggregateMetadata>,
  Payload,
  E = never,
  R = never,
> = (
  aggregate: MaterializedAggregateRoot<
    AggregateType_GetId<M>,
    AggregateType_GetSnapshot<M>
  >,
  payload: Payload,
) => ActionDispatchEffect<M, E, R>;

export type ActionDispatcher<
  M extends WithAggregateMetadata<AnyAggregateMetadata>,
  A extends AggregateType_GetActionDefinitions<M>,
> = {
  [K in keyof A]: A[K] extends (...args: infer Args) => Effect.Effect<any, infer E, infer R>
    ? Args extends [payload: infer Payload]
      ? InitializingActionDispatcher<M, Payload, E, R>
      : Args extends [
            snapshot: AggregateType_GetSnapshot<M>,
            payload: infer Payload,
          ]
        ? UpdatingActionDispatcher<M, Payload, E, R>
        : never
    : never;
};

export function createActionDispatchers<
  M extends WithAggregateMetadata<AnyAggregateMetadata>,
  A extends AggregateType_GetActionDefinitions<M>,
>(name: AggregateType_GetName<M>, reducer: Reducer<M>, actions: A) {
  return Object.fromEntries(
    Object.entries(actions).map(([key, handler]) => {
      return [
        key,
        (agg: AggregateType_GetInstance<M>, payload: any) =>
          Effect.gen(function* () {
            const handlerArgs: [any, any?] =
              agg.version > 0 ? [agg.snapshot, payload] : [payload];

            const handlerEvents = yield* handler(...handlerArgs);
            const eventsToApply: AggregateType_GetEvents<M>[] = Array.isArray(
              handlerEvents,
            )
              ? handlerEvents
              : [handlerEvents];

            const reduceEvents = (
              previous: AggregateType_GetInstance<M>,
              event: AggregateType_GetEvents<M>,
            ): AggregateType_GetInstance<M> =>
              (
                reducer as (
                  agg: AggregateType_GetInstance<M>,
                  event: AggregateType_GetEvents<M>,
                ) => AggregateType_GetInstance<M>
              )(previous, event);

            const nextAgg = eventsToApply.reduce(reduceEvents, agg);

            const eventStore = yield* EventStore;
            yield* eventStore.append(name, agg, eventsToApply);

            return nextAgg;
          }),
      ];
    }),
  ) as ActionDispatcher<M, A>;
}

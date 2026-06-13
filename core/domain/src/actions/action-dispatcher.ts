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
import { Reducer } from "../events/event-reducer";
import { EventStore } from "../events/event-store";

export type InitializingActionDispatcher<
  M extends WithAggregateMetadata<AnyAggregateMetadata>,
  Payload,
> = (
  aggregate: PristineAggregateRoot<AggregateType_GetId<M>>,
  payload: Payload,
) => MaterializedAggregateRoot<
  AggregateType_GetId<M>,
  AggregateType_GetSnapshot<M>
>;

export type UpdatingActionDispatcher<
  M extends WithAggregateMetadata<AnyAggregateMetadata>,
  Payload,
> = (
  aggregate: MaterializedAggregateRoot<
    AggregateType_GetId<M>,
    AggregateType_GetSnapshot<M>
  >,
  payload: Payload,
) => MaterializedAggregateRoot<
  AggregateType_GetId<M>,
  AggregateType_GetSnapshot<M>
>;

export type ActionDispatcher<
  M extends WithAggregateMetadata<AnyAggregateMetadata>,
  A extends AggregateType_GetActionDefinitions<M>,
> = {
  [K in keyof A]: A[K] extends (...args: infer Args) => any
    ? Args extends [payload: infer Payload]
      ? InitializingActionDispatcher<M, Payload>
      : Args extends [
            snapshot: AggregateType_GetSnapshot<M>,
            payload: infer Payload,
          ]
        ? UpdatingActionDispatcher<M, Payload>
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
            eventStore.append(name, agg, eventsToApply);

            return nextAgg;
          }),
      ];
    }),
  ) as ActionDispatcher<M, A>;
}

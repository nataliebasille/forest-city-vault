export type AggregateEvent<Type extends string, Payload> = {
  type: Type;
  payload: Payload;
} & {};

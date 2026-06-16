import { Brand, Effect } from "effect";

export type AggregateIdValue = string | number | symbol | object;
export type AggregateId<T extends AggregateIdValue, K extends string> = T &
  Brand.Brand<K>;
export type AnyAggregateId = AggregateId<AggregateIdValue, any>;

export type AggregateId_GetKey<Id extends AnyAggregateId> =
  Id extends AggregateId<any, infer K> ? K : never;

export type PristineAggregateRoot<in out Id extends AnyAggregateId> = {
  readonly id: Id;
  readonly version: 0;
  readonly snapshot?: never;
};

export type MaterializedAggregateRoot<
  Id extends AnyAggregateId,
  Props extends Record<string, unknown>,
> = {
  readonly id: Id;
  readonly version: number;
  readonly snapshot: Readonly<Props>;
};

export type AggregateRoot<
  Id extends AnyAggregateId,
  Props extends Record<string, unknown>,
> = PristineAggregateRoot<Id> | MaterializedAggregateRoot<Id, Props>;

export type AnyAggregateRoot = AggregateRoot<
  AnyAggregateId,
  Record<string, unknown>
>;

export type AggregateRoot_GetId<
  AR extends AggregateRoot<AnyAggregateId, Record<string, unknown>>,
> = AR["id"];

export type AggregateRoot_GetProps<
  AR extends AggregateRoot<AnyAggregateId, Record<string, unknown>>,
> = AR extends AggregateRoot<AnyAggregateId, infer Props> ? Props : never;

export type AggregateRoot_PristineVariant<AR extends AnyAggregateRoot> =
  Extract<AR, { version: 0 }>;

export type AggregateRoot_MaterializedVariant<AR extends AnyAggregateRoot> =
  Extract<AR, { snapshot: unknown }>;

export function isPristineAggregateRoot<Agg extends AnyAggregateRoot>(
  agg: Agg,
): agg is Extract<Agg, { version: 0 }> {
  return "version" in agg && agg.version === 0;
}

export function isMaterializedAggregateRoot<Agg extends AnyAggregateRoot>(
  agg: Agg,
): agg is Extract<Agg, { snapshot: unknown }> {
  return "snapshot" in agg;
}

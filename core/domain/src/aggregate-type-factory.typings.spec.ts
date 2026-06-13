import { describe, it } from "node:test";
import { Effect, Schema } from "effect";
import { expectTypeOf } from "expect-type";
import {
  defineAggregateType,
  type AggregateType,
  type AggregateType_GetEvents,
  type AggregateType_GetId,
  type AggregateType_GetInstance,
  type AggregateType_GetMetadata,
  type AggregateType_GetSnapshot,
  type EnsureAggregateType,
} from "./aggregate-type-factory";
import type { AggregateId, AggregateRoot } from "./aggregates/aggregate-root";
import type { AggregateEvent } from "./events/event";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const OrderSchema = Schema.Struct({
  title: Schema.String,
  quantity: Schema.Number,
});
type OrderSchema = typeof OrderSchema;
type OrderData = OrderSchema["Type"];

const orderEvents = {
  OrderPlaced: (payload: { title: string; quantity: number }): OrderData => ({
    title: payload.title,
    quantity: payload.quantity,
  }),
  OrderQuantityUpdated: (
    snapshot: OrderData,
    payload: { quantity: number },
  ): OrderData => ({
    ...snapshot,
    quantity: payload.quantity,
  }),
};

const OrderAggregate = defineAggregateType({
  name: "Order",
  raw: () => Effect.succeed("uuid" as string),
  schema: OrderSchema,
  events: orderEvents,
  actions: {},
});

type OrderAT = typeof OrderAggregate;

// The branded Id type produced by createAggregateIdFactory("Order") with RawId = string
type OrderId = AggregateId<
  Readonly<{ entity: "Order"; value: string }>,
  "Order"
>;

// ─── EnsureAggregateType ──────────────────────────────────────────────────────

describe("EnsureAggregateType", () => {
  it("is mutually assignable with the original AggregateType", () => {
    type Result = EnsureAggregateType<OrderAT>;
    expectTypeOf<Result>().toExtend<OrderAT>();
    expectTypeOf<OrderAT>().toExtend<Result>();
  });

  it("resolves to never for a plain object that is not an AggregateType", () => {
    type Result = EnsureAggregateType<{ name: "Foo" }>;
    expectTypeOf<Result>().toBeNever();
  });

  it("resolves to never for a primitive type", () => {
    type Result = EnsureAggregateType<string>;
    expectTypeOf<Result>().toBeNever();
  });

  it("resolves to never for never", () => {
    type Result = EnsureAggregateType<never>;
    expectTypeOf<Result>().toBeNever();
  });
});

// ─── AggregateType_GetMetadata ────────────────────────────────────────────────

describe("AggregateType_GetMetadata", () => {
  it("exposes the aggregate name literal", () => {
    type Result = AggregateType_GetMetadata<OrderAT>;
    expectTypeOf<Result>().toExtend<{ name: "Order" }>();
  });

  it("exposes the snapshot type", () => {
    type Result = AggregateType_GetMetadata<OrderAT>;
    expectTypeOf<Result>().toExtend<{ snapshot: OrderData }>();
  });

  it("exposes the events definitions", () => {
    type Result = AggregateType_GetMetadata<OrderAT>;
    expectTypeOf<Result>().toExtend<{ events: typeof orderEvents }>();
  });

  it("resolves to never for a non-AggregateType", () => {
    type Result = AggregateType_GetMetadata<{ name: "Foo" }>;
    expectTypeOf<Result>().toBeNever();
  });
});

// ─── AggregateType_GetId ──────────────────────────────────────────────────────

describe("AggregateType_GetId", () => {
  it("extracts the branded aggregate id type", () => {
    type Result = AggregateType_GetId<OrderAT>;
    expectTypeOf<Result>().toEqualTypeOf<OrderId>();
  });

  it("resolves to never for a non-AggregateType", () => {
    type Result = AggregateType_GetId<{ name: "Foo" }>;
    expectTypeOf<Result>().toBeNever();
  });
});

// ─── AggregateType_GetSnapshot ────────────────────────────────────────────────

describe("AggregateType_GetSnapshot", () => {
  it("extracts the schema snapshot type", () => {
    type Result = AggregateType_GetSnapshot<OrderAT>;
    expectTypeOf<Result>().toEqualTypeOf<OrderData>();
  });

  it("resolves to never for a non-AggregateType", () => {
    type Result = AggregateType_GetSnapshot<{ name: "Foo" }>;
    expectTypeOf<Result>().toBeNever();
  });
});

// ─── AggregateType_GetEvents ──────────────────────────────────────────────────

describe("AggregateType_GetEvents", () => {
  it("extracts the union of all create and update events", () => {
    type Result = AggregateType_GetEvents<OrderAT>;
    type Expected =
      | AggregateEvent<"OrderPlaced", { title: string; quantity: number }>
      | AggregateEvent<"OrderQuantityUpdated", { quantity: number }>;
    expectTypeOf<Result>().toEqualTypeOf<Expected>();
  });

  it("includes the create event in the union", () => {
    type Result = AggregateType_GetEvents<OrderAT>;
    expectTypeOf<
      AggregateEvent<"OrderPlaced", { title: string; quantity: number }>
    >().toExtend<Result>();
  });

  it("includes the update event in the union", () => {
    type Result = AggregateType_GetEvents<OrderAT>;
    expectTypeOf<
      AggregateEvent<"OrderQuantityUpdated", { quantity: number }>
    >().toExtend<Result>();
  });

  it("resolves to never for a non-AggregateType", () => {
    type Result = AggregateType_GetEvents<{ name: "Foo" }>;
    expectTypeOf<Result>().toBeNever();
  });
});

// ─── AggregateType_GetInstance ────────────────────────────────────────────────

describe("AggregateType_GetInstance", () => {
  it("returns AggregateRoot parameterized with the correct id and snapshot", () => {
    type Result = AggregateType_GetInstance<OrderAT>;
    type Expected = AggregateRoot<OrderId, OrderData>;
    expectTypeOf<Result>().toEqualTypeOf<Expected>();
  });

  it("the instance id type matches AggregateType_GetId", () => {
    type Instance = AggregateType_GetInstance<OrderAT>;
    type Id = AggregateType_GetId<OrderAT>;
    expectTypeOf<Instance["id"]>().toEqualTypeOf<Id>();
  });
});

// ─── AggregateType (structural) ───────────────────────────────────────────────

describe("AggregateType", () => {
  it("defineAggregateType result is assignable to AggregateType with explicit type params", () => {
    type Explicit = AggregateType<
      "Order",
      string,
      OrderSchema,
      typeof orderEvents,
      {}
    >;
    expectTypeOf<OrderAT>().toExtend<Explicit>();
    expectTypeOf<Explicit>().toExtend<OrderAT>();
  });
});

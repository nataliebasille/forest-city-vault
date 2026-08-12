import { Orders } from "@forest-city-vault/domain";
import { Effect } from "effect";

export const DEFAULT_SEED_MERCHANT_ID = "seed-merchant";

export type SeedOrderItem = {
  readonly name: string;
  readonly amountCents: number;
};

export type SeedOrder = {
  readonly id: string;
  readonly hoursAgo: number;
  readonly items: readonly SeedOrderItem[];
};

export type SeedOrdersInput = {
  readonly merchantId?: string;
  readonly orders?: readonly SeedOrder[];
  readonly now?: Date;
};

export type SeedOrdersResult = {
  readonly seeded: number;
  readonly orderIds: readonly string[];
};

export const seedOrders = (input: SeedOrdersInput = {}) =>
  Effect.gen(function* () {
    const merchantId = input.merchantId ?? DEFAULT_SEED_MERCHANT_ID;
    const seeds = input.orders ?? DEFAULT_SEED_ORDERS;
    const nowMs = (input.now ?? new Date()).getTime();

    for (const seed of seeds) {
      const timestamp = new Date(nowMs - seed.hoursAgo * MS_PER_HOUR);
      const totalCents = seed.items.reduce((sum, item) => sum + item.amountCents, 0);

      const order = yield* Orders.actions.fromCloverOrder(
        Orders.pristine(seed.id),
        {
          order: {
            merchantId,
            orderId: seed.id,
            idempotencyKey: `seed:${merchantId}:${seed.id}:${timestamp.getTime()}`,
            timestamp,
            modifiedTime: timestamp.getTime(),
            paymentState: "PAID",
            subtotal: totalCents,
            tax: 0,
            discount: 0,
            total: totalCents,
            payments: [
              {
                paymentId: `seed-payment-${seed.id}`,
                amount: totalCents,
                tipAmount: 0,
                taxAmount: 0,
                result: "SUCCESS",
              },
            ],
          },
          items: seed.items.map((item) => ({
            cloverItemId: "",
            name: item.name,
            quantity: 1,
            grossAmount: item.amountCents,
            discountAmount: 0,
            netAmount: item.amountCents,
            collectedAmount: item.amountCents,
            refunded: false,
          })),
        },
      );

      yield* Orders.repository.save(order);
    }

    return {
      seeded: seeds.length,
      orderIds: seeds.map((seed) => seed.id),
    } satisfies SeedOrdersResult;
  });

const MS_PER_HOUR = 60 * 60 * 1000;

const DEFAULT_SEED_ORDERS: readonly SeedOrder[] = [
  {
    id: "seed-order-1",
    hoursAgo: 1,
    items: [{ name: "Vintage denim jacket", amountCents: 2499 }],
  },
  {
    id: "seed-order-2",
    hoursAgo: 3,
    items: [
      { name: "Ceramic mug", amountCents: 1250 },
      { name: "Enamel pin", amountCents: 800 },
    ],
  },
  {
    id: "seed-order-3",
    hoursAgo: 6,
    items: [{ name: "Hand-thrown vase", amountCents: 4500 }],
  },
  {
    id: "seed-order-4",
    hoursAgo: 30,
    items: [{ name: "Wool throw blanket", amountCents: 3375 }],
  },
  {
    id: "seed-order-5",
    hoursAgo: 54,
    items: [
      { name: "Leather journal", amountCents: 1500 },
      { name: "Fountain pen", amountCents: 1999 },
    ],
  },
];

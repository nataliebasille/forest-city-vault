import { Sales } from "@forest-city-vault/domain";
import { Effect } from "effect";

/** Provider merchant id stamped on every seeded sale. */
export const DEFAULT_SEED_MERCHANT_ID = "seed-merchant";

/** A single line item within a seeded sale. `amountCents` is both the gross and
 * net amount (no tax or discount), so it flows straight into the sale total the
 * dashboard sums as revenue. */
export type SeedSaleItem = {
  readonly name: string;
  readonly amountCents: number;
};

/** One demo sale to record. `id` is stable so re-running upserts the same row
 * (idempotent); `hoursAgo` places the sale relative to "now" so it lands in the
 * store's local "today"/"this week" windows. */
export type SeedSale = {
  readonly id: string;
  readonly paymentId: string;
  readonly hoursAgo: number;
  readonly items: readonly SeedSaleItem[];
};

export type SeedSalesInput = {
  readonly merchantId?: string;
  readonly sales?: readonly SeedSale[];
  /** The instant the `hoursAgo` offsets are measured back from. Defaults to the
   * real current time; tests pass a fixed value for determinism. */
  readonly now?: Date;
};

export type SeedSalesResult = {
  readonly seeded: number;
  readonly saleIds: readonly string[];
};

/**
 * Seeds a handful of demo sales through the {@link Sales} aggregate and its
 * repository — the same write path a real Clover payment takes — so the
 * dashboard's sales/revenue tiles have believable data to show. Unlike the
 * bootstrap commands, this provisions no essential production state; it exists
 * purely to populate a local database with sample data.
 *
 * Sales are placed a few hours back (today) and a couple of days back (earlier
 * this week) relative to {@link SeedSalesInput.now}, which is what makes the
 * "today" and "this week" metric windows differ. Each sale has a stable id, so
 * the repository's upsert makes re-running idempotent rather than piling up
 * duplicates.
 *
 * The caller owns the transaction (the seed runs inside `withSaga`), so every
 * recorded sale's snapshot write and event append commit together.
 */
export const seedSales = (input: SeedSalesInput = {}) =>
  Effect.gen(function* () {
    const merchantId = input.merchantId ?? DEFAULT_SEED_MERCHANT_ID;
    const seeds = input.sales ?? DEFAULT_SEED_SALES;
    const nowMs = (input.now ?? new Date()).getTime();

    for (const seed of seeds) {
      const timestamp = new Date(nowMs - seed.hoursAgo * MS_PER_HOUR);
      const totalCents = seed.items.reduce(
        (sum, item) => sum + item.amountCents,
        0,
      );

      const sale = yield* Sales.actions.fromCloverPayment(
        Sales.pristine(seed.id),
        {
          payment: {
            merchantId,
            paymentId: seed.paymentId,
            idempotencyKey: `seed:${merchantId}:${seed.paymentId}`,
            timestamp,
            paymentStatus: "paid",
            subtotal: totalCents,
            tax: 0,
            discount: 0,
            total: totalCents,
          },
          items: seed.items.map((item) => ({
            cloverItemId: "",
            name: item.name,
            quantity: 1,
            grossAmount: item.amountCents,
            discountAmount: 0,
            taxAmount: 0,
            netAmount: item.amountCents,
          })),
        },
      );

      yield* Sales.repository.save(sale);
    }

    return {
      seeded: seeds.length,
      saleIds: seeds.map((seed) => seed.id),
    } satisfies SeedSalesResult;
  });

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * The default demo set: three sales earlier today and two more earlier this
 * week, so `salesToday`/`revenueToday` are a strict subset of the weekly totals.
 */
const DEFAULT_SEED_SALES: readonly SeedSale[] = [
  {
    id: "01920000-0000-7000-8000-000000005001",
    paymentId: "seed-payment-1",
    hoursAgo: 1,
    items: [{ name: "Vintage denim jacket", amountCents: 2499 }],
  },
  {
    id: "01920000-0000-7000-8000-000000005002",
    paymentId: "seed-payment-2",
    hoursAgo: 3,
    items: [
      { name: "Ceramic mug", amountCents: 1250 },
      { name: "Enamel pin", amountCents: 800 },
    ],
  },
  {
    id: "01920000-0000-7000-8000-000000005003",
    paymentId: "seed-payment-3",
    hoursAgo: 6,
    items: [{ name: "Hand-thrown vase", amountCents: 4500 }],
  },
  {
    id: "01920000-0000-7000-8000-000000005004",
    paymentId: "seed-payment-4",
    hoursAgo: 30,
    items: [{ name: "Wool throw blanket", amountCents: 3375 }],
  },
  {
    id: "01920000-0000-7000-8000-000000005005",
    paymentId: "seed-payment-5",
    hoursAgo: 54,
    items: [
      { name: "Leather journal", amountCents: 1500 },
      { name: "Fountain pen", amountCents: 1999 },
    ],
  },
];

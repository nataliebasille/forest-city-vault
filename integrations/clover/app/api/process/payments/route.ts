import { RequestTrace } from "@/lib/runtime/middleware/request-trace";
import { route } from "@/runtime";
import { EventStore } from "@forest-city-vault/core-domain";
import { FromCloverPaymentSchema, Sales } from "@forest-city-vault/domain";
import {
  dbSchema,
  drain,
  tryDb,
  type SapphoDatabase,
} from "@forest-city-vault/infrastructure-database";
import { getCloverPayment } from "@/lib/integration/payments";
import { Effect, Schema } from "effect";

const NoopEventStore: EventStore.Service = {
  append: () => Effect.void,
  read: () => Effect.succeed([]),
};

const PaymentPayloadSchema = Schema.Struct({
  merchantId: Schema.String,
});

const decodePaymentPayload = Schema.decodeUnknown(
  Schema.parseJson(PaymentPayloadSchema),
);

export const POST = route(() =>
  Effect.gen(function* () {
    yield* drain({
      inbox: "payments",
      requestId: (yield* RequestTrace).requestId,
      action: (sql, message) =>
        Effect.gen(function* () {
          const { merchantId } = yield* decodePaymentPayload(message.payloadJson);

          const accessToken = process.env.CLOVER_ACCESS_TOKEN || "";

          const cloverPayment = yield* getCloverPayment(
            merchantId,
            message.providerObjectId,
            accessToken,
          );

          const saleItems = mapCloverPaymentToSaleItems(cloverPayment);

          const newSale = Sales.pristine(crypto.randomUUID());
          const actionPayload: typeof FromCloverPaymentSchema.Type = {
            payment: {
              merchantId,
              paymentId: message.providerObjectId,
              timestamp: new Date(cloverPayment.createdTime).toISOString(),
            },
            items: saleItems,
          };

          const sale = yield* Sales.actions
            .fromCloverPayment(newSale, actionPayload)
            .pipe(Effect.provideService(EventStore, NoopEventStore));

          yield* persistSale(sql, sale);
        }),
    });

    return true;
  }),
);

function persistSale(
  sql: SapphoDatabase,
  sale: { id: string; snapshot: typeof Sales.schema.Type },
) {
  return Effect.gen(function* () {
    const saleTimestamp = new Date();
    const saleRow: typeof dbSchema.sales.$inferInsert = {
      id: sale.id,
      source: sale.snapshot.source.provider,
      cloverMerchantId: sale.snapshot.source.merchantId,
      cloverPaymentId: sale.snapshot.source.paymentId,
      occurredAt: sale.snapshot.recordedAt,
      subtotalCents: BigInt(sale.snapshot.subtotal ?? 0),
      taxCents: BigInt(sale.snapshot.tax ?? 0),
      discountCents: BigInt(sale.snapshot.discount ?? 0),
      totalCents: BigInt(sale.snapshot.total ?? 0),
      createdAt: saleTimestamp,
      updatedAt: saleTimestamp,
    };

    const lineItemRows = yield* Effect.forEach(sale.snapshot.items, (item) =>
      Effect.gen(function* () {
        return {
          id: crypto.randomUUID(),
          saleId: sale.id,
          vendorId: null,
          name: item.name,
          quantity: BigInt(item.quantity),
          grossAmountCents: BigInt(item.grossAmount),
          discountAmountCents: BigInt(item.discountAmount),
          netAmountCents: BigInt(item.netAmount),
          cloverItemId: null,
          createdAt: saleTimestamp,
          updatedAt: saleTimestamp,
        } satisfies typeof dbSchema.salesLineItems.$inferInsert;
      }),
    );

    yield* tryDb(() => sql.insert(dbSchema.sales).values([saleRow]));
    if (lineItemRows.length > 0) {
      yield* tryDb(() => sql.insert(dbSchema.salesLineItems).values(lineItemRows));
    }
  });
}

function mapCloverPaymentToSaleItems(
  payment: typeof getCloverPayment extends (...args: any[]) => Effect.Effect<
    infer T,
    any,
    any
  >
    ? T
    : never,
): typeof FromCloverPaymentSchema.Type["items"] {
  const lineItems = payment.lineItems?.elements ?? [];

  if (lineItems.length === 0) {
    // If no line items, create one aggregate item for the total
    return [
      {
        vendorId: "",
        name: "Payment",
        quantity: 1,
        grossAmount: payment.total,
        discountAmount: payment.discountAmount ?? 0,
        taxAmount: payment.taxAmount ?? 0,
        netAmount: payment.total,
      },
    ];
  }

  return lineItems.map((item) => ({
    vendorId: "",
    name: item.name,
    quantity: item.quantity,
    grossAmount: item.price * item.quantity,
    discountAmount: 0, // Clover item-level discounts would be here
    taxAmount: 0, // Clover item-level taxes would be here
    netAmount: item.price * item.quantity,
  }));
}

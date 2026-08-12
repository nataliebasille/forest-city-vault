import { describe, it } from "node:test";
import { expect } from "expect";
import { OrderRecorded } from "./order.events";

const source = {
  provider: "clover" as const,
  merchantId: "H81CH13G99MY1",
  orderId: "ORDER1",
  idempotencyKey: "H81CH13G99MY1:O:ORDER1:1700000000000",
  modifiedTime: 1_700_000_000_000,
};

describe("OrderRecorded.handler", () => {
  it("uses the status and collected carried by the event payload", () => {
    const snapshot = OrderRecorded.handler({
      source,
      status: "partial",
      timestamp: new Date("2026-06-04T19:59:44.000Z"),
      subtotal: 11344,
      tax: 840,
      discount: 0,
      total: 11344,
      collected: 3000,
    });

    expect(snapshot.status).toBe("partial");
    expect(snapshot.collected).toBe(3000);
  });

  it("replaces an existing snapshot when replayed as an update", () => {
    const existing = {
      source,
      status: "paid" as const,
      payments: [{ paymentId: "P", amount: 1, tipAmount: 0, taxAmount: 0, result: "SUCCESS" as const, status: "paid" as const }],
      items: [{ cloverItemId: "I", name: "Item", quantity: 1, grossAmount: 1, discountAmount: 0, netAmount: 1, collectedAmount: 1, refunded: false }],
      subtotal: 1,
      tax: 0,
      discount: 0,
      total: 1,
      collected: 1,
      recordedAt: new Date("2026-01-01T00:00:00.000Z"),
      completedAt: null,
    };

    const snapshot = OrderRecorded.handler(existing, {
      source,
      status: "refunded",
      timestamp: new Date("2026-06-04T19:59:44.000Z"),
      subtotal: 200,
      tax: 10,
      discount: 0,
      total: 200,
      collected: 0,
    });

    expect(snapshot.status).toBe("refunded");
    expect(snapshot.payments).toEqual([]);
    expect(snapshot.items).toEqual([]);
    expect(snapshot.collected).toBe(0);
  });
});

import { describe, it } from "node:test";
import { expect } from "expect";
import { SaleRecorded } from "./sale.events";

const source = {
  provider: "clover" as const,
  merchantId: "H81CH13G99MY1",
  paymentId: "PAY1",
  idempotencyKey: "H81CH13G99MY1:P:PAY1",
};

describe("SaleRecorded.handler", () => {
  it("uses the paymentStatus carried by the event payload", () => {
    const snapshot = SaleRecorded.handler({
      source,
      paymentStatus: "rejected",
      timestamp: new Date("2026-06-04T19:59:44.000Z"),
      subtotal: 11344,
      tax: 840,
      discount: 0,
      total: 11344,
    });

    expect(snapshot.paymentStatus).toBe("rejected");
  });

  it("upcasts a legacy event (no paymentStatus) to `paid` so it stays replayable", () => {
    // A SaleRecorded persisted before `paymentStatus` existed carries no status.
    // Replaying it must still rebuild a valid snapshot (the read model column is
    // NOT NULL); the pre-status code only recorded captured payments, so `paid`
    // is the faithful reconstruction.
    const snapshot = SaleRecorded.handler({
      source,
      timestamp: new Date("2026-05-01T18:34:05.000Z"),
      subtotal: 3829,
      tax: 80,
      discount: 0,
      total: 3829,
    });

    expect(snapshot.paymentStatus).toBe("paid");
  });
});

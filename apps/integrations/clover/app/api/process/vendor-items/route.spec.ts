import { describe, test, mock } from "node:test";
import assert from "node:assert/strict";

import { dbSchema } from "@forest-city-vault/infrastructure-database";
import { NextRequest } from "next/server";

import { makeRouteTest } from "@/lib/testing/make-route-test";

const PROCESSOR_SECRET = "test-processor-secret";
const MERCHANT_ID = "test-merchant-id";

process.env.CLOVER_PROCESSOR_SECRET = PROCESSOR_SECRET;

const {
  db,
  module: { POST },
} = await makeRouteTest<typeof import("./route")>(import.meta.url, "./route", {
  processorSecret: PROCESSOR_SECRET,
  merchantId: MERCHANT_ID,
  merchantAccessToken: "static-access-token",
});

describe("POST /api/process/vendor-items", () => {
  test("adds a Clover item to the vendor whose category it belongs to", async () => {
    const vendorId = crypto.randomUUID();
    await seedVendor(vendorId, "CAT-add");
    await insertInboxMessage("ITEM-add", "upsert");
    stubCloverItem("ITEM-add", {
      id: "ITEM-add",
      name: "Syrup",
      price: 1200,
      modifiedTime: 1_700_000_000_000,
      categories: { elements: [{ id: "CAT-add" }] },
    });

    const response = await POST(processRequest(authHeader()));

    mock.restoreAll();

    assert.equal(response.status, 200);
    assert.equal(await response.json(), true);

    const message = (
      await db.select().from(dbSchema.inboxes.vendorItems.inbox)
    ).find((r) => r.providerObjectId === "ITEM-add");
    assert.ok(message, "expected the inbox message to exist");
    assert.equal(message.status, "processed");

    const items = (await db.select().from(dbSchema.vendorItems)).filter(
      (row) => row.vendorId === vendorId,
    );
    assert.equal(items.length, 1);
    assert.equal(items[0].cloverItemId, "ITEM-add");
    assert.equal(items[0].name, "Syrup");
    assert.equal(Number(items[0].priceCents), 1200);
  });

  test("removes a vendor's item on a delete event without calling Clover", async () => {
    const vendorId = crypto.randomUUID();
    await seedVendor(vendorId, "CAT-del");
    await seedVendorItem(vendorId, "ITEM-del", "Candle", 800);
    await insertInboxMessage("ITEM-del", "delete");

    const fetchStub = mock.method(globalThis, "fetch", async () => {
      throw new Error("delete must not call the Clover API");
    });

    const response = await POST(processRequest(authHeader()));

    mock.restoreAll();

    assert.equal(response.status, 200);
    assert.equal(fetchStub.mock.callCount(), 0);

    const remaining = (await db.select().from(dbSchema.vendorItems)).filter(
      (row) => row.vendorId === vendorId,
    );
    assert.equal(remaining.length, 0, "expected the item to be removed");

    const message = (
      await db.select().from(dbSchema.inboxes.vendorItems.inbox)
    ).find((r) => r.providerObjectId === "ITEM-del");
    assert.equal(message?.status, "processed");
  });

  test("renames the vendor when the item's category name has changed", async () => {
    const vendorId = crypto.randomUUID();
    await seedVendor(vendorId, "CAT-rename", "Old Name");
    await insertInboxMessage("ITEM-rename", "upsert");
    stubCloverItem("ITEM-rename", {
      id: "ITEM-rename",
      name: "Syrup",
      price: 1200,
      modifiedTime: 1_700_000_000_000,
      categories: { elements: [{ id: "CAT-rename", name: "New Name" }] },
    });

    const response = await POST(processRequest(authHeader()));

    mock.restoreAll();

    assert.equal(response.status, 200);

    const vendor = (await db.select().from(dbSchema.vendors)).find(
      (row) => row.id === vendorId,
    );
    assert.equal(vendor?.name, "New Name");

    const items = (await db.select().from(dbSchema.vendorItems)).filter(
      (row) => row.vendorId === vendorId,
    );
    assert.equal(items.length, 1);
    assert.equal(items[0].cloverItemId, "ITEM-rename");
  });

  test("persists a category rename even when the item itself is unchanged", async () => {
    const vendorId = crypto.randomUUID();
    await seedVendor(vendorId, "CAT-rename-only", "Old Name");
    // The item already exists on the vendor with the exact name/price Clover
    // returns, so applying it produces no event — only the rename does.
    await seedVendorItem(vendorId, "ITEM-stable", "Syrup", 1200);
    await insertInboxMessage("ITEM-stable", "upsert");
    stubCloverItem("ITEM-stable", {
      id: "ITEM-stable",
      name: "Syrup",
      price: 1200,
      modifiedTime: 1_700_000_000_000,
      categories: { elements: [{ id: "CAT-rename-only", name: "New Name" }] },
    });

    const response = await POST(processRequest(authHeader()));

    mock.restoreAll();

    assert.equal(response.status, 200);

    const vendor = (await db.select().from(dbSchema.vendors)).find(
      (row) => row.id === vendorId,
    );
    assert.equal(vendor?.name, "New Name");

    const items = (await db.select().from(dbSchema.vendorItems)).filter(
      (row) => row.vendorId === vendorId,
    );
    assert.equal(items.length, 1);
    assert.equal(items[0].cloverItemId, "ITEM-stable");
  });

  test("leaves the vendor name untouched when the category name matches", async () => {
    const vendorId = crypto.randomUUID();
    await seedVendor(vendorId, "CAT-same", "Maple & Co.");
    await insertInboxMessage("ITEM-same", "upsert");
    stubCloverItem("ITEM-same", {
      id: "ITEM-same",
      name: "Syrup",
      price: 1200,
      modifiedTime: 1_700_000_000_000,
      categories: { elements: [{ id: "CAT-same", name: "Maple & Co." }] },
    });

    const response = await POST(processRequest(authHeader()));

    mock.restoreAll();

    assert.equal(response.status, 200);

    const vendor = (await db.select().from(dbSchema.vendors)).find(
      (row) => row.id === vendorId,
    );
    assert.equal(vendor?.name, "Maple & Co.");
    // Only the item apply bumped the version; no spurious rename event.
    assert.equal(vendor?.version, 2);
  });

  test("does not rename the vendor when the category name is blank", async () => {
    const vendorId = crypto.randomUUID();
    await seedVendor(vendorId, "CAT-blank", "Keep Me");
    await insertInboxMessage("ITEM-blank", "upsert");
    stubCloverItem("ITEM-blank", {
      id: "ITEM-blank",
      name: "Syrup",
      price: 1200,
      modifiedTime: 1_700_000_000_000,
      categories: { elements: [{ id: "CAT-blank", name: "   " }] },
    });

    const response = await POST(processRequest(authHeader()));

    mock.restoreAll();

    assert.equal(response.status, 200);

    const vendor = (await db.select().from(dbSchema.vendors)).find(
      (row) => row.id === vendorId,
    );
    assert.equal(vendor?.name, "Keep Me");

    const items = (await db.select().from(dbSchema.vendorItems)).filter(
      (row) => row.vendorId === vendorId,
    );
    assert.equal(items.length, 1);
  });

  test("creates a vendor for an item whose category has no vendor yet", async () => {
    await insertInboxMessage("ITEM-orphan", "upsert");
    stubCloverItem("ITEM-orphan", {
      id: "ITEM-orphan",
      name: "Orphan",
      price: 500,
      modifiedTime: 1_700_000_000_000,
      categories: { elements: [{ id: "CAT-unmodelled", name: "New Vendor" }] },
    });

    const response = await POST(processRequest(authHeader()));

    mock.restoreAll();

    assert.equal(response.status, 200);

    const message = (
      await db.select().from(dbSchema.inboxes.vendorItems.inbox)
    ).find((r) => r.providerObjectId === "ITEM-orphan");
    assert.equal(message?.status, "processed");

    const createdVendor = (await db.select().from(dbSchema.vendors)).find(
      (row) => row.cloverCategoryId === "CAT-unmodelled",
    );
    assert.ok(createdVendor, "expected a vendor to be created for the category");
    assert.equal(createdVendor.name, "New Vendor");

    const orphanItems = (await db.select().from(dbSchema.vendorItems)).filter(
      (row) => row.cloverItemId === "ITEM-orphan",
    );
    assert.equal(orphanItems.length, 1);
    assert.equal(orphanItems[0].vendorId, createdVendor.id);
    assert.equal(orphanItems[0].name, "Orphan");
    assert.equal(Number(orphanItems[0].priceCents), 500);
  });

  test("names the created vendor after the category id when the category has no name", async () => {
    await insertInboxMessage("ITEM-nameless", "upsert");
    stubCloverItem("ITEM-nameless", {
      id: "ITEM-nameless",
      name: "Nameless",
      price: 700,
      modifiedTime: 1_700_000_000_000,
      categories: { elements: [{ id: "CAT-nameless" }] },
    });

    const response = await POST(processRequest(authHeader()));

    mock.restoreAll();

    assert.equal(response.status, 200);

    const createdVendor = (await db.select().from(dbSchema.vendors)).find(
      (row) => row.cloverCategoryId === "CAT-nameless",
    );
    assert.ok(createdVendor, "expected a vendor to be created for the category");
    assert.equal(createdVendor.name, "CAT-nameless");
  });

  test("attaches an uncategorized item to a shared \"Custom item\" vendor and reuses it", async () => {
    await insertInboxMessage("ITEM-nocat-1", "upsert");
    await insertInboxMessage("ITEM-nocat-2", "upsert");
    stubCloverItems({
      "ITEM-nocat-1": {
        id: "ITEM-nocat-1",
        name: "Loose One",
        price: 300,
        modifiedTime: 1_700_000_000_000,
      },
      "ITEM-nocat-2": {
        id: "ITEM-nocat-2",
        name: "Loose Two",
        price: 400,
        modifiedTime: 1_700_000_100_000,
      },
    });

    const response = await POST(processRequest(authHeader()));

    mock.restoreAll();

    assert.equal(response.status, 200);

    const customVendors = (await db.select().from(dbSchema.vendors)).filter(
      (row) => row.name === "Custom item",
    );
    assert.equal(
      customVendors.length,
      1,
      "expected exactly one shared Custom item vendor",
    );

    const customItems = (await db.select().from(dbSchema.vendorItems)).filter(
      (row) => row.vendorId === customVendors[0].id,
    );
    assert.equal(customItems.length, 2);
    assert.deepEqual(
      customItems.map((row) => row.cloverItemId).sort(),
      ["ITEM-nocat-1", "ITEM-nocat-2"],
    );
  });

  test("returns 401 when the bearer token is incorrect", async () => {
    const response = await POST(
      processRequest({ authorization: "Bearer wrong" }),
    );
    assert.equal(response.status, 401);
  });
});

function processRequest(headers?: Record<string, string>) {
  return new NextRequest("http://localhost/api/process/vendor-items", {
    method: "POST",
    headers,
  });
}

function authHeader(token = PROCESSOR_SECRET) {
  return { authorization: `Bearer ${token}` };
}

async function seedVendor(
  vendorId: string,
  cloverCategoryId: string,
  name = "Maple & Co.",
) {
  await db.insert(dbSchema.vendors).values([
    {
      id: vendorId,
      name,
      status: "active",
      defaultVendorShare: 6000,
      cloverCategoryId,
      version: 1,
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    },
  ]);
}

async function seedVendorItem(
  vendorId: string,
  cloverItemId: string,
  name: string,
  priceCents: number,
) {
  await db.insert(dbSchema.vendorItems).values([
    {
      id: crypto.randomUUID(),
      vendorId,
      cloverItemId,
      name,
      priceCents: BigInt(priceCents),
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    },
  ]);
}

async function insertInboxMessage(
  itemId: string,
  eventType: "upsert" | "delete",
) {
  await db.insert(dbSchema.inboxes.vendorItems.inbox).values([
    {
      requestId: `req-${itemId}`,
      status: "received",
      idempotencyKey: `${MERCHANT_ID}:I:${itemId}:1700000000000`,
      provider: "clover",
      providerEventId: `I:${itemId}`,
      providerObjectId: itemId,
      eventType,
      payloadJson: JSON.stringify({ merchantId: MERCHANT_ID }),
      occurredAt: new Date("2024-01-01T12:00:00.000Z"),
      receivedAt: new Date("2024-01-01T12:00:01.000Z"),
    },
  ]);
}

function stubCloverItem(itemId: string, body: Record<string, unknown>) {
  mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes(`/items/${itemId}`)) {
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("not found", { status: 404 });
  });
}

function stubCloverItems(bodiesByItemId: Record<string, Record<string, unknown>>) {
  mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    for (const [itemId, body] of Object.entries(bodiesByItemId)) {
      if (url.includes(`/items/${itemId}`)) {
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
    }
    return new Response("not found", { status: 404 });
  });
}

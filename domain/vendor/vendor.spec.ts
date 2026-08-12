import { describe, it } from "node:test";
import { expect } from "expect";
import { Schema } from "effect";
import { Vendor } from "../index";
import {
  VendorAlreadyActiveError,
  VendorAlreadyInactiveError,
  VendorCloverCategoryBlankError,
  VendorCommissionShareOutOfRangeError,
  VendorItemCloverIdBlankError,
  VendorItemDuplicateError,
  VendorItemPriceInvalidError,
  VendorNameBlankError,
} from "../index";
import { BasisPointsSchema } from "../value-objects/basis-points";
import { expectFailure, FIXED_NOW, runAction, runActionExit } from "../testing";

const createVendor = (
  overrides: {
    name?: string;
    commissionShare?: number;
    cloverCategoryId?: string;
  } = {},
) =>
  runAction(
    Vendor.actions.create(Vendor.pristine("vendor-1"), {
      name: overrides.name ?? "Maple & Co.",
      commissionShare: overrides.commissionShare,
      cloverCategoryId: overrides.cloverCategoryId,
    }),
  );

describe("Vendor", () => {
  it("creates an active vendor with the default commission share and no category", () => {
    const vendor = createVendor();

    expect(vendor.version).toBe(1);
    expect(vendor.snapshot).toEqual({
      name: "Maple & Co.",
      status: "active",
      commissionShare: 6000,
      cloverCategoryId: null,
      items: [],
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    });
  });

  it("trims the vendor name on creation", () => {
    const vendor = createVendor({ name: "  Maple & Co.  " });

    expect(vendor.snapshot.name).toBe("Maple & Co.");
  });

  it("accepts an explicit commission share and Clover category on creation", () => {
    const vendor = createVendor({
      commissionShare: 7500,
      cloverCategoryId: "CAT123",
    });

    expect(vendor.snapshot.commissionShare).toBe(7500);
    expect(vendor.snapshot.cloverCategoryId).toBe("CAT123");
  });

  it("trims the Clover category id on creation", () => {
    const vendor = createVendor({ cloverCategoryId: "  CAT123  " });

    expect(vendor.snapshot.cloverCategoryId).toBe("CAT123");
  });

  it("rejects a blank vendor name", () => {
    const exit = runActionExit(
      Vendor.actions.create(Vendor.pristine("vendor-blank"), {
        name: "   ",
      }),
    );

    expect(expectFailure(exit)).toBeInstanceOf(VendorNameBlankError);
  });

  it("rejects a blank Clover category id on creation", () => {
    const exit = runActionExit(
      Vendor.actions.create(Vendor.pristine("vendor-blank-cat"), {
        name: "Maple & Co.",
        cloverCategoryId: "  ",
      }),
    );

    expect(expectFailure(exit)).toBeInstanceOf(VendorCloverCategoryBlankError);
  });

  it("accepts the commission share range boundaries", () => {
    expect(createVendor({ commissionShare: 0 }).snapshot.commissionShare).toBe(
      0,
    );
    expect(
      createVendor({ commissionShare: 10000 }).snapshot.commissionShare,
    ).toBe(10000);
  });

  it("rejects a commission share below 0", () => {
    const exit = runActionExit(
      Vendor.actions.create(Vendor.pristine("vendor-neg"), {
        name: "Maple & Co.",
        commissionShare: -1,
      }),
    );

    expect(expectFailure(exit)).toBeInstanceOf(
      VendorCommissionShareOutOfRangeError,
    );
  });

  it("rejects a commission share above 10000", () => {
    const exit = runActionExit(
      Vendor.actions.create(Vendor.pristine("vendor-big"), {
        name: "Maple & Co.",
        commissionShare: 10001,
      }),
    );

    expect(expectFailure(exit)).toBeInstanceOf(
      VendorCommissionShareOutOfRangeError,
    );
  });

  it("rejects a non-integer commission share", () => {
    const exit = runActionExit(
      Vendor.actions.create(Vendor.pristine("vendor-frac"), {
        name: "Maple & Co.",
        commissionShare: 6000.5,
      }),
    );

    expect(expectFailure(exit)).toBeInstanceOf(
      VendorCommissionShareOutOfRangeError,
    );
  });

  it("renames a vendor, trimming the new name", () => {
    const renamed = runAction(
      Vendor.actions.rename(createVendor(), { name: "  New Name  " }),
    );

    expect(renamed.snapshot.name).toBe("New Name");
    expect(renamed.version).toBe(2);
  });

  it("rejects renaming to a blank name", () => {
    const exit = runActionExit(
      Vendor.actions.rename(createVendor(), { name: "" }),
    );

    expect(expectFailure(exit)).toBeInstanceOf(VendorNameBlankError);
  });

  it("renames the vendor when a Clover category name differs, trimming it", () => {
    const synced = runAction(
      Vendor.actions.syncCloverCategoryName(createVendor(), {
        name: "  New Name  ",
      }),
    );

    expect(synced.snapshot.name).toBe("New Name");
    expect(synced.version).toBe(2);
  });

  it("emits no event when the Clover category name matches", () => {
    const vendor = createVendor({ name: "Maple & Co." });

    const synced = runAction(
      Vendor.actions.syncCloverCategoryName(vendor, { name: "  Maple & Co.  " }),
    );

    expect(synced.version).toBe(vendor.version);
    expect(synced.snapshot.name).toBe("Maple & Co.");
  });

  it("emits no event when the Clover category name is blank", () => {
    const vendor = createVendor({ name: "Keep Me" });

    const synced = runAction(
      Vendor.actions.syncCloverCategoryName(vendor, { name: "   " }),
    );

    expect(synced.version).toBe(vendor.version);
    expect(synced.snapshot.name).toBe("Keep Me");
  });

  it("links a Clover category", () => {
    const linked = runAction(
      Vendor.actions.linkCloverCategory(createVendor(), {
        cloverCategoryId: "CAT999",
      }),
    );

    expect(linked.snapshot.cloverCategoryId).toBe("CAT999");
  });

  it("overwrites an existing Clover category link", () => {
    const linked = runAction(
      Vendor.actions.linkCloverCategory(
        createVendor({ cloverCategoryId: "CAT111" }),
        { cloverCategoryId: "CAT222" },
      ),
    );

    expect(linked.snapshot.cloverCategoryId).toBe("CAT222");
  });

  it("rejects linking a blank Clover category", () => {
    const exit = runActionExit(
      Vendor.actions.linkCloverCategory(createVendor(), {
        cloverCategoryId: " ",
      }),
    );

    expect(expectFailure(exit)).toBeInstanceOf(VendorCloverCategoryBlankError);
  });

  it("deactivates an active vendor", () => {
    const deactivated = runAction(
      Vendor.actions.deactivate(createVendor(), undefined),
    );

    expect(deactivated.snapshot.status).toBe("inactive");
  });

  it("reactivates an inactive vendor", () => {
    const deactivated = runAction(
      Vendor.actions.deactivate(createVendor(), undefined),
    );
    const reactivated = runAction(
      Vendor.actions.activate(deactivated, undefined),
    );

    expect(reactivated.snapshot.status).toBe("active");
  });

  it("rejects activating an already-active vendor", () => {
    const exit = runActionExit(
      Vendor.actions.activate(createVendor(), undefined),
    );

    expect(expectFailure(exit)).toBeInstanceOf(VendorAlreadyActiveError);
  });

  it("rejects deactivating an already-inactive vendor", () => {
    const deactivated = runAction(
      Vendor.actions.deactivate(createVendor(), undefined),
    );
    const exit = runActionExit(
      Vendor.actions.deactivate(deactivated, undefined),
    );

    expect(expectFailure(exit)).toBeInstanceOf(VendorAlreadyInactiveError);
  });

  const syncItems = (
    vendor: ReturnType<typeof createVendor>,
    items: ReadonlyArray<{ cloverItemId: string; name: string; price: number }>,
  ) => runAction(Vendor.actions.syncCloverItems(vendor, { items }));

  it("adds all items on the first sync", () => {
    const synced = syncItems(createVendor(), [
      { cloverItemId: "ITEM1", name: "Syrup", price: 1200 },
      { cloverItemId: "ITEM2", name: "Candle", price: 800 },
    ]);

    expect(synced.snapshot.items).toEqual([
      { cloverItemId: "ITEM1", name: "Syrup", price: 1200 },
      { cloverItemId: "ITEM2", name: "Candle", price: 800 },
    ]);
    expect(synced.version).toBe(3);
  });

  it("trims the item id and name on sync", () => {
    const synced = syncItems(createVendor(), [
      { cloverItemId: "  ITEM1  ", name: "  Syrup  ", price: 1200 },
    ]);

    expect(synced.snapshot.items).toEqual([
      { cloverItemId: "ITEM1", name: "Syrup", price: 1200 },
    ]);
  });

  it("updates a changed item and leaves unchanged items alone", () => {
    const initial = syncItems(createVendor(), [
      { cloverItemId: "ITEM1", name: "Syrup", price: 1200 },
      { cloverItemId: "ITEM2", name: "Candle", price: 800 },
    ]);

    const updated = syncItems(initial, [
      { cloverItemId: "ITEM1", name: "Maple Syrup", price: 1500 },
      { cloverItemId: "ITEM2", name: "Candle", price: 800 },
    ]);

    expect(updated.snapshot.items).toEqual([
      { cloverItemId: "ITEM1", name: "Maple Syrup", price: 1500 },
      { cloverItemId: "ITEM2", name: "Candle", price: 800 },
    ]);
  });

  it("removes items absent from the incoming sync", () => {
    const initial = syncItems(createVendor(), [
      { cloverItemId: "ITEM1", name: "Syrup", price: 1200 },
      { cloverItemId: "ITEM2", name: "Candle", price: 800 },
    ]);

    const removed = syncItems(initial, [
      { cloverItemId: "ITEM1", name: "Syrup", price: 1200 },
    ]);

    expect(removed.snapshot.items).toEqual([
      { cloverItemId: "ITEM1", name: "Syrup", price: 1200 },
    ]);
  });

  it("clears all items when synced with an empty list", () => {
    const initial = syncItems(createVendor(), [
      { cloverItemId: "ITEM1", name: "Syrup", price: 1200 },
    ]);

    const cleared = syncItems(initial, []);

    expect(cleared.snapshot.items).toEqual([]);
  });

  it("emits no events when the incoming items match the current items", () => {
    const initial = syncItems(createVendor(), [
      { cloverItemId: "ITEM1", name: "Syrup", price: 1200 },
    ]);

    const resynced = syncItems(initial, [
      { cloverItemId: "ITEM1", name: "Syrup", price: 1200 },
    ]);

    expect(resynced.version).toBe(initial.version);
    expect(resynced.snapshot.items).toEqual(initial.snapshot.items);
  });

  it("rejects a blank Clover item id", () => {
    const exit = runActionExit(
      Vendor.actions.syncCloverItems(createVendor(), {
        items: [{ cloverItemId: "  ", name: "Syrup", price: 1200 }],
      }),
    );

    expect(expectFailure(exit)).toBeInstanceOf(VendorItemCloverIdBlankError);
  });

  it("rejects duplicate Clover item ids in one sync", () => {
    const exit = runActionExit(
      Vendor.actions.syncCloverItems(createVendor(), {
        items: [
          { cloverItemId: "ITEM1", name: "Syrup", price: 1200 },
          { cloverItemId: "ITEM1", name: "Candle", price: 800 },
        ],
      }),
    );

    expect(expectFailure(exit)).toBeInstanceOf(VendorItemDuplicateError);
  });

  it("rejects an invalid item price", () => {
    const exit = runActionExit(
      Vendor.actions.syncCloverItems(createVendor(), {
        items: [{ cloverItemId: "ITEM1", name: "Syrup", price: -1 }],
      }),
    );

    expect(expectFailure(exit)).toBeInstanceOf(VendorItemPriceInvalidError);
  });

  const applyItem = (
    vendor: ReturnType<typeof createVendor>,
    item: { cloverItemId: string; name: string; price: number },
  ) => runAction(Vendor.actions.applyCloverItem(vendor, { item }));

  it("adds a single item via applyCloverItem", () => {
    const applied = applyItem(createVendor(), {
      cloverItemId: "ITEM1",
      name: "Syrup",
      price: 1200,
    });

    expect(applied.snapshot.items).toEqual([
      { cloverItemId: "ITEM1", name: "Syrup", price: 1200 },
    ]);
    expect(applied.version).toBe(2);
  });

  it("trims the item id and name via applyCloverItem", () => {
    const applied = applyItem(createVendor(), {
      cloverItemId: "  ITEM1  ",
      name: "  Syrup  ",
      price: 1200,
    });

    expect(applied.snapshot.items).toEqual([
      { cloverItemId: "ITEM1", name: "Syrup", price: 1200 },
    ]);
  });

  it("updates an existing item via applyCloverItem", () => {
    const initial = applyItem(createVendor(), {
      cloverItemId: "ITEM1",
      name: "Syrup",
      price: 1200,
    });

    const updated = applyItem(initial, {
      cloverItemId: "ITEM1",
      name: "Maple Syrup",
      price: 1500,
    });

    expect(updated.snapshot.items).toEqual([
      { cloverItemId: "ITEM1", name: "Maple Syrup", price: 1500 },
    ]);
  });

  it("emits no event when applyCloverItem matches the existing item", () => {
    const initial = applyItem(createVendor(), {
      cloverItemId: "ITEM1",
      name: "Syrup",
      price: 1200,
    });

    const reapplied = applyItem(initial, {
      cloverItemId: "ITEM1",
      name: "Syrup",
      price: 1200,
    });

    expect(reapplied.version).toBe(initial.version);
    expect(reapplied.snapshot.items).toEqual(initial.snapshot.items);
  });

  it("rejects a blank Clover item id on applyCloverItem", () => {
    const exit = runActionExit(
      Vendor.actions.applyCloverItem(createVendor(), {
        item: { cloverItemId: "  ", name: "Syrup", price: 1200 },
      }),
    );

    expect(expectFailure(exit)).toBeInstanceOf(VendorItemCloverIdBlankError);
  });

  it("rejects an invalid price on applyCloverItem", () => {
    const exit = runActionExit(
      Vendor.actions.applyCloverItem(createVendor(), {
        item: { cloverItemId: "ITEM1", name: "Syrup", price: -1 },
      }),
    );

    expect(expectFailure(exit)).toBeInstanceOf(VendorItemPriceInvalidError);
  });

  it("removes an existing item via removeCloverItem", () => {
    const initial = syncItems(createVendor(), [
      { cloverItemId: "ITEM1", name: "Syrup", price: 1200 },
      { cloverItemId: "ITEM2", name: "Candle", price: 800 },
    ]);

    const removed = runAction(
      Vendor.actions.removeCloverItem(initial, { cloverItemId: "ITEM1" }),
    );

    expect(removed.snapshot.items).toEqual([
      { cloverItemId: "ITEM2", name: "Candle", price: 800 },
    ]);
  });

  it("emits no event when removeCloverItem targets an absent item", () => {
    const initial = syncItems(createVendor(), [
      { cloverItemId: "ITEM1", name: "Syrup", price: 1200 },
    ]);

    const removed = runAction(
      Vendor.actions.removeCloverItem(initial, { cloverItemId: "MISSING" }),
    );

    expect(removed.version).toBe(initial.version);
    expect(removed.snapshot.items).toEqual(initial.snapshot.items);
  });

  it("rejects a blank Clover item id on removeCloverItem", () => {
    const exit = runActionExit(
      Vendor.actions.removeCloverItem(createVendor(), { cloverItemId: "  " }),
    );

    expect(expectFailure(exit)).toBeInstanceOf(VendorItemCloverIdBlankError);
  });
});

describe("BasisPoints", () => {
  const decode = Schema.decodeUnknownEither(BasisPointsSchema);

  it("accepts the inclusive 0..10000 range", () => {
    expect(decode(0)._tag).toBe("Right");
    expect(decode(6000)._tag).toBe("Right");
    expect(decode(10000)._tag).toBe("Right");
  });

  it("rejects values below 0", () => {
    expect(decode(-1)._tag).toBe("Left");
  });

  it("rejects values above 10000", () => {
    expect(decode(10001)._tag).toBe("Left");
  });

  it("rejects non-integers", () => {
    expect(decode(50.5)._tag).toBe("Left");
  });
});

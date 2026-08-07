import { describe, it } from "node:test";
import { expect } from "expect";
import { Schema } from "effect";
import { Vendor } from "../index";
import {
  VendorAlreadyActiveError,
  VendorAlreadyInactiveError,
  VendorCloverCategoryBlankError,
  VendorCommissionShareOutOfRangeError,
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

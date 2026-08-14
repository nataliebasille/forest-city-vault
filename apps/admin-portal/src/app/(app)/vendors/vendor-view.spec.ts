import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  applyVendorPatch,
  prependVendor,
  removeVendor,
  toggleVendorStatus,
  type VendorView,
} from "./vendor-view";

function vendor(overrides: Partial<VendorView> = {}): VendorView {
  return {
    id: "V-1",
    name: "Timberline Goods",
    tags: "",
    pricingModel: "consignment",
    status: "active",
    cloverCategoryId: null,
    items: [],
    contact: "",
    updatedAt: "Jun 1, 2024",
    ...overrides,
  };
}

describe("applyVendorPatch", () => {
  test("merges the patch into the matching vendor and stamps updatedAt", () => {
    const vendors = [vendor({ id: "V-1" }), vendor({ id: "V-2" })];
    const next = applyVendorPatch(vendors, "V-1", { name: "Renamed" });
    assert.equal(next[0].name, "Renamed");
    assert.equal(next[0].updatedAt, "just now");
  });

  test("leaves non-matching vendors untouched", () => {
    const vendors = [vendor({ id: "V-1" }), vendor({ id: "V-2", name: "Other" })];
    const next = applyVendorPatch(vendors, "V-1", { name: "Renamed" });
    assert.equal(next[1], vendors[1]);
  });

  test("does not mutate the input array or vendor", () => {
    const vendors = [vendor({ id: "V-1", name: "Original" })];
    applyVendorPatch(vendors, "V-1", { name: "Renamed" });
    assert.equal(vendors[0].name, "Original");
  });
});

describe("toggleVendorStatus", () => {
  test("flips active to inactive and stamps updatedAt", () => {
    const next = toggleVendorStatus([vendor({ status: "active" })], "V-1");
    assert.equal(next[0].status, "inactive");
    assert.equal(next[0].updatedAt, "just now");
  });

  test("flips inactive to active", () => {
    const next = toggleVendorStatus([vendor({ status: "inactive" })], "V-1");
    assert.equal(next[0].status, "active");
  });

  test("only touches the matching vendor", () => {
    const vendors = [vendor({ id: "V-1" }), vendor({ id: "V-2" })];
    const next = toggleVendorStatus(vendors, "V-1");
    assert.equal(next[1], vendors[1]);
  });
});

describe("removeVendor", () => {
  test("drops the matching vendor", () => {
    const vendors = [vendor({ id: "V-1" }), vendor({ id: "V-2" })];
    const next = removeVendor(vendors, "V-1");
    assert.deepEqual(
      next.map((v) => v.id),
      ["V-2"],
    );
  });

  test("is a no-op when the id is absent", () => {
    const vendors = [vendor({ id: "V-1" })];
    assert.deepEqual(removeVendor(vendors, "missing"), vendors);
  });
});

describe("prependVendor", () => {
  test("puts the new vendor first", () => {
    const vendors = [vendor({ id: "V-1" })];
    const draft = vendor({ id: "V-NEW" });
    const next = prependVendor(vendors, draft);
    assert.deepEqual(
      next.map((v) => v.id),
      ["V-NEW", "V-1"],
    );
  });
});

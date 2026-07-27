import { describe, it } from "node:test";
import { expect } from "expect";
import { StoreAccount } from "../index";
import {
  StoreAlreadyActiveError,
  StoreAlreadyInactiveError,
  StoreNameBlankError,
  StoreTimeZoneBlankError,
} from "../index";
import { expectFailure, FIXED_NOW, runAction, runActionExit } from "../testing";

const createStore = (overrides: { name?: string; timeZone?: string } = {}) =>
  runAction(
    StoreAccount.actions.create(StoreAccount.pristine("store-1"), {
      name: overrides.name ?? "Forest City Vault",
      timeZone: overrides.timeZone ?? "America/Detroit",
    }),
  );

describe("StoreAccount", () => {
  it("creates an active USD store with the given name and time zone", () => {
    const store = createStore();

    expect(store.version).toBe(1);
    expect(store.snapshot).toEqual({
      name: "Forest City Vault",
      status: "active",
      currency: "USD",
      timeZone: "America/Detroit",
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    });
  });

  it("trims the store name on creation", () => {
    const store = createStore({ name: "  Forest City Vault  " });

    expect(store.snapshot.name).toBe("Forest City Vault");
  });

  it("rejects a blank store name", () => {
    const exit = runActionExit(
      StoreAccount.actions.create(StoreAccount.pristine("store-blank"), {
        name: "   ",
        timeZone: "America/Detroit",
      }),
    );

    expect(expectFailure(exit)).toBeInstanceOf(StoreNameBlankError);
  });

  it("rejects a blank time zone", () => {
    const exit = runActionExit(
      StoreAccount.actions.create(StoreAccount.pristine("store-blank-tz"), {
        name: "Forest City Vault",
        timeZone: "  ",
      }),
    );

    expect(expectFailure(exit)).toBeInstanceOf(StoreTimeZoneBlankError);
  });

  it("renames a store, trimming the new name", () => {
    const renamed = runAction(
      StoreAccount.actions.rename(createStore(), { name: "  New Name  " }),
    );

    expect(renamed.snapshot.name).toBe("New Name");
    expect(renamed.version).toBe(2);
  });

  it("rejects renaming to a blank name", () => {
    const exit = runActionExit(
      StoreAccount.actions.rename(createStore(), { name: "" }),
    );

    expect(expectFailure(exit)).toBeInstanceOf(StoreNameBlankError);
  });

  it("changes the store time zone", () => {
    const changed = runAction(
      StoreAccount.actions.changeTimeZone(createStore(), {
        timeZone: "America/New_York",
      }),
    );

    expect(changed.snapshot.timeZone).toBe("America/New_York");
  });

  it("rejects changing to a blank time zone", () => {
    const exit = runActionExit(
      StoreAccount.actions.changeTimeZone(createStore(), { timeZone: " " }),
    );

    expect(expectFailure(exit)).toBeInstanceOf(StoreTimeZoneBlankError);
  });

  it("deactivates an active store", () => {
    const deactivated = runAction(
      StoreAccount.actions.deactivate(createStore(), undefined),
    );

    expect(deactivated.snapshot.status).toBe("inactive");
  });

  it("reactivates an inactive store", () => {
    const deactivated = runAction(
      StoreAccount.actions.deactivate(createStore(), undefined),
    );
    const reactivated = runAction(
      StoreAccount.actions.activate(deactivated, undefined),
    );

    expect(reactivated.snapshot.status).toBe("active");
  });

  it("rejects activating an already-active store", () => {
    const exit = runActionExit(
      StoreAccount.actions.activate(createStore(), undefined),
    );

    expect(expectFailure(exit)).toBeInstanceOf(StoreAlreadyActiveError);
  });

  it("rejects deactivating an already-inactive store", () => {
    const deactivated = runAction(
      StoreAccount.actions.deactivate(createStore(), undefined),
    );
    const exit = runActionExit(
      StoreAccount.actions.deactivate(deactivated, undefined),
    );

    expect(expectFailure(exit)).toBeInstanceOf(StoreAlreadyInactiveError);
  });

  it("fixes the currency to USD with no action to change it", () => {
    const store = createStore();

    expect(store.snapshot.currency).toBe("USD");
    // There is no `changeCurrency` action on the aggregate.
    expect("changeCurrency" in StoreAccount.actions).toBe(false);
  });
});

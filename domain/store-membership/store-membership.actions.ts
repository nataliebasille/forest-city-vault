import { Effect, Schema } from "effect";
import { Clock } from "@forest-city-vault/core-clock";
import * as events from "./store-membership.events";
import {
  isStoreRole,
  StoreMembershipSchema,
  StoreRoleSchema,
} from "./store-membership.entity";
import {
  MembershipAlreadyActiveError,
  MembershipAlreadyDisabledError,
  MembershipEmailRequiredError,
  MembershipInvalidRoleError,
  MembershipStoreIdRequiredError,
  MembershipUserIdRequiredError,
} from "./store-membership.errors";

export const CreateMembershipSchema = Schema.Struct({
  storeId: Schema.String,
  userId: Schema.String,
  email: Schema.String,
  role: StoreRoleSchema,
});

type MembershipCreatedEvent = {
  type: "MembershipCreated";
  payload: typeof events.MembershipCreated.schema.Type;
};

type MembershipDisabledEvent = {
  type: "MembershipDisabled";
  payload: typeof events.MembershipDisabled.schema.Type;
};

type MembershipReactivatedEvent = {
  type: "MembershipReactivated";
  payload: typeof events.MembershipReactivated.schema.Type;
};

type MembershipSnapshot = typeof StoreMembershipSchema.Type;

export const createMembership = (payload: typeof CreateMembershipSchema.Type) =>
  Effect.gen(function* () {
    const storeId = payload.storeId.trim();
    if (storeId.length === 0) {
      return yield* Effect.fail(new MembershipStoreIdRequiredError());
    }

    const userId = payload.userId.trim();
    if (userId.length === 0) {
      return yield* Effect.fail(new MembershipUserIdRequiredError());
    }

    const email = normalizeEmail(payload.email);
    if (email.length === 0) {
      return yield* Effect.fail(new MembershipEmailRequiredError());
    }

    const role = yield* requireRole(payload.role);
    const createdAt = yield* now;

    return {
      type: "MembershipCreated",
      payload: { storeId, userId, email, role, createdAt },
    } satisfies MembershipCreatedEvent;
  });

export const disableMembership = (snapshot: MembershipSnapshot) =>
  Effect.gen(function* () {
    if (snapshot.status === "disabled") {
      return yield* Effect.fail(new MembershipAlreadyDisabledError());
    }

    const updatedAt = yield* now;

    return {
      type: "MembershipDisabled",
      payload: { updatedAt },
    } satisfies MembershipDisabledEvent;
  });

export const reactivateMembership = (snapshot: MembershipSnapshot) =>
  Effect.gen(function* () {
    if (snapshot.status === "active") {
      return yield* Effect.fail(new MembershipAlreadyActiveError());
    }

    const updatedAt = yield* now;

    return {
      type: "MembershipReactivated",
      payload: { updatedAt },
    } satisfies MembershipReactivatedEvent;
  });

const now = Effect.flatMap(Clock, (clock) => clock.now);

const normalizeEmail = (raw: string) => raw.trim().toLowerCase();

const requireRole = (role: string) =>
  isStoreRole(role) ?
    Effect.succeed(role)
  : Effect.fail(new MembershipInvalidRoleError({ role }));

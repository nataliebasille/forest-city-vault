import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Effect, Either } from "effect";
import {
  AuthUserProvisionError,
  makeEnsureAuthUser,
  type SupabaseAuthAdminClient,
} from "./ensure-auth-user";

type CreateResponse = Awaited<
  ReturnType<SupabaseAuthAdminClient["auth"]["admin"]["createUser"]>
>;
type CreateAttributes = Parameters<
  SupabaseAuthAdminClient["auth"]["admin"]["createUser"]
>[0];
type ExistingUser = { readonly id: string; readonly email?: string | null };

describe("makeEnsureAuthUser", () => {
  test("creates a pre-confirmed user and returns the new id", async () => {
    const { client, createCalls } = makeFakeClient({
      create: { data: { user: { id: "user-new" } }, error: null },
    });

    const id = await Effect.runPromise(
      makeEnsureAuthUser(client)("owner@example.com"),
    );

    assert.equal(id, "user-new");
    assert.deepEqual(createCalls, [
      { email: "owner@example.com", email_confirm: true },
    ]);
  });

  test("reuses the existing id when the email already exists (idempotent)", async () => {
    const { client, createCalls } = makeFakeClient({
      create: { data: { user: null }, error: { code: "email_exists" } },
      users: [{ id: "user-existing", email: "Owner@Example.com" }],
    });

    const id = await Effect.runPromise(
      makeEnsureAuthUser(client)("owner@example.com"),
    );

    assert.equal(id, "user-existing", "matches case-insensitively");
    assert.equal(createCalls.length, 1, "still attempts the create first");
  });

  test("fails with AuthUserProvisionError when the create fails and no user exists", async () => {
    const cause = new Error("network down");
    const { client } = makeFakeClient({
      create: { data: { user: null }, error: cause },
      users: [],
    });

    const result = await Effect.runPromise(
      Effect.either(makeEnsureAuthUser(client)("owner@example.com")),
    );

    assert.ok(Either.isLeft(result));
    if (Either.isLeft(result)) {
      assert.ok(result.left instanceof AuthUserProvisionError);
      assert.equal(result.left.cause, cause);
    }
  });
});

function makeFakeClient(options: {
  readonly create: CreateResponse;
  readonly users?: ReadonlyArray<ExistingUser>;
  readonly listError?: unknown;
}) {
  const createCalls: CreateAttributes[] = [];
  const users = options.users ?? [];

  const client: SupabaseAuthAdminClient = {
    auth: {
      admin: {
        createUser: async (attributes) => {
          createCalls.push(attributes);
          return options.create;
        },
        listUsers: async (params) => {
          const page = params?.page ?? 1;
          return {
            data: { users: page === 1 ? users : [] },
            error: options.listError ?? null,
          };
        },
      },
    },
  };

  return { client, createCalls };
}

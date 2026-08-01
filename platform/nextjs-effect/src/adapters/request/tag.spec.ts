import { describe, test } from "node:test";
import { expect } from "expect";
import { Effect } from "effect";
import { NextRequest } from "next/server";
import { createRequestStateTag } from "./tag";

// A probe tag whose resolvers count how many times they run, so we can assert
// that request state is resolved lazily (only on read) and memoized (once).
const makeProbe = () => {
  const calls = { fromRequest: 0, forPage: 0 };

  class Probe extends createRequestStateTag("Probe")<Probe, string>({
    fromRequest() {
      return Effect.sync(() => {
        calls.fromRequest++;
        return "from-request";
      });
    },
    forPage() {
      return Effect.sync(() => {
        calls.forPage++;
        return "from-page";
      });
    },
  }) {}

  // Mirrors the `Headers`/`Cookies`/`Body` accessors: yielding runs the resolver.
  const read = Effect.flatMap(Probe, (resolve) => resolve);

  return { Probe, read, calls };
};

describe("request-state tag - laziness", () => {
  test("forPage: providing the layer does not resolve the value", async () => {
    const { Probe, calls } = makeProbe();

    await Effect.runPromise(
      Effect.succeed("static").pipe(Effect.provide(Probe.forPage())),
    );

    expect(calls.forPage).toBe(0);
  });

  test("forPage: resolves once, only when read, and memoizes across reads", async () => {
    const { Probe, read, calls } = makeProbe();

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const a = yield* read;
        const b = yield* read;
        return `${a}/${b}`;
      }).pipe(Effect.provide(Probe.forPage())),
    );

    expect(result).toBe("from-page/from-page");
    expect(calls.forPage).toBe(1);
  });

  test("fromRequest: providing the layer does not resolve the value", async () => {
    const { Probe, calls } = makeProbe();
    const req = new NextRequest("http://localhost/");

    await Effect.runPromise(
      Effect.succeed("static").pipe(Effect.provide(Probe.fromRequest(req))),
    );

    expect(calls.fromRequest).toBe(0);
  });

  test("fromRequest: resolves once, only when read, and memoizes across reads", async () => {
    const { Probe, read, calls } = makeProbe();
    const req = new NextRequest("http://localhost/");

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const a = yield* read;
        const b = yield* read;
        return `${a}/${b}`;
      }).pipe(Effect.provide(Probe.fromRequest(req))),
    );

    expect(result).toBe("from-request/from-request");
    expect(calls.fromRequest).toBe(1);
  });
});

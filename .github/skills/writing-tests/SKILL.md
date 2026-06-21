---
name: writing-tests
description: Use when writing, editing, or refactoring automated tests.
---

---

When writing tests, prioritize intended behavior, readability, behavior coverage, and predictable file structure.

## Core testing principle

Before writing or changing tests, infer the intended behavior from the surrounding code, names, types, domain concepts, existing tests, comments, and caller expectations.

Write tests for the behavior the code appears intended to provide, not for obviously broken current behavior.

If the implementation appears wrong, do not encode the bug as the expected result. Instead:

- Write the test against the intended behavior.
- Allow the test to fail if the current implementation is buggy.
- Make the failing behavior clear from the test name.
- Prefer exposing the bug over preserving accidental behavior.
- Do not change the expected value merely to match the current implementation.

When intent is ambiguous, choose the most reasonable behavior based on the public API and surrounding usage. If there are multiple plausible interpretations, add a short comment explaining the assumption.

## Test framework

Do not assume a specific test framework.

Use the test framework, assertion style, imports, helpers, and conventions already present in the file or project.

Do not introduce a new testing library unless explicitly asked.

## Test structure

Use this top-level ordering:

1. Imports
2. Module-level `const` declarations
3. Test suites and test cases
4. Module-level `function` declarations

Example:

```ts
const USER_ID = "user-1";

const makeUser = () => ({
  id: USER_ID,
  name: "Natalie",
});

describe("UserService", () => {
  test("returns the user", () => {
    const user = makeUser();

    expect(user.id).toBe(USER_ID);
  });
});

function createTestContext() {
  return {
    now: new Date("2026-01-01T00:00:00.000Z"),
  };
}
```

## Hard file-ordering rules

- All module-level `const` declarations must appear above all tests.
- All module-level `function` declarations must appear below all tests.
- Do not place module-level `function` declarations above `describe`, `it`, or `test` blocks.
- Do not place module-level `const` declarations after `describe`, `it`, or `test` blocks.
- Test-local variables may be declared inside individual tests when they are only used by that test.
- Test-local helper functions may be declared inside a test or `describe` block when they are only useful there.

## Test writing rules

- Test behavior, not implementation details.
- Prefer clear test names that describe the expected behavior.
- Keep setup close to the test unless it is reused across multiple tests.
- Use constants for shared values that make assertions easier to read.
- Avoid clever abstractions in tests.
- Prefer explicit expectations over overly generic helper assertions.
- When adding a regression test, make the failed behavior obvious from the test name.
- Do not weaken assertions just to make tests pass.
- Do not snapshot broken or accidental output unless the user explicitly asks for characterization tests.

## Refactoring existing tests

When refactoring a test file:

- Preserve intended behavior unless the user asks to change coverage.
- Move module-level `const` declarations above the tests.
- Move module-level `function` declarations below the tests.
- Do not convert module-level `function` declarations into `const` function expressions just to satisfy ordering unless there is a clear readability reason.
- Keep imports at the top.
- Keep test suites in the most readable order for the behavior being tested.
- If an existing test appears to assert a bug, update the test to assert the intended behavior instead.

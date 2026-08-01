---
name: to-approach
description: Plan an implementation approach in approved chunks before coding; use when the user wants to review each part, verify reuse of existing code (like setup packages), and request changes before implementation.
disable-model-invocation: true
---

# To Approach

An approach is a proposed route to implementation. It is not the implementation.

## Process

### 0. Reuse audit

Before you write the approach, inspect the repo for existing packages, helpers, adapters, or setup code that already solves part of the job. Name the reusable code in the plan, and explain how the approach will use it instead of rebuilding it.

If the repo contains a setup package such as `platform/nextjs-effect`, call it out explicitly in the plan and say what role it plays.

If no existing code is a fit, say that plainly and explain why.

### 1. Ground the work

Read the conversation and the codebase enough to understand the target, constraints, and unknowns. If an important fact is missing, ask before drafting the approach.

### 2. Break the approach into approved parts

Split the work into a short sequence of decision-rich parts. Each part must be small enough for the user to approve, reject, or revise on its own.

Good parts are things like:

- problem framing
- module or seam choice
- data or contract changes
- test strategy
- rollout or risk handling

Bad parts are:

- a long implementation checklist
- file-by-file instructions
- multiple unrelated decisions bundled together

Each part should answer:

- what decision this part makes
- what you recommend
- why that choice is best
- which existing code or package this part intends to reuse
- what changes if the user wants a different path

### 3. Present one part at a time

Show only the next unapproved part. The first part must be the reuse audit. End with a direct approval question so the user can:

- approve it
- ask for changes
- reject it and ask for a rework

If the user asks for changes, revise that part and re-present it before moving on.

### 4. Respect dependencies

Later parts may depend on earlier approvals. If an earlier choice changes, revisit any dependent later parts before asking for approval again.

### 5. Stop before implementation

When every part is approved, summarize the approved approach and stop. Do not write code or start implementation. Hand off to `/implement` only after approval.

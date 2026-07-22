# Repository coding conventions

## Code organization

- **Put exported declarations at the top of a module and internal (non-exported)
  helpers below them.** In a file, exported symbols (types, constants, the main
  function/action, etc.) come first so a reader sees the public surface up front;
  module-private functions and helper constants they rely on are written
  underneath the exported code. This works because function declarations hoist,
  and helper constants are only referenced from within functions invoked at call
  time.

## Environment variables

- **This project uses `.env`, not `.env.local`.** Local configuration and secrets
  go in a `.env` file (the repo root `.env` is the canonical one; `.env.example`
  documents the required keys). Do not create or reference `.env.local` — reach
  for `.env` when instructing how to configure or test locally. `.env*` is
  gitignored (except `.env.example`).

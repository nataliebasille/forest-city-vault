import { Cause, Exit } from "effect";
import { unstable_rethrow } from "next/navigation";

/**
 * True when `error` is one of Next.js's internal control-flow signals — the
 * errors that `redirect()`, `notFound()`, `forbidden()` and `unauthorized()`
 * throw to unwind the render and tell Next to perform a navigation or render a
 * fallback. These are expected control flow, not application failures, so the
 * adapters must neither log them as defects nor swallow them.
 *
 * Detection defers to Next's own {@link unstable_rethrow}, which re-raises
 * exactly these errors and is a no-op for anything else, so this stays correct
 * as Next adds new internal signal types.
 */
export function isNextControlFlowError(error: unknown): boolean {
  try {
    unstable_rethrow(error);
    return false;
  } catch {
    return true;
  }
}

/**
 * As {@link isNextControlFlowError}, but reading the representative error out of
 * an Effect {@link Cause} (a `redirect()`/`notFound()` throw arrives as a `Die`
 * defect, so its value is recovered with {@link Cause.squash}).
 */
export function isNextControlFlowCause(cause: Cause.Cause<unknown>): boolean {
  return isNextControlFlowError(Cause.squash(cause));
}

/**
 * Settles a page/server-action pipeline's {@link Exit} into the value Next.js
 * expects. On success it returns the rendered value; on failure it re-raises the
 * original error so it surfaces to Next — routing a Next control-flow signal
 * through {@link unstable_rethrow} (so Next performs the navigation with the
 * error's `digest` intact) and otherwise throwing the underlying error for
 * Next's error boundary.
 *
 * This replaces a bare `Effect.runPromise`, whose rejection wraps the cause in a
 * `FiberFailure` — hiding the `digest` Next reads to recognize a redirect, which
 * turned every auth-gate redirect into a 500.
 */
export function raisePipelineExit<A>(exit: Exit.Exit<A, unknown>): A {
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  const error = Cause.squash(exit.cause);
  unstable_rethrow(error);
  throw error;
}

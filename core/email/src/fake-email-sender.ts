import { Effect, Layer } from "effect";
import { EmailSender, EmailSendError, type EmailMessage } from "./email-sender";

/** A reusable fake {@link EmailSender} plus a handle to inspect what it sent. */
export interface FakeEmailSender {
  /** Layer that provides the fake {@link EmailSender}. */
  readonly layer: Layer.Layer<EmailSender>;
  /** Messages passed to `send`, in call order (recorded even when it fails). */
  readonly sent: ReadonlyArray<EmailMessage>;
}

/**
 * Builds a fake {@link EmailSender} for tests — the email analog of `staticClock`
 * / `staticIdGenerator`. Every `send` is recorded in {@link FakeEmailSender.sent}
 * so callers can assert on the outgoing message. Pass `failWith` to make `send`
 * fail with that {@link EmailSendError} (the attempt is still recorded), exercising
 * the provider-failure branch without a real transport.
 */
export function makeFakeEmailSender(options?: {
  readonly failWith?: EmailSendError;
}): FakeEmailSender {
  const sent: EmailMessage[] = [];

  const layer = Layer.succeed(EmailSender, {
    send: (message) =>
      Effect.gen(function* () {
        sent.push(message);
        if (options?.failWith) {
          return yield* Effect.fail(options.failWith);
        }
      }),
  });

  return { layer, sent };
}

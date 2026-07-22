import { Context, Data, Effect } from "effect";

/**
 * A transactional email to send. Routing identity (the `from` sender and the
 * destination `to`) is owned by the configured transport, so callers supply only
 * the message content plus a `replyTo` for direct responses.
 */
export interface EmailMessage {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  /** Address responses should go to (e.g. the applicant), used as reply-to. */
  readonly replyTo: string;
}

/** The email provider rejected or failed the send. */
export class EmailSendError extends Data.TaggedError("EmailSendError")<{
  readonly cause: unknown;
}> {}

export interface EmailSenderService {
  readonly send: (
    message: EmailMessage,
  ) => Effect.Effect<void, EmailSendError>;
}

/**
 * Sends transactional emails. Injected as a service so callers depend on the
 * capability rather than a concrete provider — production wires a provider layer
 * (e.g. {@link ResendEmailSender}) while tests supply a fake. Missing transport
 * configuration fails when the provider layer is built (a `ConfigError`), not
 * from `send`, so `send`'s only typed failure is a genuine send failure.
 */
export class EmailSender extends Context.Tag(
  "@forest-city-vault/core-email/EmailSender",
)<EmailSender, EmailSenderService>() {}

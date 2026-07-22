import { EmailConfig } from "@forest-city-vault/core-config";
import { Effect, Layer, Redacted } from "effect";
import { Resend } from "resend";
import {
  EmailSender,
  EmailSendError,
  type EmailSenderService,
} from "../email-sender";

/**
 * The slice of the Resend client this sender depends on. Declared structurally
 * (rather than using the concrete `Resend` type) so the send-mapping logic can be
 * exercised against a fake client in tests. `error` is `unknown` because the only
 * thing we do with a non-null value is treat it as a send failure.
 */
export interface ResendClient {
  readonly emails: {
    readonly send: (payload: {
      from: string;
      to: string[];
      replyTo: string;
      subject: string;
      text: string;
      html: string;
    }) => Promise<{ error: unknown }>;
  };
}

/** Routing configuration baked into the sender when it is built. */
export interface ResendEmailSenderConfig {
  readonly toEmail: string;
  readonly fromEmail: string;
}

/**
 * Builds an {@link EmailSender} over a Resend-like client. Kept separate from
 * {@link ResendEmailSender} so the mapping between an {@link EmailMessage} and the
 * Resend payload — plus the failure mapping to {@link EmailSendError} — is
 * testable without constructing a real client or hitting the network. A non-null
 * `error` in the response and a rejected send both surface as `EmailSendError`.
 */
export function makeResendEmailSender(
  client: ResendClient,
  config: ResendEmailSenderConfig,
): EmailSenderService {
  return {
    send: (message) =>
      Effect.tryPromise({
        try: async () => {
          const { error } = await client.emails.send({
            from: `Forest City Vault <${config.fromEmail}>`,
            to: [config.toEmail],
            replyTo: message.replyTo,
            subject: message.subject,
            text: message.text,
            html: message.html,
          });

          if (error) {
            throw error;
          }
        },
        catch: (cause) => new EmailSendError({ cause }),
      }),
  };
}

/**
 * Resend-backed {@link EmailSender}. Transport configuration is read from
 * {@link EmailConfig} when the layer is built:
 *  - `RESEND_API_KEY` — Resend API key (required).
 *  - `VENDOR_APPLICATION_TO_EMAIL` — where applications are delivered (required).
 *  - `VENDOR_APPLICATION_FROM_EMAIL` — sender address (defaults to Resend's
 *    onboarding address).
 *
 * Missing required configuration fails hard as a `ConfigError` when this layer is
 * built, so `send` only ever fails with {@link EmailSendError}.
 */
export const ResendEmailSender = Layer.effect(
  EmailSender,
  Effect.gen(function* () {
    const { resendApiKey, toEmail, fromEmail } = yield* EmailConfig;
    const client = new Resend(Redacted.value(resendApiKey));

    return makeResendEmailSender(client, { toEmail, fromEmail });
  }),
).pipe(Layer.provide(EmailConfig.Default));

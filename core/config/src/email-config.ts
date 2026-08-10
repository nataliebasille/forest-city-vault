import { Config, Effect } from "effect";

export class EmailConfig extends Effect.Service<EmailConfig>()("EmailConfig", {
  effect: Effect.all({
    resendApiKey: Config.redacted("RESEND_API_KEY"),
    toEmail: Config.string("VENDOR_APPLICATION_TO_EMAIL"),
    fromEmail: Config.string("VENDOR_APPLICATION_FROM_EMAIL").pipe(
      Config.withDefault("onboarding@resend.dev"),
    ),
  }),
}) {}

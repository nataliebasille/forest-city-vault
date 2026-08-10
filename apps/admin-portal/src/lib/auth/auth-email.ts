import { Data, Effect, Redacted } from "effect";
import { createTransport } from "nodemailer";
import { Resend } from "resend";

/** The magic-link email failed to send. */
export class AuthEmailSendError extends Data.TaggedError(
  "admin-portal/AuthEmailSendError",
)<{ readonly cause: unknown }> {}

/**
 * How the sign-in email is delivered. `smtp` routes over SMTP — used in local dev
 * to drop mail into Mailpit (`AUTH_SMTP_URL=smtp://localhost:54325`) so links are
 * clickable without a real provider. `resend` sends through the Resend HTTP API,
 * the production transport.
 */
export type AuthEmailTransport =
  | { readonly kind: "smtp"; readonly url: string; readonly from: string }
  | {
      readonly kind: "resend";
      readonly apiKey: Redacted.Redacted<string>;
      readonly from: string;
    };

/**
 * Sends the passwordless sign-in email as an {@link Effect}, over whichever
 * {@link AuthEmailTransport} is configured.
 *
 * A deliberately small, self-contained transport rather than a reuse of
 * `core-email`'s `EmailSender`, which is hard-wired to the vendor-application
 * inbox (a fixed `to`); an auth email is a plain transactional message addressed
 * to the visitor. Config is injected (never read from `process.env` here), and
 * the Resend key stays {@link Redacted} until the send itself.
 */
export function sendMagicLinkEmail(
  transport: AuthEmailTransport,
  input: { readonly to: string; readonly url: string },
) {
  return Effect.tryPromise({
    try: () =>
      transport.kind === "smtp" ?
        sendViaSmtp(transport, input)
      : sendViaResend(transport, input),
    catch: (cause) => new AuthEmailSendError({ cause }),
  });
}

async function sendViaSmtp(
  transport: Extract<AuthEmailTransport, { kind: "smtp" }>,
  input: { readonly to: string; readonly url: string },
) {
  const mailer = createTransport(transport.url);
  await mailer.sendMail({
    from: transport.from,
    to: input.to,
    subject: SUBJECT,
    text: magicLinkText(input.url),
    html: magicLinkHtml(input.url),
  });
}

async function sendViaResend(
  transport: Extract<AuthEmailTransport, { kind: "resend" }>,
  input: { readonly to: string; readonly url: string },
) {
  const client = new Resend(Redacted.value(transport.apiKey));
  const { error } = await client.emails.send({
    from: transport.from,
    to: [input.to],
    subject: SUBJECT,
    text: magicLinkText(input.url),
    html: magicLinkHtml(input.url),
  });

  if (error) {
    throw error;
  }
}

const SUBJECT = "Your Forest City Vault sign-in link";

function magicLinkText(url: string) {
  return [
    "Forest City Vault — Admin Portal",
    "",
    "Sign in to the vault",
    "",
    "Use the link below to finish signing in. For your security, this link",
    "expires shortly and can be used only once.",
    "",
    url,
    "",
    "Access to the Forest City Vault admin portal is invite-only. If you didn't",
    "request this link, you can safely ignore this email — no one can sign in",
    "without it.",
  ].join("\n");
}

/**
 * The branded sign-in email, ported from the original Supabase Auth template
 * (`supabase/templates/magic_link.html`). Table-based, inline-styled markup for
 * broad email-client support; the Supabase `{{ .ConfirmationURL }}` placeholder
 * is replaced by the link Better Auth generates. The original's "prefer a code"
 * (OTP) block is intentionally dropped — the portal verifies via the link only
 * and has no code-entry screen.
 */
function magicLinkHtml(url: string) {
  const href = escapeHtmlAttribute(url);
  const text = escapeHtml(url);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light only" />
    <title>Your Forest City Vault sign-in link</title>
  </head>
  <body
    style="margin: 0; padding: 0; width: 100%; background-color: #f5f1ea; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;"
  >
    <!-- Preheader: shown as the inbox preview, hidden in the body. -->
    <div
      style="display: none; max-height: 0; overflow: hidden; opacity: 0; mso-hide: all;"
    >
      Your secure sign-in link for the Forest City Vault admin portal. It
      expires shortly and can only be used once.
    </div>

    <table
      role="presentation"
      width="100%"
      cellpadding="0"
      cellspacing="0"
      border="0"
      style="background-color: #f5f1ea;"
    >
      <tr>
        <td align="center" style="padding: 32px 16px;">
          <table
            role="presentation"
            width="560"
            cellpadding="0"
            cellspacing="0"
            border="0"
            style="width: 560px; max-width: 100%; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e7ddd0;"
          >
            <!-- Brand header -->
            <tr>
              <td
                style="background-color: #4c4639; padding: 36px 40px 32px 40px;"
              >
                <p
                  style="margin: 0 0 10px 0; font-family: Georgia, 'Times New Roman', serif; font-size: 11px; line-height: 1; letter-spacing: 3px; text-transform: uppercase; color: #be996d;"
                >
                  Admin Portal
                </p>
                <p
                  style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 26px; line-height: 1.2; font-weight: 700; color: #ffffff;"
                >
                  Forest City Vault
                </p>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding: 40px 40px 8px 40px;">
                <h1
                  style="margin: 0 0 16px 0; font-family: Georgia, 'Times New Roman', serif; font-size: 24px; line-height: 1.3; font-weight: 700; color: #2c281f;"
                >
                  Sign in to the vault
                </h1>
                <p
                  style="margin: 0 0 28px 0; font-family: Georgia, 'Times New Roman', serif; font-size: 16px; line-height: 1.6; color: #5f574a;"
                >
                  Use the button below to finish signing in. For your security,
                  this link expires shortly and can be used only once.
                </p>

                <!-- Button -->
                <table
                  role="presentation"
                  cellpadding="0"
                  cellspacing="0"
                  border="0"
                  style="margin: 0 0 28px 0;"
                >
                  <tr>
                    <td
                      align="center"
                      bgcolor="#af5f1d"
                      style="border-radius: 10px;"
                    >
                      <a
                        href="${href}"
                        target="_blank"
                        style="display: inline-block; padding: 15px 32px; font-family: Georgia, 'Times New Roman', serif; font-size: 14px; line-height: 1; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #ffffff; text-decoration: none; border-radius: 10px;"
                      >
                        Sign in
                      </a>
                    </td>
                  </tr>
                </table>

                <!-- Link fallback -->
                <p
                  style="margin: 0 0 8px 0; font-family: Georgia, 'Times New Roman', serif; font-size: 13px; line-height: 1.6; color: #8a8175;"
                >
                  If the button doesn't work, copy and paste this link into your
                  browser:
                </p>
                <p style="margin: 0 0 8px 0; word-break: break-all;">
                  <a
                    href="${href}"
                    target="_blank"
                    style="font-family: 'Courier New', Courier, monospace; font-size: 12px; line-height: 1.5; color: #af5f1d; text-decoration: underline;"
                    >${text}</a
                  >
                </p>
              </td>
            </tr>

            <!-- Divider -->
            <tr>
              <td style="padding: 24px 40px 0 40px;">
                <div
                  style="border-top: 1px solid #ece4d8; height: 1px; line-height: 1px; font-size: 0;"
                >
                  &nbsp;
                </div>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding: 20px 40px 36px 40px;">
                <p
                  style="margin: 0 0 6px 0; font-family: Georgia, 'Times New Roman', serif; font-size: 13px; line-height: 1.6; color: #8a8175;"
                >
                  Access to the Forest City Vault admin portal is invite-only. If
                  you didn't request this link, you can safely ignore this email
                  — no one can sign in without it.
                </p>
                <p
                  style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 11px; line-height: 1; letter-spacing: 2px; text-transform: uppercase; color: #b7ad9d;"
                >
                  Forest City Vault · Secured access
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(value: string) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

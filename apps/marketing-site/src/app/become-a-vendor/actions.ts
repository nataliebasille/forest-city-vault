"use server";

import { Effect, Either, ParseResult, Schema } from "effect";
import { VENDOR_CATEGORIES } from "@/lib/vendors/categories";
import { EmailSender, type EmailMessage } from "@forest-city-vault/core-email";
import { action } from "@/lib/runtime/runtime";
import { RequestTrace } from "@/lib/runtime/request-trace";
import type {
  VendorApplicationFieldErrors,
  VendorApplicationState,
} from "./state";

/**
 * Handles "Become a vendor" application submissions. Validates on the server,
 * screens a honeypot field for bots, and emails the application to the shop.
 *
 * Runs through the shared {@link action} boundary, so the whole submission
 * carries a request id and its logs (received, sent, and any failure) are
 * annotated with that id. Expected outcomes — honeypot, validation, missing
 * config, provider failure, success — are all resolved to a
 * {@link VendorApplicationState} value so the boundary never rejects and the form
 * always receives a next state.
 *
 * Bound to React's `useActionState`: `action` returns a
 * `(prevState, formData) => Promise<VendorApplicationState>` function, which is
 * exactly the signature `useActionState` expects.
 */
export const submitVendorApplication = action(
  "vendor.application.submit",
  (_prevState: VendorApplicationState, formData: FormData) =>
    Effect.gen(function* () {
      const trace = yield* RequestTrace;
      yield* Effect.logInfo("vendor.application.received", {
        requestId: trace.requestId,
        requestIdSource: trace.requestIdSource,
      });

      // Honeypot: real users never fill this hidden field. Pretend success so
      // bots don't learn they were filtered.
      if (field(formData, "company_website")) {
        yield* Effect.logInfo("vendor.application.honeypot_tripped");
        return {
          status: "success",
          message: "Thanks! Your application is on its way.",
        } satisfies VendorApplicationState;
      }

      const values = readValues(formData);
      const fieldErrors = validate(values);

      if (Object.keys(fieldErrors).length > 0) {
        yield* Effect.logInfo("vendor.application.validation_failed", {
          fields: Object.keys(fieldErrors),
        });
        return {
          status: "error",
          message: "Please fix the highlighted fields and try again.",
          fieldErrors,
          values,
        } satisfies VendorApplicationState;
      }

      const sender = yield* EmailSender;

      return yield* sender.send(buildEmail(values)).pipe(
        Effect.zipRight(
          Effect.logInfo("vendor.application.sent", {
            businessName: values.businessName,
          }).pipe(
            Effect.as({
              status: "success",
              message:
                "Thanks for applying! We've received your details and will be in touch soon.",
            } satisfies VendorApplicationState),
          ),
        ),
        Effect.catchTag("EmailSendError", (error) =>
          Effect.logError("vendor.application.send_failed", {
            cause: String(error.cause),
          }).pipe(
            Effect.as({
              status: "error",
              message:
                "Something went wrong sending your application. Please try again in a moment.",
              values,
            } satisfies VendorApplicationState),
          ),
        ),
      );
    }),
);

type VendorApplicationValues = NonNullable<VendorApplicationState["values"]>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Declarative validation for the fields shown inline on the form. Each rule
 * carries the exact copy surfaced to the applicant, and the email field chains
 * two rules so an empty value reports "required" while a malformed value reports
 * "invalid" (the chain short-circuits, so only one message is ever produced per
 * field). Values are already trimmed by {@link readValues}; excess keys (phone,
 * website, categories) are ignored by the struct.
 */
const VendorApplicationInput = Schema.Struct({
  businessName: Schema.String.pipe(
    Schema.minLength(1, {
      message: () => "Please tell us your business or brand name.",
    }),
  ),
  contactName: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Please tell us your name." }),
  ),
  email: Schema.String.pipe(
    Schema.minLength(1, {
      message: () => "Please enter an email so we can reach you.",
    }),
    Schema.pattern(EMAIL_PATTERN, {
      message: () => "Please enter a valid email address.",
    }),
  ),
  message: Schema.String.pipe(
    Schema.minLength(1, {
      message: () => "Please tell us a little about your work.",
    }),
  ),
});

const FIELD_ERROR_KEYS = [
  "businessName",
  "contactName",
  "email",
  "message",
] as const satisfies ReadonlyArray<keyof VendorApplicationFieldErrors>;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function readValues(formData: FormData): VendorApplicationValues {
  return {
    businessName: field(formData, "businessName"),
    contactName: field(formData, "contactName"),
    email: field(formData, "email"),
    phone: field(formData, "phone"),
    website: field(formData, "website"),
    categories: formData
      .getAll("categories")
      .filter((c): c is string => typeof c === "string")
      .filter((c) => VENDOR_CATEGORIES.includes(c as never)),
    message: field(formData, "message"),
  };
}

function isFieldErrorKey(
  key: PropertyKey,
): key is keyof VendorApplicationFieldErrors {
  return (FIELD_ERROR_KEYS as ReadonlyArray<PropertyKey>).includes(key);
}

function validate(
  values: VendorApplicationValues,
): VendorApplicationFieldErrors {
  const result = Schema.decodeUnknownEither(VendorApplicationInput, {
    errors: "all",
  })(values);

  if (Either.isRight(result)) {
    return {};
  }

  const fieldErrors: VendorApplicationFieldErrors = {};
  for (const issue of ParseResult.ArrayFormatter.formatErrorSync(result.left)) {
    const key = issue.path[0];
    // Keep the first message per field, mirroring the email short-circuit.
    if (key !== undefined && isFieldErrorKey(key) && !fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}

function buildEmail(values: VendorApplicationValues): EmailMessage {
  const categoriesText =
    values.categories.length > 0 ? values.categories.join(", ") : "—";

  const text = [
    `Business / brand name: ${values.businessName}`,
    `Contact name: ${values.contactName}`,
    `Email: ${values.email}`,
    `Phone: ${values.phone || "—"}`,
    `Website / social: ${values.website || "—"}`,
    `Categories: ${categoriesText}`,
    "",
    "About their work:",
    values.message,
  ].join("\n");

  const html = `
    <h2>New vendor application</h2>
    <table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
      <tr><td><strong>Business / brand</strong></td><td>${escapeHtml(values.businessName)}</td></tr>
      <tr><td><strong>Contact</strong></td><td>${escapeHtml(values.contactName)}</td></tr>
      <tr><td><strong>Email</strong></td><td>${escapeHtml(values.email)}</td></tr>
      <tr><td><strong>Phone</strong></td><td>${escapeHtml(values.phone || "—")}</td></tr>
      <tr><td><strong>Website / social</strong></td><td>${escapeHtml(values.website || "—")}</td></tr>
      <tr><td><strong>Categories</strong></td><td>${escapeHtml(categoriesText)}</td></tr>
    </table>
    <h3>About their work</h3>
    <p style="font-family:sans-serif;font-size:14px;white-space:pre-wrap;">${escapeHtml(values.message)}</p>
  `;

  return {
    subject: `Vendor application — ${values.businessName}`,
    text,
    html,
    replyTo: values.email,
  };
}

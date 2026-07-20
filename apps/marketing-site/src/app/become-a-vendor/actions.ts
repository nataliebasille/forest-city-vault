"use server";

import { Resend } from "resend";
import { VENDOR_CATEGORIES } from "@/lib/vendors/categories";

/** Field-level validation errors keyed by form field name. */
export type VendorApplicationFieldErrors = Partial<
  Record<"businessName" | "contactName" | "email" | "message", string>
>;

export type VendorApplicationState = {
  status: "idle" | "success" | "error";
  /** Human-readable message shown to the applicant. */
  message: string;
  /** Field-level errors for inline display. */
  fieldErrors?: VendorApplicationFieldErrors;
  /** Echoes submitted values so the form can repopulate after an error. */
  values?: {
    businessName: string;
    contactName: string;
    email: string;
    phone: string;
    website: string;
    categories: string[];
    message: string;
  };
};

export const initialVendorApplicationState: VendorApplicationState = {
  status: "idle",
  message: "",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

/**
 * Handles "Become a vendor" application submissions. Validates on the server,
 * screens a honeypot field for bots, and emails the application to the shop via
 * Resend. Designed for React's `useActionState`, so it takes the previous state
 * as its first argument and returns the next state.
 */
export async function submitVendorApplication(
  _prevState: VendorApplicationState,
  formData: FormData,
): Promise<VendorApplicationState> {
  // Honeypot: real users never fill this hidden field. Pretend success so bots
  // don't learn they were filtered.
  if (field(formData, "company_website")) {
    return {
      status: "success",
      message: "Thanks! Your application is on its way.",
    };
  }

  const values = {
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

  const fieldErrors: VendorApplicationFieldErrors = {};
  if (!values.businessName) {
    fieldErrors.businessName = "Please tell us your business or brand name.";
  }
  if (!values.contactName) {
    fieldErrors.contactName = "Please tell us your name.";
  }
  if (!values.email) {
    fieldErrors.email = "Please enter an email so we can reach you.";
  } else if (!EMAIL_PATTERN.test(values.email)) {
    fieldErrors.email = "Please enter a valid email address.";
  }
  if (!values.message) {
    fieldErrors.message = "Please tell us a little about your work.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: "error",
      message: "Please fix the highlighted fields and try again.",
      fieldErrors,
      values,
    };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.VENDOR_APPLICATION_TO_EMAIL;
  const fromEmail =
    process.env.VENDOR_APPLICATION_FROM_EMAIL ?? "onboarding@resend.dev";

  if (!apiKey || !toEmail) {
    console.error(
      "[become-a-vendor] Missing email configuration: set RESEND_API_KEY and VENDOR_APPLICATION_TO_EMAIL.",
    );
    return {
      status: "error",
      message:
        "We couldn't submit your application right now. Please try again later or email us directly.",
      values,
    };
  }

  const categoriesText =
    values.categories.length > 0 ? values.categories.join(", ") : "—";

  const lines = [
    `Business / brand name: ${values.businessName}`,
    `Contact name: ${values.contactName}`,
    `Email: ${values.email}`,
    `Phone: ${values.phone || "—"}`,
    `Website / social: ${values.website || "—"}`,
    `Categories: ${categoriesText}`,
    "",
    "About their work:",
    values.message,
  ];

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

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: `Forest City Vault <${fromEmail}>`,
      to: [toEmail],
      replyTo: values.email,
      subject: `Vendor application — ${values.businessName}`,
      text: lines.join("\n"),
      html,
    });

    if (error) {
      console.error("[become-a-vendor] Resend error:", error);
      return {
        status: "error",
        message:
          "Something went wrong sending your application. Please try again in a moment.",
        values,
      };
    }
  } catch (error) {
    console.error("[become-a-vendor] Unexpected error:", error);
    return {
      status: "error",
      message:
        "Something went wrong sending your application. Please try again in a moment.",
      values,
    };
  }

  return {
    status: "success",
    message:
      "Thanks for applying! We've received your details and will be in touch soon.",
  };
}

"use client";

import { useActionState, useCallback, useId, useState } from "react";
import { cn } from "@/lib/cn";
import { VENDOR_CATEGORIES } from "@/lib/vendors/categories";
import { submitVendorApplication } from "@/app/become-a-vendor/actions";
import {
  initialVendorApplicationState,
  type VendorApplicationState,
} from "@/app/become-a-vendor/state";

type FieldProps = {
  id: string;
  name: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  defaultValue?: string;
  error?: string;
  placeholder?: string;
  className?: string;
} & (
  | {
      multiline: true;
      rows?: number;
      type?: never;
      inputMode?: never;
      autoComplete?: never;
    }
  | {
      multiline?: false;
      rows?: never;
      type?: string;
      inputMode?: "url" | "tel" | "email" | "text";
      autoComplete?: string;
    }
);

/**
 * A single labelled input built on the Natcore design system's `form-control`
 * grid utility (label tab + control + hint), which supplies the border, focus,
 * and error styling. Adding `form-control-error` turns the borders red.
 */
function Field(props: FieldProps) {
  const {
    id,
    name,
    label,
    required,
    optional,
    defaultValue,
    error,
    placeholder,
    className,
  } = props;
  const errorId = error ? `${id}-error` : undefined;

  const shared = {
    id,
    name,
    required,
    defaultValue,
    placeholder,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": errorId,
    // Suppress password-manager overlay icons (LastPass, 1Password) — these are
    // not credential fields.
    "data-lpignore": "true",
    "data-1p-ignore": "true",
  } as const;

  return (
    <div className={cn("form-control", error && "form-control-error", className)}>
      <label htmlFor={id} className="flex-row flex-wrap items-baseline gap-x-1">
        {label}
        {required ?
          <span className="text-primary-500">*</span>
        : null}
        {optional ?
          <span className="text-secondary-500/60">(optional)</span>
        : null}
      </label>
      {props.multiline ?
        <textarea {...shared} rows={props.rows ?? 5} className="resize-y" />
      : <input
          {...shared}
          type={props.type ?? "text"}
          inputMode={props.inputMode}
          autoComplete={props.autoComplete}
        />
      }
      {error ?
        <span id={errorId} className="form-control-hint text-red-600">
          {error}
        </span>
      : null}
    </div>
  );
}

/**
 * Vendor application form. A native `<form>` bound to the
 * {@link submitVendorApplication} Server Action via `useActionState`, so it
 * works without JS and enhances with pending/inline-error/success states once
 * hydrated. On success the form is replaced with a confirmation panel.
 */
export function BecomeVendorForm() {
  const [state, formAction, pending] = useActionState<
    VendorApplicationState,
    FormData
  >(submitVendorApplication, initialVendorApplicationState);

  const values = state.values;
  const errors = state.fieldErrors ?? {};
  const baseId = useId();

  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    values?.categories ?? [],
  );

  const toggleCategory = useCallback((category: string) => {
    setSelectedCategories((current) =>
      current.includes(category) ?
        current.filter((c) => c !== category)
      : [...current, category],
    );
  }, []);

  if (state.status === "success") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mt-8 max-w-2xl rounded-3xl border border-primary-500/30 bg-primary-50/60 p-8 text-center shadow-[0_40px_90px_-55px_rgba(76,70,57,0.6)]"
      >
        <p className="font-subheading text-xs font-semibold tracking-[0.28em] text-primary-500 uppercase">
          Application received
        </p>
        <h3 className="mt-3 font-heading text-2xl text-secondary-500">
          Thanks for applying!
        </h3>
        <p className="mt-3 text-lg/8 text-on-surface-50/80">{state.message}</p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      noValidate
      className="mt-8 max-w-3xl rounded-3xl border border-surface-950/12 bg-surface-50 p-6 shadow-[0_40px_90px_-55px_rgba(76,70,57,0.6)] md:p-8"
    >
      {/* Honeypot: hidden from users, tempting to bots. */}
      <div aria-hidden="true" className="hidden">
        <label htmlFor={`${baseId}-company_website`}>
          Company website (leave blank)
        </label>
        <input
          id={`${baseId}-company_website`}
          type="text"
          name="company_website"
          tabIndex={-1}
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore="true"
        />
      </div>

      {state.status === "error" && state.message ?
        <p
          role="alert"
          className="mb-6 rounded-xl border border-primary-500/30 bg-primary-50/60 px-4 py-3 text-sm font-medium text-primary-500"
        >
          {state.message}
        </p>
      : null}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field
          id={`${baseId}-businessName`}
          name="businessName"
          label="Business / brand name"
          required
          defaultValue={values?.businessName}
          error={errors.businessName}
        />

        <Field
          id={`${baseId}-contactName`}
          name="contactName"
          label="Contact name"
          required
          defaultValue={values?.contactName}
          error={errors.contactName}
        />

        <Field
          id={`${baseId}-email`}
          name="email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          defaultValue={values?.email}
          error={errors.email}
        />

        <Field
          id={`${baseId}-phone`}
          name="phone"
          label="Phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          optional
          defaultValue={values?.phone}
        />

        <Field
          id={`${baseId}-website`}
          name="website"
          label="Website or social link"
          inputMode="url"
          placeholder="instagram.com/yourshop"
          optional
          defaultValue={values?.website}
          className="md:col-span-2"
        />

        <div className="flex flex-col gap-2.5 md:col-span-2">
          <span className="font-subheading text-sm font-semibold text-secondary-500">
            Product categories{" "}
            <span className="font-normal text-secondary-500/60">
              (optional)
            </span>
          </span>
          <p className="-mt-1 text-sm text-secondary-500/70">
            These are just to help us get a feel for your work — your products
            don&apos;t have to fit any of them. Pick any that apply, or skip
            this and tell us more below.
          </p>
          <div className="flex flex-wrap gap-2.5">
            {VENDOR_CATEGORIES.map((category) => {
              const active = selectedCategories.includes(category);
              return (
                <label
                  key={category}
                  className={cn(
                    "cursor-pointer rounded-full border px-4 py-2 font-subheading text-sm font-semibold transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary-500",
                    active ?
                      "border-primary-500 bg-primary-500 text-surface-50"
                    : "border-surface-500/55 bg-surface-50 text-secondary-500 hover:border-primary-500/50",
                  )}
                >
                  <input
                    type="checkbox"
                    name="categories"
                    value={category}
                    checked={active}
                    onChange={() => toggleCategory(category)}
                    className="sr-only"
                  />
                  {category}
                </label>
              );
            })}
          </div>
        </div>

        <Field
          id={`${baseId}-message`}
          name="message"
          label="Tell us about your work"
          required
          multiline
          rows={5}
          placeholder="What do you make? How long have you been at it? Anything we should know?"
          defaultValue={values?.message}
          error={errors.message}
          className="md:col-span-2"
        />
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="btn btn-solid/primary inline-flex min-h-11 items-center justify-center font-subheading text-sm font-semibold tracking-wide uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:opacity-70"
        >
          {pending ? "Submitting…" : "Submit application"}
        </button>
        <p className="text-sm text-secondary-500/70">
          We&apos;ll reply within a few business days.
        </p>
      </div>
    </form>
  );
}

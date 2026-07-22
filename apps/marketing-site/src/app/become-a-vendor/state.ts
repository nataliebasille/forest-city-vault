/**
 * Shared state contract for the "Become a vendor" form and its Server Action.
 *
 * Kept separate from `actions.ts` because that file carries the `"use server"`
 * directive, and a server module may only export async functions — not the types
 * or the initial-state object below. Both the client form and the action import
 * these from here.
 */

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

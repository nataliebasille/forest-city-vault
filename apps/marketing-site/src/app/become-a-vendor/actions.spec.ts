import { describe, test } from "node:test";
import { expect } from "expect";
import { testServerAction } from "@forest-city-vault/platform-nextjs-effect";
import {
  EmailSendError,
  makeFakeEmailSender,
} from "@forest-city-vault/core-email";
import { Layer } from "effect";
import { staticRequestTrace, testRequestState } from "@/lib/runtime/testing";
import { submitVendorApplication } from "./actions";
import {
  initialVendorApplicationState,
  type VendorApplicationState,
} from "./state";

const VALID_FIELDS = {
  businessName: "Acme Goods",
  contactName: "Jamie Rivera",
  email: "jamie@example.com",
  phone: "555-1234",
  website: "acme.example",
  categories: ["Jewelry", "Art"],
  message: "We make handcrafted jewelry and small-batch art prints.",
} as const;

describe("submitVendorApplication", () => {
  test("sends the application and reports success for valid input", async () => {
    const { submit, sent } = runSubmit();

    const result = await submit(
      initialVendorApplicationState,
      formDataFrom(VALID_FIELDS),
    );

    expect(result.status).toBe("success");
    expect(result.message).toBe(
      "Thanks for applying! We've received your details and will be in touch soon.",
    );

    expect(sent).toHaveLength(1);
    const email = sent[0];
    expect(email.subject).toBe("Vendor application — Acme Goods");
    expect(email.replyTo).toBe(VALID_FIELDS.email);
    expect(email.text).toContain("Business / brand name: Acme Goods");
    expect(email.text).toContain("Contact name: Jamie Rivera");
  });

  test("treats a filled honeypot as success without sending an email", async () => {
    const { submit, sent } = runSubmit();

    const result = await submit(
      initialVendorApplicationState,
      formDataFrom({ ...VALID_FIELDS, company_website: "http://spam.example" }),
    );

    expect(result.status).toBe("success");
    expect(result.message).toBe("Thanks! Your application is on its way.");
    expect(sent).toHaveLength(0);
  });

  test("returns field errors for missing required fields without sending", async () => {
    const { submit, sent } = runSubmit();

    const result = await submit(
      initialVendorApplicationState,
      formDataFrom({
        businessName: "",
        contactName: "",
        email: "",
        message: "",
      }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toBe(
      "Please fix the highlighted fields and try again.",
    );
    expect(Object.keys(result.fieldErrors ?? {}).sort()).toEqual([
      "businessName",
      "contactName",
      "email",
      "message",
    ]);
    expect(sent).toHaveLength(0);
  });

  test("echoes submitted values back on a validation error", async () => {
    const { submit } = runSubmit();

    const result = await submit(
      initialVendorApplicationState,
      formDataFrom({ ...VALID_FIELDS, email: "" }),
    );

    expect(result.status).toBe("error");
    expect(result.values?.businessName).toBe(VALID_FIELDS.businessName);
    expect(result.values?.categories).toEqual(["Jewelry", "Art"]);
  });

  test("rejects a malformed email with the invalid-email message", async () => {
    const { submit, sent } = runSubmit();

    const result = await submit(
      initialVendorApplicationState,
      formDataFrom({ ...VALID_FIELDS, email: "not-an-email" }),
    );

    expect(result.fieldErrors?.email).toBe(
      "Please enter a valid email address.",
    );
    expect(sent).toHaveLength(0);
  });

  test("drops categories that aren't in the allowed list", async () => {
    const { submit, sent } = runSubmit();

    await submit(
      initialVendorApplicationState,
      formDataFrom({ ...VALID_FIELDS, categories: ["Jewelry", "Bogus"] }),
    );

    expect(sent[0].text).toContain("Categories: Jewelry");
    expect(sent[0].text).not.toContain("Bogus");
  });

  test("reports a send failure gracefully and echoes values", async () => {
    const { submit, sent } = runSubmit({
      failWith: new EmailSendError({ cause: new Error("provider down") }),
    });

    const result = await submit(
      initialVendorApplicationState,
      formDataFrom(VALID_FIELDS),
    );

    expect(result.status).toBe("error");
    expect(result.message).toBe(
      "Something went wrong sending your application. Please try again in a moment.",
    );
    expect(result.values?.businessName).toBe(VALID_FIELDS.businessName);
    // The send was still attempted before it failed.
    expect(sent).toHaveLength(1);
  });
});

function formDataFrom(
  fields: Record<string, string | ReadonlyArray<string>>,
): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      for (const item of value) formData.append(name, item);
    } else {
      formData.set(name, value as string);
    }
  }
  return formData;
}

function runSubmit(options?: { failWith?: EmailSendError }) {
  const fake = makeFakeEmailSender(options);
  // The handler infers a union of its result literals; widen to the declared
  // contract (VendorApplicationState) that `useActionState` actually consumes.
  const submit = testServerAction(submitVendorApplication, {
    layer: Layer.merge(fake.layer, staticRequestTrace()),
    requestState: testRequestState(),
  }) as (
    prevState: VendorApplicationState,
    formData: FormData,
  ) => Promise<VendorApplicationState>;
  return { submit, sent: fake.sent };
}

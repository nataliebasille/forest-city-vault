import { describe, test } from "node:test";
import { expect } from "expect";
import { Effect, Either } from "effect";
import { EmailSendError, type EmailMessage } from "../email-sender";
import {
  type ResendClient,
  makeResendEmailSender,
} from "./resend-email-sender";

const CONFIG = {
  toEmail: "applications@shop.example",
  fromEmail: "hello@shop.example",
} as const;

const MESSAGE: EmailMessage = {
  subject: "Vendor application — Acme Goods",
  text: "plain text body",
  html: "<p>html body</p>",
  replyTo: "applicant@example.com",
};

type SentPayload = Parameters<ResendClient["emails"]["send"]>[0];

describe("makeResendEmailSender", () => {
  test("succeeds when the client resolves without an error", async () => {
    const { sender } = makeRecordingSender({ error: null });

    const result = await Effect.runPromise(Effect.either(sender.send(MESSAGE)));

    expect(Either.isRight(result)).toBe(true);
  });

  test("maps the message and config onto the Resend payload", async () => {
    const { sender, sent } = makeRecordingSender({ error: null });

    await Effect.runPromise(sender.send(MESSAGE));

    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({
      from: `Forest City Vault <${CONFIG.fromEmail}>`,
      to: [CONFIG.toEmail],
      replyTo: MESSAGE.replyTo,
      subject: MESSAGE.subject,
      text: MESSAGE.text,
      html: MESSAGE.html,
    });
  });

  test("fails with EmailSendError when the client returns an error", async () => {
    const providerError = { name: "validation_error", message: "bad from" };
    const { sender } = makeRecordingSender({ error: providerError });

    const result = await Effect.runPromise(Effect.either(sender.send(MESSAGE)));

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(EmailSendError);
      expect(result.left.cause).toBe(providerError);
    }
  });

  test("fails with EmailSendError when the client rejects", async () => {
    const rejection = new Error("network down");
    const sender = makeResendEmailSender(
      { emails: { send: () => Promise.reject(rejection) } },
      CONFIG,
    );

    const result = await Effect.runPromise(Effect.either(sender.send(MESSAGE)));

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(EmailSendError);
      expect(result.left.cause).toBe(rejection);
    }
  });
});

function makeRecordingSender(response: { error: unknown }) {
  const sent: SentPayload[] = [];
  const client: ResendClient = {
    emails: {
      send: async (payload) => {
        sent.push(payload);
        return response;
      },
    },
  };
  return { sender: makeResendEmailSender(client, CONFIG), sent };
}

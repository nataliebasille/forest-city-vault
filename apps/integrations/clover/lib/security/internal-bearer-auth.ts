import { createHash, timingSafeEqual } from "node:crypto";

export function isAuthorizedInternalBearerToken(input: {
  authorizationHeader: string | null;
  expectedToken: string;
}) {
  const token = parseBearerToken(input.authorizationHeader);
  if (token === null) {
    return false;
  }

  return isTimingSafeTokenMatch(token, input.expectedToken);
}

function parseBearerToken(authorizationHeader: string | null) {
  if (authorizationHeader === null) {
    return null;
  }

  // Fetch-style header folding can join repeated Authorization headers with a
  // comma. Reject any comma-delimited value to avoid accepting multiple creds.
  if (authorizationHeader.includes(",")) {
    return null;
  }

  const match = /^Bearer ([^\s,]+)$/.exec(authorizationHeader.trim());
  return match?.[1] ?? null;
}

function isTimingSafeTokenMatch(actualToken: string, expectedToken: string) {
  const actualHash = sha256(actualToken);
  const expectedHash = sha256(expectedToken);

  return timingSafeEqual(actualHash, expectedHash);
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

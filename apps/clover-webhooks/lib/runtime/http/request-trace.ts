import { Context } from "effect";

export const REQUEST_ID_HEADER = "x-request-id";

type RequestIdSource = "generated" | "incoming";

export type RequestTraceEntity = {
  requestId: string;
  requestIdSource: RequestIdSource;
  method: string;
  url: string;
};

const isValidRequestId = (value: string) =>
  value.length <= 128 && /^[a-zA-Z0-9._:-]+$/.test(value);

export class RequestTrace extends Context.Tag("RequestTrace")<
  RequestTrace,
  RequestTraceEntity
>() {
  static fromRequest(request: Request): RequestTraceEntity {
    const url = new URL(request.url);
    const incoming = request.headers.get(REQUEST_ID_HEADER);

    const hasIncomingRequestId =
      incoming !== null && isValidRequestId(incoming);

    return {
      requestId: hasIncomingRequestId ? incoming : crypto.randomUUID(),
      requestIdSource: hasIncomingRequestId ? "incoming" : "generated",
      method: request.method,
      url: url.toString(),
    };
  }
}

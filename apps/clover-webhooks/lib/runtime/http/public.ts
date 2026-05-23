import { Schema } from "effect";
import { BadRequest } from "./bad-request";

export { BadRequest, badRequest } from "./bad-request";

export const RouteError = Schema.Union(BadRequest);

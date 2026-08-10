import { getAuth } from "@/lib/auth/auth";
import { toNextJsHandler } from "better-auth/next-js";
import type { NextRequest } from "next/server";

/**
 * Better Auth's catch-all endpoint. Every framework route the client and the
 * magic-link email hit — requesting a link, verifying it, reading the session,
 * signing out — is served from here. It replaces the Supabase PKCE
 * `/auth/callback` route: Better Auth owns token verification and session
 * issuance itself, at `/api/auth/magic-link/verify`.
 *
 * The handler is resolved per request via {@link getAuth} (a memoized lazy
 * singleton) rather than at module load, so `next build` can evaluate this route
 * module without constructing the auth instance — which would otherwise demand
 * the production email secret at build time.
 */
export function GET(request: NextRequest) {
  return toNextJsHandler(getAuth()).GET(request);
}

export function POST(request: NextRequest) {
  return toNextJsHandler(getAuth()).POST(request);
}

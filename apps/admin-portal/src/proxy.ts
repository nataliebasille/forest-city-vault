import { type NextRequest, NextResponse } from "next/server";

/**
 * Injects the current pathname as an `x-pathname` request header so that
 * Server Components (e.g. AppShell) can read it via `headers()` for
 * active-link highlighting without requiring a client component.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};

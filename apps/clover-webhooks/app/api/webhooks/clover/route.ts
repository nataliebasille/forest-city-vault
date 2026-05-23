import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);

  if (!payload) {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON payload" },
      { status: 400 },
    );
  }

  const signature = request.headers.get("x-clover-signature");

  // TODO: Validate Clover signature before processing.
  return NextResponse.json({
    ok: true,
    received: true,
    hasSignature: Boolean(signature),
  });
}

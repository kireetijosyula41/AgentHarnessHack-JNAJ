import { NextResponse } from "next/server";

export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected control-plane error.";
  const status = /missing|first|previous|not configured/i.test(message) ? 400 : 500;
  return NextResponse.json({ error: message }, { status });
}

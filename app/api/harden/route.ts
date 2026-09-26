import { NextResponse } from "next/server";
import { apiError } from "@/src/control-plane/http";
import { hardenInputSchema } from "@/src/control-plane/schemas";
import { harden } from "@/src/control-plane/service";

export async function POST(request: Request) {
  try {
    const body = hardenInputSchema.parse(await request.json().catch(() => ({})));
    return NextResponse.json(await harden(body.attackId));
  } catch (error) {
    return apiError(error);
  }
}

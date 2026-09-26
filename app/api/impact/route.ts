import { NextResponse } from "next/server";
import { apiError } from "@/src/control-plane/http";
import { computeImpact } from "@/src/control-plane/service";

export async function GET() {
  try {
    return NextResponse.json(await computeImpact());
  } catch (error) {
    return apiError(error);
  }
}

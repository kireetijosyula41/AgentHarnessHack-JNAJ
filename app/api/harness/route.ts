import { NextResponse } from "next/server";
import { apiError } from "@/src/control-plane/http";
import { getSnapshot } from "@/src/control-plane/service";

export async function GET() {
  try {
    return NextResponse.json(await getSnapshot());
  } catch (error) {
    return apiError(error);
  }
}

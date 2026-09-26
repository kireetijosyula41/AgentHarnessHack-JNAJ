import { NextResponse } from "next/server";
import { apiError } from "@/src/control-plane/http";
import { rollback } from "@/src/control-plane/service";

export async function POST() {
  try {
    return NextResponse.json(await rollback());
  } catch (error) {
    return apiError(error);
  }
}

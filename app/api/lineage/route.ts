import { NextResponse } from "next/server";
import { apiError } from "@/src/control-plane/http";
import { getLineage } from "@/src/control-plane/service";

export async function GET() {
  try {
    return NextResponse.json({ lineage: await getLineage() });
  } catch (error) {
    return apiError(error);
  }
}

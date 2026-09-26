import { NextResponse } from "next/server";
import { apiError } from "@/src/control-plane/http";
import { getSnapshot } from "@/src/control-plane/service";

export async function GET() {
  try {
    const snapshot = await getSnapshot();
    return NextResponse.json({ metrics: snapshot.metrics, storage: snapshot.storage });
  } catch (error) {
    return apiError(error);
  }
}

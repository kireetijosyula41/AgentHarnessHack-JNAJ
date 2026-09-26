import { NextResponse } from "next/server";
import { apiError } from "@/src/control-plane/http";
import { runInputSchema } from "@/src/control-plane/schemas";
import { runAgent } from "@/src/control-plane/service";

export async function POST(request: Request) {
  try {
    const input = runInputSchema.parse(await request.json());
    return NextResponse.json(await runAgent(input, "replay"));
  } catch (error) {
    return apiError(error);
  }
}

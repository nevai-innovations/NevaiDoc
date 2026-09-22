import { NextResponse } from "next/server";
import { getDashboard } from "@/lib/dashboard";
import { errorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getDashboard());
  } catch (e) {
    return errorResponse(e, "Failed to load dashboard");
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getVersion } from "@/lib/pages";
import { errorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; version: string }> };

export async function GET(_request: NextRequest, ctx: Ctx) {
  const { id, version } = await ctx.params;
  const n = Number(version);
  if (!Number.isInteger(n)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const v = await getVersion(id, n);
    if (!v) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ version: v });
  } catch (e) {
    return errorResponse(e, "Failed to load version");
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getPageFull, listVersions, restoreVersion } from "@/lib/pages";
import { getSettings } from "@/lib/settings";
import { errorResponse, readJson } from "@/lib/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const versions = await listVersions(id);
    return NextResponse.json({ versions });
  } catch (e) {
    return errorResponse(e, "Failed to load versions");
  }
}

/** POST { restore: <version number> } */
export async function POST(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  const version = Number(body.restore);
  if (!Number.isInteger(version) || version < 1) {
    return NextResponse.json({ error: "A version number to restore is required" }, { status: 400 });
  }
  try {
    await restoreVersion(id, version, (await getSettings()).displayName);
    const page = await getPageFull(id);
    return NextResponse.json({ page });
  } catch (e) {
    return errorResponse(e, "Failed to restore version");
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getSettings, getStorageUsage, updateSettings } from "@/lib/settings";
import { errorResponse, readJson, str } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const settings = await getSettings();
    if (!request.nextUrl.searchParams.has("usage")) return NextResponse.json({ settings });
    const usage = await getStorageUsage();
    return NextResponse.json({ settings, usage });
  } catch (e) {
    return errorResponse(e, "Failed to load settings");
  }
}

export async function PUT(request: NextRequest) {
  const body = await readJson(request);
  const workspaceName = str(body.workspaceName);
  if (workspaceName !== undefined && !workspaceName.trim()) {
    return NextResponse.json({ error: "Workspace name can't be empty" }, { status: 400 });
  }
  try {
    const settings = await updateSettings({ workspaceName, displayName: str(body.displayName) });
    return NextResponse.json({ settings });
  } catch (e) {
    return errorResponse(e, "Failed to save settings");
  }
}

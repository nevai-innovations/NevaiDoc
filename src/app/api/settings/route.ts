import { NextRequest, NextResponse } from "next/server";
import { getSettings, getStorageUsage, updateSettings } from "@/lib/settings";
import { errorResponse, readJson, str } from "@/lib/api";
import { MAX_UPLOAD_BYTES } from "@/lib/attachments";
import { S3_MAX_UPLOAD_BYTES, s3Configured } from "@/lib/s3";

/** Where uploads go and how big they may be — the UI shows these. */
function uploadInfo() {
  const s3 = s3Configured();
  return {
    storage: s3 ? ("s3" as const) : ("db" as const),
    maxUploadBytes: s3 ? S3_MAX_UPLOAD_BYTES : MAX_UPLOAD_BYTES,
    ...(s3 ? { bucket: process.env.S3_BUCKET, region: process.env.S3_REGION } : {}),
  };
}

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const settings = await getSettings();
    const uploads = uploadInfo();
    if (!request.nextUrl.searchParams.has("usage")) return NextResponse.json({ settings, uploads });
    const usage = await getStorageUsage();
    return NextResponse.json({ settings, uploads, usage });
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

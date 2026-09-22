import { NextRequest, NextResponse } from "next/server";
import { createFolder, listFolders } from "@/lib/folders";
import { errorResponse, readJson, str } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const folders = await listFolders();
    return NextResponse.json({ folders });
  } catch (e) {
    return errorResponse(e, "Failed to load folders");
  }
}

export async function POST(request: NextRequest) {
  const body = await readJson(request);
  try {
    const folder = await createFolder(str(body.name) ?? "", str(body.parentId) || null);
    return NextResponse.json({ folder }, { status: 201 });
  } catch (e) {
    return errorResponse(e, "Failed to create folder");
  }
}

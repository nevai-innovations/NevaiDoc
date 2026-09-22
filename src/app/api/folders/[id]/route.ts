import { NextRequest, NextResponse } from "next/server";
import { deleteFolder, updateFolder } from "@/lib/folders";
import { errorResponse, nullableId, readJson, str } from "@/lib/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  try {
    const folder = await updateFolder(id, { name: str(body.name), parentId: nullableId(body.parentId) });
    return NextResponse.json({ folder });
  } catch (e) {
    return errorResponse(e, "Failed to update folder");
  }
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const ok = await deleteFolder(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "Failed to delete folder");
  }
}

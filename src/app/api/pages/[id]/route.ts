import { NextRequest, NextResponse } from "next/server";
import { countDescendants, getPageFull, updatePage, deletePage, type PageUpdates } from "@/lib/pages";
import { getSettings } from "@/lib/settings";
import { errorResponse, nullableId, readJson } from "@/lib/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const page = await getPageFull(id);
    if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const descendantCount = await countDescendants(id);
    return NextResponse.json({ page, descendantCount });
  } catch (e) {
    return errorResponse(e, "Failed to load page");
  }
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await readJson(request);

  const updates: PageUpdates = {};
  if (typeof body.title === "string") updates.title = body.title;
  if (typeof body.content === "string") updates.content = body.content;
  if (body.parentId !== undefined) updates.parentId = body.parentId === null ? null : String(body.parentId);
  if (typeof body.order === "number") updates.order = body.order;
  const folderId = nullableId(body.folderId);
  if (folderId !== undefined) updates.folderId = folderId;
  if (typeof body.description === "string") updates.description = body.description;
  if (Array.isArray(body.tags)) updates.tags = body.tags as string[];
  if (typeof body.owner === "string") updates.owner = body.owner;
  if (typeof body.note === "string") updates.note = body.note;

  try {
    updates.author = (await getSettings()).displayName;
    await updatePage(id, updates);
    const page = await getPageFull(id);
    return NextResponse.json({ page });
  } catch (e) {
    return errorResponse(e, "Failed to update page");
  }
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const ok = await deletePage(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "Failed to delete page");
  }
}

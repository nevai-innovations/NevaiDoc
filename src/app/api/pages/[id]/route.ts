import { NextRequest, NextResponse } from "next/server";
import { getPage, updatePage, deletePage } from "@/lib/pages";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const page = await getPage(id);
  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ page });
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));

  const updates: { title?: string; content?: string; parentId?: string | null; order?: number } = {};
  if (typeof body.title === "string") updates.title = body.title;
  if (typeof body.content === "string") updates.content = body.content;
  if (body.parentId !== undefined) updates.parentId = body.parentId === null ? null : String(body.parentId);
  if (typeof body.order === "number") updates.order = body.order;

  try {
    const page = await updatePage(id, updates);
    return NextResponse.json({ page });
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (e instanceof Error && e.message === "INVALID_PARENT") {
      return NextResponse.json(
        { error: "Cannot move a page under itself or a descendant" },
        { status: 400 }
      );
    }
    if (e instanceof Error && e.message === "PARENT_NOT_FOUND") {
      return NextResponse.json({ error: "Parent page not found" }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to update page" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const ok = await deletePage(id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
